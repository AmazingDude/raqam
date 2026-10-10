import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { documentRecordSchema } from '../../src/lib/contracts/documents.ts';
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const workspace=id(1), source=id(2), hash='b'.repeat(64);
const provenance={ modelVersion:'synthetic-model',promptVersion:'receipt-extraction-v2',schemaVersion:'receipt-fields-v2' };
const identity={ ownerId:'synthetic_owner',workspaceId:workspace,sourceHash:hash,provider:'groq',providerVersion:'groq-provider-v1',
  modelId:provenance.modelVersion,promptVersion:provenance.promptVersion,schemaVersion:provenance.schemaVersion,preprocessingVersion:'receipt-image-bytes-v1',cacheKey:'c'.repeat(64) };
const fields={ counterparty:'Synthetic merchant',date:'2026-10-10',totalMinor:'10005',currency:'PKR',reference:null };
const observed=(evidenceField:string,normalizedValue:string|null,rawText:string|null) => ({ rawText,normalizedValue,observedCandidates:[],
  state:normalizedValue===null?'missing':'observed',evidenceField,issues:normalizedValue===null?['missing_field']:[] });
const evidence={ sourceId:source,sourceVersion:hash,status:'needs_review',blockers:['missing_field'],fields:{
  merchant:observed('merchant',fields.counterparty,' Synthetic merchant '),documentDate:observed('document_date',fields.date,'10 October 2026'),
  total:observed('total',fields.totalMinor,'100.05'),currency:observed('currency','PKR','PKR'),reference:observed('reference',null,null),
} };
const outcome={ status:'complete',fields,provenance,evidence };
const code=(expected:string)=>(error:unknown)=>typeof error==='object'&&error!==null&&'code' in error&&error.code===expected;
async function fixture(run:(db:PGlite,doc:string)=>Promise<void>) {
 const db=new PGlite(); try {
  await db.exec(`create role authenticated; create role anon; create schema auth;
   create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
   grant usage on schema auth to authenticated,anon; grant execute on function auth.jwt() to authenticated,anon;
   create schema storage; create table storage.buckets(id text primary key,name text not null,public boolean not null);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
   alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon;
   grant select,insert,update,delete on storage.objects to authenticated;`);
  for (const name of ['202610100001_workspace_spine.sql','202610100002_csv_imports.sql','202610100003_cashbook_review.sql',
    '202610100004_import_resolution.sql','202610100005_review_conflict.sql','202610100006_documents_proposals.sql',
    '202610100007_proposal_reviews_matches.sql','202610100008_receipt_extraction_context.sql'])
    await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
  await db.query('insert into public.workspaces(id,owner_subject,business_name) values($1,$2,$3)',[workspace,'synthetic_owner','Synthetic receipt']);
  await db.query(`insert into public.sources(id,workspace_id,source_type,content_hash,storage_path,original_name,status)
    values($1,$2,'receipt_image',$3,$4,'synthetic.png','complete')`,[source,workspace,hash,workspace+'/'+hash+'.png']);
  await db.query('select set_config($1,$2,false)',['request.jwt.claims','{"sub":"synthetic_owner"}']);
  await db.exec('set role authenticated');
  const registration=await db.query<{result:{record:{document:{id:string}}}}>('select public.register_supporting_document($1) as result',[source]);
  await run(db,registration.rows[0]!.result.record.document.id);
 } finally { await db.close(); }
}
async function reserve(db:PGlite,doc:string,key:string,version=0,processing:unknown=identity) {
 return (await db.query<{result:any}>('select public.reserve_receipt_extraction($1,$2,$3,$4::jsonb,$5::jsonb) as result',
  [doc,key,version,JSON.stringify(provenance),JSON.stringify(processing)])).rows[0]!.result;
}
async function save(db:PGlite,doc:string,key:string,version=0,payload:unknown=outcome) {
 return (await db.query<{result:any}>('select public.save_receipt_extraction($1,$2,$3,$4::jsonb) as result',
  [doc,key,version,JSON.stringify(payload)])).rows[0]!.result;
}
test('receipt context durably binds full identity/raw evidence, caches retries and preserves current corrections',async()=>{
 await fixture(async(db,doc)=>{
  const key=crypto.randomUUID(); assert.equal((await reserve(db,doc,key)).state,'reserved');
  assert.equal((await reserve(db,doc,key)).state,'busy');
  const saved=await save(db,doc,key); const record=documentRecordSchema.parse(saved.record);
  assert.deepEqual(record.extractionContext?.evidence,evidence);
  assert.equal(record.reviewVersion,1); assert.equal((await save(db,doc,key)).duplicate,true);
  const corrected={...fields,counterparty:'Reviewed merchant'};
  await db.query('select public.review_supporting_document($1,$2,1,$3::jsonb)',[doc,crypto.randomUUID(),JSON.stringify({action:'accept',fields:corrected})]);
  const old=await reserve(db,doc,key); assert.equal(old.record.reviewVersion,1); assert.equal(old.currentRecord.reviewVersion,2);
  assert.equal(old.currentRecord.document.correctedFields.counterparty,'Reviewed merchant');
  assert.equal((await reserve(db,doc,crypto.randomUUID(),2)).state,'cached');
  await assert.rejects(reserve(db,doc,crypto.randomUUID(),2,{...identity,providerVersion:'groq-provider-v2'}),code('PT409'));
  await assert.rejects(save(db,doc,key,0,{...outcome,evidence:{...evidence,fields:{...evidence.fields,merchant:{...evidence.fields.merchant,rawText:'changed'}}}}),code('PT409'));
  assert.equal((await db.query<{count:string}>('select count(*)::text as count from public.transactions')).rows[0]!.count,'0');
  const history=(await db.query<{previous_value:any,current_value:any}>('select previous_value,current_value from public.document_history order by version')).rows;
  assert.equal(history[0]!.previous_value.extractionContext,null); assert.deepEqual(history[0]!.current_value.extractionContext.evidence,evidence);
 });
});
test('receipt failures stay failed on identical retry and foreign/malformed evidence cannot be persisted',async()=>{
 await fixture(async(db,doc)=>{
  const key=crypto.randomUUID(); await reserve(db,doc,key);
  await assert.rejects(save(db,doc,key,0,{...outcome,evidence:{...evidence,sourceId:id(99)}}),code('22023'));
  await assert.rejects(save(db,doc,key,0,{...outcome,fields:{...fields,totalMinor:'1'}}),code('22023'));
  const failure={status:'failed',reason:'provider_unavailable',failure:{reason:'cancelled',retryable:false,retryAfterMs:null}};
  const failed=await save(db,doc,key,0,failure); documentRecordSchema.parse(failed.record);
  assert.equal((await reserve(db,doc,key)).record.document.extractionStatus,'failed');
  const retry=crypto.randomUUID(); assert.equal((await reserve(db,doc,retry,1)).state,'reserved');
  await db.exec('reset role');
  await db.query('select set_config($1,$2,false)',['request.jwt.claims','{"sub":"foreign_owner"}']); await db.exec('set role authenticated');
  await assert.rejects(reserve(db,doc,crypto.randomUUID()),code('P0002'));
  assert.deepEqual((await db.query('select * from public.receipt_extraction_contexts')).rows,[]);
  await assert.rejects(db.query('delete from public.receipt_extraction_contexts'),code('42501'));
 });
});
test('receipt allowance is durable, one-time, account-scoped and inaccessible through direct reads',async()=>{
 await fixture(async(db,doc)=>{
  const key=crypto.randomUUID(); await reserve(db,doc,key);
  const fingerprint='d'.repeat(64);
  const consume=async(request:string)=> (await db.query<{result:boolean}>('select public.reserve_receipt_provider_allowance($1,$2,$3) as result',[doc,request,fingerprint])).rows[0]!.result;
  assert.equal(await consume(key),true); assert.equal(await consume(key),false);
  await assert.rejects(db.query('select * from public.receipt_provider_days'),code('42501'));
  await db.exec('reset role'); await db.query('update public.receipt_provider_days set reserved_attempts=120 where account_fingerprint=$1',[fingerprint]); await db.exec('set role authenticated');
  await save(db,doc,key,0,{status:'failed',reason:'provider_timeout',failure:{reason:'deadline_exceeded',retryable:true,retryAfterMs:null}});
  const next=crypto.randomUUID(); await reserve(db,doc,next,1); assert.equal(await consume(next),false);
  await db.exec('reset role'); await db.query('select set_config($1,$2,false)',['request.jwt.claims','{"sub":"foreign_owner"}']); await db.exec('set role authenticated');
  await assert.rejects(consume(next),code('P0002'));
 });
});
test('expired or stale receipt completions roll back evidence and preserve the lease/version fence',async()=>{
 await fixture(async(db,doc)=>{
  const key=crypto.randomUUID(); await reserve(db,doc,key);
  await db.exec('reset role'); await db.query("update public.document_extraction_jobs set expires_at=clock_timestamp()-interval '1 second' where document_id=$1",[doc]); await db.exec('set role authenticated');
  await assert.rejects(save(db,doc,key),code('PT409'));
  assert.equal((await db.query<{outcome:unknown}>('select outcome from public.receipt_extraction_contexts')).rows[0]!.outcome,null);
  await assert.rejects(reserve(db,doc,key),code('PT409'));
  const fresh=crypto.randomUUID(); await reserve(db,doc,fresh);
  await db.query('select public.review_supporting_document($1,$2,0,$3::jsonb)',[doc,crypto.randomUUID(),JSON.stringify({action:'correct',fields})]);
  await assert.rejects(save(db,doc,fresh),code('PT409'));
 });
});
