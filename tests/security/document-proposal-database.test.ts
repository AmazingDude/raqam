import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { documentRegistrationResultSchema, documentMutationResultSchema, extractionReservationResultSchema } from '../../src/lib/contracts/documents.ts';
import { proposalBatchResultSchema } from '../../src/lib/contracts/proposals.ts';

const wA = '10000000-0000-4000-8000-000000000001', wB = '10000000-0000-4000-8000-000000000002';
const sA = '30000000-0000-4000-8000-000000000001', sB = '30000000-0000-4000-8000-000000000002';
const sCsv = '30000000-0000-4000-8000-000000000003', tx = '40000000-0000-4000-8000-000000000001';
const sPending = '30000000-0000-4000-8000-000000000004', sFailed = '30000000-0000-4000-8000-000000000005';
const key = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const unknowns = { counterparty: null, date: null, totalMinor: null, currency: null, reference: null };
const reviewed = { ...unknowns, date: '2026-10-10', totalMinor: '10005', currency: 'PKR' };
const provenance = { modelVersion: 'synthetic-model', promptVersion: 'synthetic-v1', schemaVersion: 'v1' };
const code = (expected: string) => (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === expected;

async function fixture(run: (db: PGlite, owner: (subject: string) => Promise<void>) => Promise<void>) {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb; $$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.jwt() to authenticated,anon;
      create schema storage; create table storage.buckets(id text primary key,name text not null,public boolean not null);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
      alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon;
      grant select,insert,update,delete on storage.objects to authenticated;`);
    for (const name of ['202610100001_workspace_spine.sql', '202610100002_csv_imports.sql', '202610100003_cashbook_review.sql',
      '202610100004_import_resolution.sql', '202610100005_review_conflict.sql', '202610100006_documents_proposals.sql',
      '202610100007_proposal_reviews_matches.sql', '202610100008_receipt_extraction_context.sql',
      '202610100009_require_complete_receipt_source.sql']) {
      await db.exec(await readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8'));
    }
    const readiness = await db.exec(await readFile(new URL('../../scripts/check-document-proposals.sql', import.meta.url), 'utf8'));
    assert.ok(readiness.every(result => result.rows.every(row => row.installed === true)));
    assert.ok(readiness[0]!.rows.every(row => row.owner_read_grant === true && row.any_direct_write_grant === false));
    // Explicit synthetic seed under the fixture administrator, not an application write path.
    await db.query('insert into public.workspaces(id,owner_subject,business_name) values($1,$2,$3),($4,$5,$6)', [wA, 'user_A', 'Synthetic A', wB, 'user_B', 'Synthetic B']);
    for (const [id, wid, hash, type, status] of [
      [sA, wA, 'a', 'receipt_image', 'complete'], [sB, wB, 'b', 'receipt_image', 'complete'],
      [sCsv, wA, 'c', 'transaction_csv', 'complete'], [sPending, wA, 'd', 'receipt_image', 'pending'],
      [sFailed, wA, 'e', 'receipt_image', 'failed'],
    ] as const) {
      await db.query('insert into public.sources(id,workspace_id,source_type,content_hash,storage_path,original_name,status) values($1,$2,$3,$4,$5,$6,$7)',
        [id, wid, type, hash.repeat(64), `${wid}/${hash}.png`, 'synthetic', status]);
    }
    await db.query(`insert into public.transactions(id,workspace_id,source_id,source_row,original_values,date,original_description,description,direction,amount_minor)
      values($1,$2,$3,2,'["synthetic"]','2026-10-10','Synthetic','Synthetic','out',10005)`, [tx, wA, sCsv]);
    const owner = async (subject: string) => {
      await db.exec('reset role');
      await db.query('select set_config($1,$2,false)', ['request.jwt.claims', JSON.stringify({ sub: subject })]);
      await db.exec('set role authenticated');
    };
    await owner('user_A');
    await run(db, owner);
  } finally { await db.close(); }
}
async function register(db: PGlite, source = sA) {
  const result = await db.query<{ result: unknown }>('select public.register_supporting_document($1) as result', [source]);
  return documentRegistrationResultSchema.parse(result.rows[0]!.result);
}
async function mutate(db: PGlite, kind: 'review' | 'extraction', id: string, request: string, version: number, value: unknown) {
  if (kind === 'extraction') await db.query('select public.reserve_document_extraction($1,$2,$3,$4::jsonb)', [id, request, version, JSON.stringify(provenance)]);
  const rpc = kind === 'review' ? 'review_supporting_document' : 'save_document_extraction';
  const result = await db.query<{ result: unknown }>(`select public.${rpc}($1,$2,$3,$4::jsonb) as result`, [id, request, version, JSON.stringify(value)]);
  return documentMutationResultSchema.parse(result.rows[0]!.result);
}
async function propose(db: PGlite, kind: 'category' | 'match', request: string, proposals: unknown) {
  const result = await db.query<{ result: unknown }>(`select public.register_${kind}_proposals($1,$2::jsonb,$3::jsonb) as result`,
    [request, JSON.stringify(provenance), JSON.stringify(proposals)]);
  return proposalBatchResultSchema.parse(result.rows[0]!.result);
}

test('document RPCs preserve unknowns/originals, reject invalid acceptance and stale retries, and never create cash', async () => {
  await fixture(async db => {
    const first = await register(db), id = first.record.document.id;
    assert.equal(first.duplicate, false);
    assert.deepEqual(first.record.document.extractedFields, unknowns);
    assert.equal((await register(db)).duplicate, true);
    const failed = await mutate(db, 'extraction', id, key(1), 0, { status: 'failed', reason: 'provider_timeout' });
    assert.equal(failed.record.extractionFailure, 'provider_timeout');
    const outcome = { status: 'complete', fields: unknowns, provenance };
    const extracted = await mutate(db, 'extraction', id, key(2), 1, outcome);
    assert.equal(extracted.record.reviewVersion, 2);
    for (const invalid of [{ ...reviewed, currency: null }, { ...reviewed, totalMinor: null }, { ...reviewed, date: '2026-02-30' },
      { ...reviewed, totalMinor: '9223372036854775808' }, { ...reviewed, totalMinor: 0 }, { ...reviewed, settled: true }]) {
      await assert.rejects(mutate(db, 'review', id, key(3), 2, { action: 'accept', fields: invalid }), code('22023'));
    }
    const accept = { action: 'accept', fields: { ...reviewed, totalMinor: '9007199254740993' } };
    const accepted = await mutate(db, 'review', id, key(3), 2, accept);
    assert.equal(accepted.record.document.correctedFields?.totalMinor, '9007199254740993');
    await assert.rejects(mutate(db, 'extraction', id, key(4), 3, outcome), code('PT409'));
    await assert.rejects(mutate(db, 'review', id, key(4), 1, accept), code('PT409'));
    await assert.rejects(mutate(db, 'review', id, key(3), 2, { action: 'reject' }), code('PT409'));
    await mutate(db, 'review', id, key(4), 3, { action: 'correct', fields: { ...reviewed, totalMinor: null } });
    const replay = await mutate(db, 'review', id, key(3), 2, accept);
    assert.equal(replay.duplicate, true);
    assert.deepEqual(replay.record, accepted.record); // saved receipt, not a replayed update
    const current = (await db.query<{ extracted_fields: unknown; corrected_fields: typeof reviewed; review_status: string }>('select extracted_fields,corrected_fields,review_status from public.supporting_documents')).rows[0]!;
    assert.deepEqual(current.extracted_fields, unknowns);
    assert.equal(current.corrected_fields.totalMinor, null);
    assert.equal(current.review_status, 'needs_review');
    assert.equal((await db.query('select * from public.document_history')).rows.length, 4);
    assert.deepEqual((await db.query('select amount_minor::text as amount from public.transactions')).rows, [{ amount: '10005' }]);
  });
});

test('document/proposal RPCs and tables deny foreign owners, direct writes, private helpers and anonymous execution', async () => {
  await fixture(async (db, owner) => {
    const id = (await register(db)).record.document.id;
    await mutate(db, 'review', id, key(1), 0, { action: 'accept', fields: reviewed });
    await assert.rejects(register(db, sCsv), code('22023'));
    await assert.rejects(register(db, sB), code('P0002'));
    await owner('user_B');
    for (const table of ['supporting_documents', 'document_history', 'document_operations', 'ai_proposals', 'proposal_batches']) {
      assert.deepEqual((await db.query(`select * from public.${table}`)).rows, []);
      await assert.rejects(db.query(`delete from public.${table}`), code('42501'));
    }
    await assert.rejects(register(db, sA), code('P0002'));
    await assert.rejects(mutate(db, 'review', id, key(1), 0, { action: 'accept', fields: reviewed }), code('P0002'));
    await assert.rejects(mutate(db, 'extraction', id, key(2), 1, { status: 'failed', reason: 'provider_timeout' }), code('P0002'));
    await assert.rejects(propose(db, 'category', key(3), [{ transactionId: tx, transactionVersion: 0, category: 'travel', rationale: 'Synthetic', status: 'proposed' }]), code('P0002'));
    await assert.rejects(db.query('select public.raqam_document_record($1)', [id]), code('42501'));
    await assert.rejects(db.query('select public.raqam_mutate_document($1,$2,$3,$4,$5::jsonb)', ['review', id, key(3), 1, '{"action":"reject"}']), code('42501'));
    await assert.rejects(db.query("update public.supporting_documents set review_status = 'accepted'"), code('42501'));
    await assert.rejects(db.query('insert into public.ai_proposals default values'), code('42501'));
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select public.register_supporting_document($1)', [sA]), code('42501'));
    await assert.rejects(db.query('select * from public.supporting_documents'), code('42501'));
  });
});

test('registration RPC rejects pending and failed receipt sources even when called directly', async () => {
  await fixture(async db => {
    await assert.rejects(register(db, sPending), code('22023'));
    await assert.rejects(register(db, sFailed), code('22023'));
    assert.deepEqual((await db.query('select id from public.supporting_documents order by id')).rows, []);
    assert.equal((await db.query<{ count: number }>('select count(*)::int as count from public.transactions')).rows[0]!.count, 1);
  });
});

test('durable extraction reservations suppress duplicate starts, expire safely, and fence late or mismatched completions', async () => {
  await fixture(async db => {
    const id = (await register(db)).record.document.id;
    const reserve = async (request: string, version = 0) => {
      const result = await db.query<{ result: unknown }>('select public.reserve_document_extraction($1,$2,$3,$4::jsonb) as result',
        [id, request, version, JSON.stringify(provenance)]);
      return extractionReservationResultSchema.parse(result.rows[0]!.result);
    };
    const save = async (request: string, value: unknown) => db.query('select public.save_document_extraction($1,$2,$3,$4::jsonb)', [id, request, 0, JSON.stringify(value)]);
    assert.equal((await reserve(key(1))).state, 'reserved');
    assert.equal((await reserve(key(1))).state, 'busy');
    assert.equal((await reserve(key(2))).state, 'busy');
    const outcome = { status: 'complete', fields: unknowns, provenance };
    await assert.rejects(save(key(2), outcome), code('PT409'));
    // Fixture-only clock simulation: do not wait 90 seconds or claim managed-client concurrency.
    await db.exec("reset role; update public.document_extraction_jobs set expires_at = clock_timestamp() - interval '1 second'; set role authenticated");
    assert.equal((await reserve(key(2))).state, 'reserved');
    await assert.rejects(save(key(1), outcome), code('PT409'));
    await assert.rejects(reserve(key(1)), code('PT409'));
    await assert.rejects(save(key(2), { ...outcome, provenance: { ...provenance, modelVersion: 'different' } }), code('PT409'));
    await save(key(2), outcome);
    assert.equal((await reserve(key(2))).state, 'cached');
    assert.equal((await reserve(key(3), 1)).state, 'cached');
    assert.equal((await db.query('select * from public.document_history')).rows.length, 1);
  });
});

test('proposal batches are scoped, atomic, versioned, retry-safe and separate from accepted categories or cash', async () => {
  await fixture(async (db, owner) => {
    const doc = (await register(db)).record.document.id;
    const category = { transactionId: tx, transactionVersion: 0, category: 'travel', rationale: 'Synthetic', status: 'proposed' };
    const first = await propose(db, 'category', key(1), [category]);
    assert.equal(first.items[0]?.status, 'proposed');
    assert.deepEqual((await db.query('select category from public.transactions')).rows, [{ category: null }]);
    assert.equal((await propose(db, 'category', key(1), [category])).duplicate, true);
    await assert.rejects(propose(db, 'category', key(1), [{ ...category, category: 'uncategorized' }]), code('PT409'));
    for (const invalid of [{ ...category, status: 'accepted' }, { ...category, ownerSubject: 'forged' },
      { ...category, transactionVersion: 1 }, { ...category, transactionId: sB }]) {
      await assert.rejects(propose(db, 'category', key(2), [category, invalid]));
      assert.equal((await db.query('select * from public.ai_proposals')).rows.length, 1); // whole batch rolled back
    }
    await assert.rejects(propose(db, 'category', key(2), [category, category]), code('22023'));
    const match = { transactionId: tx, transactionVersion: 0, documentId: doc, documentVersion: 0, rationale: 'Synthetic match', status: 'needs_review' };
    await assert.rejects(propose(db, 'match', key(3), [match]), code('PT409'));
    await mutate(db, 'review', doc, key(4), 0, { action: 'accept', fields: reviewed });
    const matched = await propose(db, 'match', key(3), [{ ...match, documentVersion: 1 }]);
    assert.equal(matched.items[0]?.suggestion.kind, 'match');
    await owner('user_B');
    const foreignDoc = (await register(db, sB)).record.document.id;
    await owner('user_A');
    await assert.rejects(propose(db, 'match', key(5), [{ ...match, documentId: foreignDoc }]), code('P0002'));
    await db.query('select public.review_cashbook_transaction($1,$2,$3::jsonb)', [tx, 0, '{"category":"travel"}']);
    assert.equal((await propose(db, 'category', key(1), [category])).duplicate, true); // immutable original receipt
    await assert.rejects(propose(db, 'category', key(6), [{ ...category, transactionVersion: 1 }]), code('PT409'));
    assert.deepEqual((await db.query('select amount_minor::text as amount,category from public.transactions')).rows, [{ amount: '10005', category: 'travel' }]);
  });
});
