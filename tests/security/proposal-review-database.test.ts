import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { proposalReviewResultSchema } from '../../src/lib/contracts/proposals.ts';
import { mapCashbookRow } from '../../src/lib/server/cashbook-mapping.ts';
import { calculateCashSummary } from '../../src/lib/server/summary.ts';
import { exportCashbook } from '../../src/lib/server/export.ts';

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const wA = id(1), wB = id(2), csv = id(3), t1 = id(4), t2 = id(5), t3 = id(6), foreign = id(7);
const provenance = { modelVersion: 'synthetic', promptVersion: 'v1', schemaVersion: 'v1' };
const fields = { counterparty: null, date: '2026-10-10', totalMinor: '10005', currency: 'PKR', reference: null };
const code = (expected: string) => (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === expected;

async function fixture(run: (db: PGlite, docs: string[], owner: (subject: string) => Promise<void>) => Promise<void>) {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.jwt() to authenticated,anon;
      create schema storage; create table storage.buckets(id text primary key,name text not null,public boolean not null);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
      alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon;
      grant select,insert,update,delete on storage.objects to authenticated;`);
    for (const name of ['202610100001_workspace_spine.sql','202610100002_csv_imports.sql','202610100003_cashbook_review.sql',
      '202610100004_import_resolution.sql','202610100005_review_conflict.sql','202610100006_documents_proposals.sql','202610100007_proposal_reviews_matches.sql']) {
      await db.exec(await readFile(new URL('../../supabase/migrations/' + name,import.meta.url),'utf8'));
    }
    const readiness = await db.exec(await readFile(new URL('../../scripts/check-proposal-reviews.sql',import.meta.url),'utf8'));
    assert.ok(readiness[0]!.rows.every(row => row.installed === true && row.owner_read_grant === true && row.any_direct_write_grant === false));
    assert.ok(readiness.slice(1).every(result => Object.values(result.rows[0]!).every(value => value === true)));
    // Synthetic fixture administrator seeds imported records; this is not an app write path.
    await db.query('insert into public.workspaces(id,owner_subject,business_name) values($1,$2,$3),($4,$5,$6)', [wA,'user_A','Synthetic A',wB,'user_B','Synthetic B']);
    for (const [source,workspace,type] of [[csv,wA,'transaction_csv'],[foreign,wB,'receipt_image'],[id(8),wA,'receipt_image'],[id(9),wA,'receipt_image']] as const) {
      await db.query('insert into public.sources(id,workspace_id,source_type,content_hash,storage_path,original_name) values($1,$2,$3,$4,$5,$6)',
        [source,workspace,type,source.replaceAll('-','').padEnd(64,'a'),`${workspace}/${source}.png`,'synthetic']);
    }
    for (const [txn,row,amount] of [[t1,2,'10005'],[t2,3,'10005'],[t3,4,'10006']] as const) {
      await db.query(`insert into public.transactions(id,workspace_id,source_id,source_row,original_values,date,original_description,description,direction,amount_minor)
        values($1,$2,$3,$4,'["synthetic"]','2026-10-10','Synthetic','Synthetic','out',$5::bigint)`, [txn,wA,csv,row,amount]);
    }
    const owner = async (subject: string) => {
      await db.exec('reset role');
      await db.query('select set_config($1,$2,false)',['request.jwt.claims',JSON.stringify({sub:subject})]);
      await db.exec('set role authenticated');
    };
    await owner('user_A');
    const docs: string[] = [];
    for (const source of [id(8),id(9)]) {
      const result = await db.query<{ result: {record: {document: {id: string}}} }>('select public.register_supporting_document($1) as result',[source]);
      const doc = result.rows[0]!.result.record.document.id;
      await db.query('select public.review_supporting_document($1,$2,0,$3::jsonb)',[doc,crypto.randomUUID(),JSON.stringify({action:'accept',fields})]);
      docs.push(doc);
    }
    await run(db,docs,owner);
  } finally { await db.close(); }
}
async function proposal(db: PGlite, txn: string, doc?: string) {
  const version = (await db.query<{review_version:number}>('select review_version from public.transactions where id=$1',[txn])).rows[0]!.review_version;
  const input = doc ? {transactionId:txn,transactionVersion:version,documentId:doc,documentVersion:1,rationale:'Synthetic evidence',status:'proposed'} :
    {transactionId:txn,transactionVersion:version,category:'travel',rationale:'Synthetic category',status:'proposed'};
  const result = await db.query<{result:{items:{id:string}[]}}>(`select public.register_${doc ? 'match' : 'category'}_proposals($1,$2::jsonb,$3::jsonb) as result`,
    [crypto.randomUUID(),JSON.stringify(provenance),JSON.stringify([input])]);
  return result.rows[0]!.result.items[0]!.id;
}
async function review(db: PGlite, prop: string, request: string, version: number, decision: unknown) {
  const result = await db.query<{result:unknown}>('select public.review_ai_proposal($1,$2,$3,$4::jsonb) as result',[prop,request,version,JSON.stringify(decision)]);
  return proposalReviewResultSchema.parse(result.rows[0]!.result);
}
async function cash(db: PGlite) {
  // Use database JSON serialization as PostgREST does; the embedded driver's native date is a JS Date.
  return (await db.query<{record:Record<string,unknown>}>('select to_jsonb(c) as record from public.cashbook_records c order by id')).rows.map(row => mapCashbookRow(row.record));
}

test('category approvals/corrections/rejection preserve exact cash, immutable receipts and both review histories', async () => {
  await fixture(async db => {
    const prop = await proposal(db,t1), key = crypto.randomUUID();
    const initial = calculateCashSummary(await cash(db),wA,0);
    const accepted = await review(db,prop,key,0,{decision:'accept'});
    assert.equal(accepted.proposal.status,'accepted');
    assert.equal((await cash(db))[0]!.category,'travel');
    await assert.rejects(review(db,prop,key,0,{decision:'reject'}),code('PT409'));
    await assert.rejects(review(db,prop,crypto.randomUUID(),0,{decision:'reject'}),code('PT409'));
    await review(db,prop,crypto.randomUUID(),1,{decision:'correct_category',category:'software_services'});
    const duplicate = await review(db,prop,key,0,{decision:'accept'});
    assert.equal(duplicate.duplicate,true);
    assert.deepEqual(duplicate.proposal,accepted.proposal);
    assert.equal((await cash(db))[0]!.category,'software_services');
    await review(db,prop,crypto.randomUUID(),2,{decision:'reject'});
    const records = await cash(db), after = calculateCashSummary(records,wA,0);
    assert.equal(records[0]!.category,null);
    assert.equal(after.netMovementMinor,initial.netMovementMinor);
    assert.equal((await db.query('select * from public.proposal_reviews')).rows.length,3);
    assert.equal((await db.query('select * from public.transaction_reviews')).rows.length,3);
    assert.equal((await db.query('select * from public.proposal_review_operations')).rows.length,3);
  });
});

test('match approval/correction/rejection is one-to-one, audited, visible in exports and prevents document edits', async () => {
  await fixture(async (db,docs) => {
    const prop = await proposal(db,t1,docs[0]), competing = await proposal(db,t2,docs[0]), otherDoc = await proposal(db,t1,docs[1]);
    assert.equal((await cash(db))[0]!.matchStatus,'proposed');
    const accepted = await review(db,prop,crypto.randomUUID(),0,{decision:'accept'});
    assert.equal(accepted.match?.transactionId,t1);
    assert.equal((await cash(db))[0]!.matchStatus,'accepted');
    assert.match(exportCashbook(await cash(db),wA),/accepted/);
    await assert.rejects(review(db,competing,crypto.randomUUID(),0,{decision:'accept'}),code('PT409'));
    await assert.rejects(review(db,otherDoc,crypto.randomUUID(),0,{decision:'accept'}),code('PT409'));
    await assert.rejects(db.query('select public.review_supporting_document($1,$2,1,$3::jsonb)',[docs[0],crypto.randomUUID(),JSON.stringify({action:'correct',fields})]),code('PT409'));
    await assert.rejects(proposal(db,t2,docs[0]),code('PT409'));
    const corrected = await review(db,prop,crypto.randomUUID(),1,{decision:'correct_match',transactionId:t2,transactionVersion:0});
    assert.equal(corrected.match?.transactionId,t2);
    assert.deepEqual(new Set(corrected.affectedTransactionIds),new Set([t1,t2]));
    const active = (await db.query<{transaction_id:string}>('select transaction_id from public.accepted_matches where active')).rows;
    assert.deepEqual(active,[{transaction_id:t2}]);
    await review(db,prop,crypto.randomUUID(),2,{decision:'reject'});
    assert.equal((await db.query('select * from public.accepted_matches where active')).rows.length,0);
    assert.equal((await cash(db))[1]!.matchStatus,'unmatched');
    await db.query('select public.review_supporting_document($1,$2,1,$3::jsonb)',[docs[0],crypto.randomUUID(),JSON.stringify({action:'correct',fields})]);
    assert.equal((await db.query('select * from public.accepted_matches')).rows.length,2); // historical allocations retained
    assert.equal(calculateCashSummary(await cash(db),wA,0).outflowMinor,'30016');
  });
});

test('incompatible/stale/cross-owner decisions roll back without releasing accepted matches or overwriting manual reviews', async () => {
  await fixture(async (db,docs,owner) => {
    const bad = await proposal(db,t3,docs[0]);
    await assert.rejects(review(db,bad,crypto.randomUUID(),0,{decision:'accept'}),code('22023'));
    const prop = await proposal(db,t1,docs[0]);
    const accepted = await review(db,prop,crypto.randomUUID(),0,{decision:'accept'});
    await assert.rejects(review(db,prop,crypto.randomUUID(),1,{decision:'correct_match',transactionId:t3,transactionVersion:0}),code('22023'));
    await assert.rejects(review(db,prop,crypto.randomUUID(),1,{decision:'correct_match',transactionId:t2,transactionVersion:7}),code('PT409'));
    await assert.rejects(review(db,prop,crypto.randomUUID(),1,{decision:'correct_match',transactionId:foreign,transactionVersion:0}),code('P0002'));
    assert.deepEqual((await db.query<{id:string}>('select id from public.accepted_matches where active')).rows,[{id:accepted.match!.id}]);
    const category = await proposal(db,t2);
    await db.query('select public.review_cashbook_transaction($1,0,$2::jsonb)',[t2,'{"category":"software_services"}']);
    await assert.rejects(review(db,category,crypto.randomUUID(),0,{decision:'accept'}),code('PT409'));
    await owner('user_B');
    await assert.rejects(review(db,prop,crypto.randomUUID(),1,{decision:'reject'}),code('P0002'));
    for (const table of ['proposal_reviews','accepted_matches','proposal_review_operations']) {
      assert.deepEqual((await db.query(`select * from public.${table}`)).rows,[]);
      await assert.rejects(db.query(`delete from public.${table}`),code('42501'));
    }
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select public.review_ai_proposal($1,$2,0,$3::jsonb)',[prop,crypto.randomUUID(),'{"decision":"reject"}']),code('42501'));
  });
});

test('stale pending rejection changes no books and allocated document no-op reviews are fenced', async () => {
  await fixture(async (db,docs) => {
    const category = await proposal(db,t1);
    await db.query('select public.review_cashbook_transaction($1,0,$2::jsonb)',[t1,'{"category":"software_services"}']);
    const rejected = await review(db,category,crypto.randomUUID(),0,{decision:'reject'});
    assert.deepEqual(rejected.affectedTransactionIds,[]);
    assert.equal((await cash(db))[0]!.category,'software_services');
    const match = await proposal(db,t2,docs[0]);
    await review(db,match,crypto.randomUUID(),0,{decision:'accept'});
    await assert.rejects(db.query('select public.review_supporting_document($1,$2,1,$3::jsonb)',[docs[0],crypto.randomUUID(),JSON.stringify({action:'accept',fields})]),code('PT409'));
    assert.equal((await db.query<{review_version:number}>('select review_version from public.supporting_documents where id=$1',[docs[0]])).rows[0]!.review_version,1);
    const unchanged = (await db.query('select * from public.proposal_reviews')).rows.length;
    await assert.rejects(review(db,match,crypto.randomUUID(),1,{decision:'accept',ownerSubject:'forged'}),code('22023'));
    assert.equal((await db.query('select * from public.proposal_reviews')).rows.length,unchanged);
  });
});

test('database indexes reject duplicate active allocations even independently of RPC guards', async () => {
  await fixture(async (db,docs) => {
    const first = await proposal(db,t1,docs[0]), another = await proposal(db,t2,docs[1]);
    const accepted = await review(db,first,crypto.randomUUID(),0,{decision:'accept'});
    const rejected = await review(db,another,crypto.randomUUID(),0,{decision:'reject'});
    // Privileged synthetic fixture attempts verify underlying constraints, not an app write route.
    await db.exec('reset role');
    const insert = (txn: string, doc: string, audit: string) => db.query(`insert into public.accepted_matches(workspace_id,proposal_id,transaction_id,document_id,review_decision_id)
      values($1,$2,$3,$4,$5)`,[wA,another,txn,doc,audit]);
    await assert.rejects(insert(t1,docs[1]!,rejected.reviewDecisionId),code('23505'));
    await assert.rejects(insert(t2,docs[0]!,rejected.reviewDecisionId),code('23505'));
    await assert.rejects(insert(t2,docs[1]!,accepted.reviewDecisionId),code('23503')); // audit must belong to this proposal
    assert.equal((await db.query('select * from public.accepted_matches where active')).rows.length,1);
  });
});
