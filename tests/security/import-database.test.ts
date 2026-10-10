import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { previewCsv, type CsvPreview } from '../../src/lib/server/csv.ts';
import { buildImportPlan } from '../../src/lib/server/imports.ts';
import { mapCashbookRow } from '../../src/lib/server/cashbook-mapping.ts';
import { calculateCashSummary } from '../../src/lib/server/summary.ts';
import { exportCashbook } from '../../src/lib/server/export.ts';

// Real embedded PostgreSQL, simulated JWT/Storage. Not live cloud/concurrency evidence.
test('CSV confirmation is owner-scoped, atomic, exact, audited and retry-safe', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated nologin nobypassrls; create role anon nologin nobypassrls;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as
        $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      grant usage on schema public, auth to authenticated, anon;
      create schema storage;
      create table storage.buckets (id text primary key, name text not null, public boolean not null);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated, anon;
      grant select, insert, update, delete on storage.objects to authenticated;
    `);
    for (const filename of ['202610100001_workspace_spine.sql', '202610100002_csv_imports.sql', '202610100003_cashbook_review.sql']) {
      await db.exec(await readFile(new URL('../../supabase/migrations/' + filename, import.meta.url), 'utf8'));
    }
    const workspaceId = '10000000-0000-4000-8000-000000000001';
    async function asOwner(subject: string) {
      await db.exec('reset role');
      await db.query('select set_config($1,$2,false)', ['request.jwt.claims', JSON.stringify({ sub: subject })]);
      await db.exec('set role authenticated');
    }
    async function register(preview: CsvPreview) {
      await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['raqam-sources', `${workspaceId}/${preview.contentHash}.csv`]);
      return (await db.query<{ result: { importId: string; duplicate: boolean } }>(
        'select public.register_csv_import($1,$2,$3,$4::jsonb) as result',
        [workspaceId, preview.contentHash, 'synthetic.csv', JSON.stringify(preview)],
      )).rows[0]!.result;
    }
    async function confirm(importId: string, rows: unknown) {
      return (await db.query<{ result: { importedCount: number; rejectedCount: number; unresolvedCount: number; duplicate: boolean } }>(
        'select public.confirm_csv_import($1,$2::jsonb) as result', [importId, JSON.stringify(rows)],
      )).rows[0]!.result;
    }
    async function snapshot() {
      return (await db.query<{ result: { records: Record<string, unknown>[]; unresolvedImportRowCount: number } }>(
        'select public.read_cashbook_snapshot($1) as result', [workspaceId],
      )).rows[0]!.result;
    }
    async function review(id: string, version: number, patch: unknown) {
      return (await db.query<{ result: { transaction: Record<string, unknown>; reviewVersion: number } }>(
        'select public.review_cashbook_transaction($1,$2,$3::jsonb) as result', [id, version, JSON.stringify(patch)],
      )).rows[0]!.result;
    }
    const preview = previewCsv('amount,date,direction,description\n10.05,2026-10-10,out,A\n10.05,2026-10-10,out,A\n?,2026-10-10,out,\n?,2026-10-10,out,Unknown\n?,2026-10-10,out,Rejected\n');
    await asOwner('user_A');
    await db.query('insert into public.workspaces(id,owner_subject,business_name) values ($1,$2,$3)', [workspaceId, 'user_A', 'Synthetic']);
    const batch = await register(preview);
    assert.equal(batch.duplicate, false);
    assert.equal((await db.query('select id from public.transactions')).rows.length, 0);
    assert.equal((await snapshot()).unresolvedImportRowCount, 3, 'pending invalid rows remain visible');
    const again = (await db.query<{ result: unknown }>('select public.register_csv_import($1,$2,$3,$4::jsonb) as result', [workspaceId, preview.contentHash, 'renamed.csv', JSON.stringify(preview)])).rows[0]!.result;
    assert.deepEqual(again, { importId: batch.importId, duplicate: true });
    await asOwner('user_B');
    assert.deepEqual((await db.query('select source_id from public.imports')).rows, []);
    await assert.rejects(() => confirm(batch.importId, []), /Import not found/);
    await assert.rejects(() => db.query('select public.register_csv_import($1,$2,$3,$4::jsonb)', [workspaceId, preview.contentHash, 'forged.csv', JSON.stringify(preview)]), /Workspace not found/);
    await asOwner(''); await assert.rejects(() => confirm(batch.importId, []), /Import not found/);
    await db.exec('reset role; set role anon');
    await assert.rejects(() => confirm(batch.importId, []), /permission denied/);
    await asOwner('user_A');

    const plan = buildImportPlan(preview, { rows: [
      { rowNumber: 4, action: 'correct', transaction: { date: '2026-10-10', description: 'Recovered', direction: 'out', amountMinor: '9007199254740993', currency: 'PKR', reference: null } },
      { rowNumber: 6, action: 'reject' },
    ] });
    const broken = structuredClone(plan);
    broken[2] = { ...broken[2]!, action: 'correct', transaction: { ...plan[2]!.transaction!, amountMinor: '9223372036854775808' } };
    await assert.rejects(() => confirm(batch.importId, broken));
    assert.equal((await db.query('select id from public.transactions')).rows.length, 0, 'one invalid row rolls back all preceding inserts');
    assert.equal((await db.query('select id from public.review_decisions')).rows.length, 0);
    assert.deepEqual((await db.query('select status from public.imports')).rows, [{ status: 'pending' }]);
    await assert.rejects(() => confirm(batch.importId, plan.slice(1)), /Every row/);
    await assert.rejects(() => confirm(batch.importId, [plan[0], plan[0], ...plan.slice(2)]), /Every row/);
    const dishonest = structuredClone(plan);
    dishonest[0] = { rowNumber: 2, action: 'unresolved', transaction: null };
    await assert.rejects(() => confirm(batch.importId, dishonest), /silently disappear/);

    const receipt = await confirm(batch.importId, plan);
    assert.deepEqual([receipt.importedCount, receipt.rejectedCount, receipt.unresolvedCount, receipt.duplicate], [3, 1, 1, false]);
    assert.equal((await confirm(batch.importId, [])).duplicate, true);
    assert.deepEqual((await db.query('select amount_minor from public.cashbook_records order by source_row')).rows,
      [{ amount_minor: '1005' }, { amount_minor: '1005' }, { amount_minor: '9007199254740993' }]);
    assert.deepEqual((await db.query('select original_description,description,original_values from public.transactions where source_row=4')).rows,
      [{ original_description: '', description: 'Recovered', original_values: ['?', '2026-10-10', 'out', ''] }]);
    assert.equal((await db.query('select id from public.review_decisions')).rows.length, 4);
    assert.deepEqual((await db.query('select actor_subject,action from public.review_decisions where source_row=4')).rows, [{ actor_subject: 'user_A', action: 'correct' }]);
    const first = (await db.query<{ id: string }>('select id from public.transactions where source_row=2')).rows[0]!.id;
    const edited = await review(first, 0, { description: 'Reviewed source', category: 'travel' });
    assert.equal(edited.reviewVersion, 1);
    assert.equal(edited.transaction.original_description, 'A');
    assert.equal(edited.transaction.amount_minor, '1005');
    assert.equal(edited.transaction.category_status, 'accepted');
    await assert.rejects(() => review(first, 0, { category: 'software_services' }), /version changed/);
    for (const patch of [{ amountMinor: '0' }, { description: '\t\n' }, { category: 'invented' }, {}]) {
      await assert.rejects(() => review(first, 1, patch));
    }
    assert.equal((await review(first, 1, { category: 'travel' })).reviewVersion, 1, 'unchanged saves do not invent history');
    const book = await snapshot();
    assert.equal(book.unresolvedImportRowCount, 1);
    const records = book.records.map(mapCashbookRow);
    const summary = calculateCashSummary(records, workspaceId, book.unresolvedImportRowCount);
    assert.equal(summary.outflowMinor, '9007199254743003');
    assert.equal(summary.categories.travel?.outflowMinor, '1005');
    assert.equal(summary.unreviewed.outflowMinor, '9007199254741998');
    const exported = exportCashbook(records, workspaceId);
    assert.match(exported, /90071992547409\.93/);
    assert.match(exported, /Reviewed source,out,10\.05,PKR,,travel,accepted,unmatched/);
    assert.equal((await review(first, 1, { category: null })).reviewVersion, 2);
    assert.equal((await review(first, 2, { description: '=SUM(A1:A2)' })).reviewVersion, 3);
    assert.match(exportCashbook((await snapshot()).records.map(mapCashbookRow), workspaceId), /'=SUM\(A1:A2\)/);
    assert.deepEqual((await db.query('select actor_subject,version,previous_value->>\'category\' as previous,current_value->>\'categoryStatus\' as status from public.transaction_reviews where version=2')).rows,
      [{ actor_subject: 'user_A', version: 2, previous: 'travel', status: 'needs_review' }]);
    assert.equal((await confirm(batch.importId, [])).duplicate, true);
    assert.equal((await db.query<{ description: string }>('select description from public.transactions where id=$1', [first])).rows[0]!.description, '=SUM(A1:A2)', 're-import never overwrites reviewed edits');
    await assert.rejects(() => db.query('delete from public.transactions where id=$1', [first]), /permission denied/);
    await assert.rejects(() => db.query('delete from public.transaction_reviews'), /permission denied/);
    await assert.rejects(() => db.query('update public.transactions set description=$1 where id=$2', ['forged', first]), /permission denied/);
    await assert.rejects(() => db.query('update public.imports set status=$1', ['pending']), /permission denied/);
    await assert.rejects(() => db.query('insert into public.transactions default values'), /permission denied/);
    await assert.rejects(() => db.query('insert into public.imports(source_id,workspace_id,preview,status) values ($1,$2,$3::jsonb,$4)', [batch.importId, workspaceId, JSON.stringify(preview), 'confirmed']), /permission denied/);
    await assert.rejects(() => db.query('delete from public.review_decisions'), /permission denied/);
    await assert.rejects(() => db.query('update public.review_decisions set actor_subject=$1', ['user_B']), /permission denied/);
    await asOwner('user_B');
    assert.deepEqual((await db.query('select id from public.review_decisions')).rows, []);
    assert.deepEqual((await db.query('select id from public.transaction_reviews')).rows, []);
    assert.deepEqual(await snapshot(), { records: [], unresolvedImportRowCount: 0 });
    await assert.rejects(() => review(first, 3, { category: 'travel' }), /Transaction not found/);
    await asOwner('');
    await assert.rejects(() => review(first, 3, { category: 'travel' }), /Transaction not found/);
    await db.exec('reset role; set role anon');
    await assert.rejects(() => snapshot(), /permission denied/);
    await assert.rejects(() => review(first, 3, { category: 'travel' }), /permission denied/);

    await asOwner('user_A');
    const overCap = previewCsv('date,description,direction,amount\n' + '2026-10-10,More,out,1\n'.repeat(48));
    const capBatch = await register(overCap);
    await assert.rejects(() => confirm(capBatch.importId, buildImportPlan(overCap, {})), /transaction limit/);
    assert.equal((await db.query('select id from public.transactions')).rows.length, 3, 'cap failure rolls back the whole batch');
    assert.deepEqual((await db.query('select status from public.imports where source_id=$1', [capBatch.importId])).rows, [{ status: 'pending' }]);
    await db.exec('reset role');
    const schemaChecks = await db.query<{ check_name: string; passed: boolean }>(
      await readFile(new URL('../../scripts/check-database.sql', import.meta.url), 'utf8'),
    );
    assert.equal(schemaChecks.rows.length, 20);
    for (const check of schemaChecks.rows) assert.equal(check.passed, true, check.check_name);
  } finally { await db.close(); }
});
