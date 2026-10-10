import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { previewCsv } from '../../src/lib/server/csv.ts';
import { buildImportPlan } from '../../src/lib/server/imports.ts';
import { importResolutionResultSchema, importResolutionStateSchema } from '../../src/lib/contracts/imports.ts';
import { mapCashbookRow } from '../../src/lib/server/cashbook-mapping.ts';
import { calculateCashSummary } from '../../src/lib/server/summary.ts';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const nextRequestId = '20000000-0000-4000-8000-000000000002';
const correction = { date: '2026-10-10', description: 'Recovered', direction: 'out', amountMinor: '9007199254740993', currency: 'PKR', reference: null };
async function fixture(run: (db: PGlite, owner: (subject: string) => Promise<void>, register: (text: string) => Promise<string>) => Promise<void>) {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth; create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
      $$; grant usage on schema auth to authenticated, anon;
      grant execute on function auth.jwt() to authenticated, anon;
      create schema storage;
      create table storage.buckets(id text primary key, name text not null, public boolean not null);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated,anon;
      grant select,insert,update,delete on storage.objects to authenticated;
    `);
    for (const name of ['202610100001_workspace_spine.sql','202610100002_csv_imports.sql','202610100003_cashbook_review.sql','202610100004_import_resolution.sql','202610100005_review_conflict.sql']) {
      await db.exec(await readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8'));
    }
    async function owner(subject: string) {
      await db.exec('reset role');
      await db.query('select set_config($1,$2,false)', ['request.jwt.claims',JSON.stringify({sub:subject})]);
      await db.exec('set role authenticated');
    }
    await owner('user_A');
    await db.query('insert into public.workspaces(id,owner_subject,business_name) values ($1,$2,$3)', [workspaceId,'user_A','Synthetic resolution validation']);
    async function register(text: string) {
      const preview = previewCsv(text);
      await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['raqam-sources',`${workspaceId}/${preview.contentHash}.csv`]);
      const { rows } = await db.query<{ result: { importId: string } }>('select public.register_csv_import($1,$2,$3,$4::jsonb) as result', [workspaceId,preview.contentHash,'synthetic.csv',JSON.stringify(preview)]);
      const id = rows[0]!.result.importId;
      await db.query('select public.confirm_csv_import($1,$2::jsonb)', [id,JSON.stringify(buildImportPlan(preview,{}))]);
      return id;
    }
    await run(db,owner,register);
  } finally { await db.close(); }
}
async function resolve(db: PGlite, id: string, key: string, rows: unknown) {
  const result = await db.query<{ result: unknown }>('select public.resolve_csv_import_rows($1,$2,$3::jsonb) as result', [id,key,JSON.stringify(rows)]);
  return importResolutionResultSchema.parse(result.rows[0]!.result);
}
async function state(db: PGlite, id: string) {
  const result = await db.query<{ result: unknown }>('select public.read_import_resolution_state($1) as result', [id]);
  return importResolutionStateSchema.parse(result.rows[0]!.result);
}

test('confirmed unresolved rows resolve exactly once, preserve originals and retries, and update exact cash scope', async () => {
  await fixture(async (db,_owner,register) => {
    const id = await register('amount,date,direction,description,reference\n10.05,2026-10-10,out,Known,K\n?,2026-10-10,out,,\n?,2026-10-10,out,Rejected,\n?,2026-10-10,out,Zero,\n');
    assert.equal((await state(db,id)).unresolvedCount,3);
    const original = (await db.query('select preview,confirmation_result,confirmation_plan from public.imports where source_id=$1',[id])).rows;
    const rows = [{rowNumber:3,action:'correct',transaction:correction},{rowNumber:4,action:'reject'}];
    const receipt = await resolve(db,id,requestId,rows);
    assert.equal(receipt.correctedCount,1); assert.equal(receipt.rejectedCount,1); assert.equal(receipt.remainingUnresolvedCount,1);
    assert.deepEqual(await resolve(db,id,requestId,rows),{...receipt,duplicate:true});
    assert.deepEqual((await db.query('select preview,confirmation_result,confirmation_plan from public.imports where source_id=$1',[id])).rows,original,'original confirmation is an immutable receipt, not current counts');
    const stored = await db.query<{ original_description: string; original_values: string[]; amount_minor: string }>('select original_description,original_values,amount_minor::text from public.transactions where id=$1',[receipt.transactionIds[0]]);
    assert.equal(stored.rows[0]!.original_description,''); assert.equal(stored.rows[0]!.original_values[0],'?'); assert.equal(stored.rows[0]!.amount_minor,'9007199254740993');
    await db.query('select public.review_cashbook_transaction($1,$2,$3::jsonb)',[receipt.transactionIds[0],0,JSON.stringify({description:'Reviewed source',category:'travel'})]);
    await assert.rejects(() => db.query('select public.review_cashbook_transaction($1,$2,$3::jsonb)',
      [receipt.transactionIds[0],0,JSON.stringify({category:'software_services'})]),
      (error: unknown) => (error as { code?: string }).code === 'PT409', 'stale application decisions must not request a transaction retry');
    await resolve(db,id,requestId,rows);
    assert.deepEqual((await db.query('select description,category,review_version from public.transactions where id=$1',[receipt.transactionIds[0]])).rows,[{description:'Reviewed source',category:'travel',review_version:1}]);
    await assert.rejects(()=>resolve(db,id,requestId,[{rowNumber:5,action:'reject'}]),
      (error: unknown) => (error as { code?: string }).code === 'PT409');
    for (const rowNumber of [2,3,4]) await assert.rejects(()=>resolve(db,id,nextRequestId,[{rowNumber,action:'reject'}]),/Row already reviewed/);
    const explicitZero = await resolve(db,id,nextRequestId,[{rowNumber:5,action:'correct',transaction:{...correction,amountMinor:'0',description:'Known zero'}}]);
    assert.equal(explicitZero.remainingUnresolvedCount,0);
    const effective = await state(db,id); assert.equal(effective.importedCount,3); assert.equal(effective.rejectedCount,1); assert.equal(effective.unresolvedCount,0);
    const snapshot = (await db.query<{ result: { records: Record<string,unknown>[]; unresolvedImportRowCount: number } }>('select public.read_cashbook_snapshot($1) as result',[workspaceId])).rows[0]!.result;
    const totals = calculateCashSummary(snapshot.records.map(mapCashbookRow),workspaceId,snapshot.unresolvedImportRowCount);
    assert.equal(totals.outflowMinor,'9007199254741998'); assert.equal(totals.unresolvedImportRowCount,0); assert.equal(totals.categories.travel?.outflowMinor,'9007199254740993');
    assert.deepEqual((await db.query('select actor_subject,action from public.review_decisions where target_id=$1 and source_row=3',[id])).rows,[{actor_subject:'user_A',action:'correct'}]);
    const checks = await db.query<{ passed: boolean }>(await readFile(new URL('../../scripts/check-import-resolution.sql',import.meta.url),'utf8'));
    assert.equal(checks.rows.length,5); assert.ok(checks.rows.every(check=>check.passed));
  });
});
test('resolution denies forged scope/direct writes and rolls back the entire decision on malformed cash', async () => {
  await fixture(async (db,owner,register) => {
    const id = await register('date,description,direction,amount\n2026-10-10,Unknown A,out,?\n2026-10-10,Unknown B,out,?\n');
    const invalid = [{rowNumber:2,action:'correct',transaction:correction},{rowNumber:3,action:'correct',transaction:{...correction,amountMinor:'9223372036854775808'}}];
    await assert.rejects(()=>resolve(db,id,requestId,invalid));
    assert.equal((await state(db,id)).unresolvedCount,2);
    for (const table of ['transactions','review_decisions','import_resolution_requests']) assert.equal((await db.query<{ count: number }>(`select count(*)::integer as count from public.${table}`)).rows[0]!.count,0);
    for (const transaction of [{...correction,currency:'USD'},{...correction,date:'2026-02-30'},{...correction,ownerSubject:'forged'},{...correction,amountMinor:'unknown'},{...correction,description:'\t\n'}]) {
      await assert.rejects(()=>resolve(db,id,requestId,[{rowNumber:2,action:'correct',transaction}]));
    }
    await assert.rejects(()=>resolve(db,id,requestId,[{rowNumber:2,action:'reject',transaction:null}]));
    await assert.rejects(()=>resolve(db,id,requestId,[{rowNumber:999,action:'reject'}]),/Row outside import/);
    await assert.rejects(()=>resolve(db,id,requestId,[{rowNumber:2,action:'reject'},{rowNumber:2,action:'reject'}]),/Each row needs one decision/);
    const receipt = await resolve(db,id,requestId,[{rowNumber:2,action:'correct',transaction:{...correction,description:"' OR 1=1 --"}}]);
    assert.equal((await db.query<{ description: string }>('select description from public.transactions where id=$1',[receipt.transactionIds[0]])).rows[0]!.description,"' OR 1=1 --",'SQL-like source text is stored as data');
    await assert.rejects(()=>db.query('insert into public.import_resolution_requests default values'),/permission denied/);
    await assert.rejects(()=>db.query('update public.import_resolution_requests set receipt=$1::jsonb',['{}']),/permission denied/);
    await assert.rejects(()=>db.query('delete from public.import_resolution_requests'),/permission denied/);
    await owner('user_B');
    assert.deepEqual((await db.query('select request_id from public.import_resolution_requests')).rows,[]);
    assert.equal((await db.query<{ result: unknown }>('select public.read_import_resolution_state($1) as result',[id])).rows[0]!.result,null);
    await assert.rejects(()=>resolve(db,id,requestId,[{rowNumber:2,action:'correct',transaction:correction}]),/Import not found/);
    await owner(''); await assert.rejects(()=>resolve(db,id,nextRequestId,[{rowNumber:3,action:'reject'}]),/Import not found/);
    await db.exec('reset role; set role anon');
    await assert.rejects(()=>resolve(db,id,nextRequestId,[{rowNumber:3,action:'reject'}]),/permission denied/);
    await assert.rejects(()=>state(db,id),/permission denied/);
  });
});
test('workspace cap rollback leaves resolutions retriable and rejection never creates cash', async () => {
  await fixture(async (db,_owner,register) => {
    await register('date,description,direction,amount\n'+'2026-10-10,Valid,out,1\n'.repeat(49));
    const id = await register('date,description,direction,amount\n2026-10-10,Unknown A,out,?\n2026-10-10,Unknown B,out,?\n');
    const cash = {...correction,amountMinor:'1005'};
    await assert.rejects(()=>resolve(db,id,requestId,[{rowNumber:2,action:'correct',transaction:cash},{rowNumber:3,action:'correct',transaction:cash}]),/transaction limit/);
    assert.equal((await state(db,id)).unresolvedCount,2); assert.equal((await db.query<{ count: number }>('select count(*)::integer as count from public.transactions')).rows[0]!.count,49);
    assert.equal((await db.query<{ count: number }>('select count(*)::integer as count from public.import_resolution_requests')).rows[0]!.count,0);
    const receipt = await resolve(db,id,requestId,[{rowNumber:2,action:'correct',transaction:cash},{rowNumber:3,action:'reject'}]);
    assert.equal(receipt.correctedCount,1); assert.equal(receipt.remainingUnresolvedCount,0);
    assert.equal((await db.query<{ count: number }>('select count(*)::integer as count from public.transactions')).rows[0]!.count,50);
  });
});
