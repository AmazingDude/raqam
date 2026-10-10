import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {calculateLedgerTrialBalance,calculateLedgerIncomeStatement,calculateLedgerCashFlow} from '../../src/lib/server/ledger/calculations.ts';
const w='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const key=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('chat migrations preserve owner isolation, typed provenance, atomic money edits, balanced corrections and retry safety',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.jwt() to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated;`);
 const names=['001_workspace_spine','002_csv_imports','003_cashbook_review','004_import_resolution','005_review_conflict','006_documents_proposals','007_proposal_reviews_matches','008_receipt_extraction_context','009_require_complete_receipt_source','010_long_statement_imports','011_invoices_spine','012_atomic_invoice_operations','013_byok_provider_credentials','014_double_entry_ledger','015_tax_readiness_profiles','016_conversational_bookkeeping'];
 for(const name of names)await db.exec(await readFile(new URL(`../../supabase/migrations/202610100${name}.sql`,import.meta.url),'utf8'));
 await db.query('insert into public.workspaces(id,owner_subject,business_name) values($1,$2,$3),($4,$5,$6)',[w,'owner','Synthetic',other,'other','Other']);
 const owner=async(subject:string)=>{await db.exec('reset role');await db.query('select set_config($1,$2,false)',['request.jwt.claims',JSON.stringify({sub:subject})]);await db.exec('set role authenticated');};
 const save=async(requestId:string,plan:any,conversation:string|null=null)=> (await db.query<{value:any}>('select public.save_chat_exchange($1,$2,$3,$4,$5,$6::jsonb) value',[w,conversation,requestId,'I paid rent 30000 on 2026-09-01','Review changes',JSON.stringify(plan)])).rows[0]!.value;
 const decide=async(messageId:string,decision='apply')=>(await db.query<{value:any}>('select public.decide_chat_changes($1,$2,$3) value',[w,messageId,decision])).rows[0]!.value;
 const values={date:'2026-09-01',description:'Rent',direction:'out',amountMinor:'3000000',reference:null,category:null};
 await owner('owner');
 const first=await save(key(1),{actions:[{kind:'create_cash',values,counterAccountId:null}]});
 assert.equal(first.message.state,'pending');
 assert.equal((await db.query('select * from public.transactions')).rows.length,0);
 const applied=await decide(first.message.id);assert.equal(applied.message.state,'applied');assert.equal((await decide(first.message.id)).duplicate,true);
 assert.equal((await save(key(1),null)).message.state,'applied','response retry recovers the persisted proposal');
 const row=(await db.query<any>('select * from public.cashbook_records')).rows[0];assert.equal(row.amount_minor,'3000000');assert.equal(row.source_type,'manual_chat');
 assert.equal((await db.query('select * from public.transaction_reviews')).rows.length,1);
 const ledger=(await db.query<any>('select public.read_workspace_ledger($1) value',[w])).rows[0].value;
 assert.equal(ledger.journals.length,1);assert.equal(ledger.journals[0].lines.reduce((n:bigint,l:any)=>n+BigInt(l.debitMinor)-BigInt(l.creditMinor),0n),0n);
 const edited={kind:'edit_cash',transactionId:row.id,expectedVersion:1,before:{},values:{...values,amountMinor:'3200000'},counterAccountId:null};
 const next=await save(key(2),{actions:[edited]},first.conversationId);await decide(next.message.id);
 const updated=(await db.query<any>('select * from public.cashbook_records')).rows[0];assert.equal(updated.amount_minor,'3200000');assert.equal(updated.review_version,2);assert.equal(updated.original_description,'I paid rent 30000 on 2026-09-01');
 const corrected=(await db.query<any>('select public.read_workspace_ledger($1) value',[w])).rows[0].value;
 assert.equal(corrected.journals.length,3);assert.equal(corrected.journals.filter((j:any)=>j.reversalOfId).length,1);
 const cashAccount=corrected.accounts.find((a:any)=>a.isCashAccount).id;
 const cashNet=corrected.journals.flatMap((j:any)=>j.lines).filter((l:any)=>l.accountId===cashAccount).reduce((n:bigint,l:any)=>n+BigInt(l.debitMinor)-BigInt(l.creditMinor),0n);
 assert.equal(cashNet,-3200000n);
 const trial=calculateLedgerTrialBalance({workspaceId:w,asOf:'2026-12-31',accounts:corrected.accounts,journals:corrected.journals,coverage:corrected.coverage});assert.equal(trial.debitTotalMinor,trial.creditTotalMinor);
 const flow=calculateLedgerCashFlow({workspaceId:w,from:'2026-01-01',to:'2026-12-31',accounts:corrected.accounts,journals:corrected.journals,coverage:corrected.coverage,movements:[{transactionId:row.id,date:'2026-09-01',direction:'out',amountMinor:'3200000',classification:null,reviewRequired:true}]});assert.equal(flow.reconcilesToLedger,true);assert.equal(flow.netCashMovementMinor,'-3200000');

 const stale=await save(key(3),{actions:[{kind:'create_cash',values,counterAccountId:null},edited]},first.conversationId);
 await assert.rejects(decide(stale.message.id),/Transaction changed/);assert.equal((await db.query('select * from public.transactions')).rows.length,1,'a later stale edit rolls back earlier batch creation');
 const badDate=await save(key(4),{actions:[{kind:'create_cash',values:{...values,date:'2026-02-30'},counterAccountId:null}]});await assert.rejects(decide(badDate.message.id));
 await assert.rejects(db.query('update public.chat_messages set state=$1 where id=$2',['applied',stale.message.id]),/permission denied/);
 const foreign=await save(key(5),{actions:[{...edited,transactionId:key(999),expectedVersion:2}]});await assert.rejects(decide(foreign.message.id),/Transaction not found/);

 const expense=corrected.accounts.find((a:any)=>a.type==='expense'&&a.active);
 const specified=await save(key(7),{actions:[{kind:'create_cash',values:{...values,description:'Explicit expense',amountMinor:'50000',category:'premises_utilities'},counterAccountId:expense.id}]},first.conversationId);
 await db.query('select public.confirm_chat_exchange($1,$2,$3,$4,$5)',[w,first.conversationId,key(8),specified.message.id,'save these']);
 const all=(await db.query<any>('select public.read_workspace_ledger($1) value',[w])).rows[0].value;
 const income=calculateLedgerIncomeStatement({workspaceId:w,from:'2026-01-01',to:'2026-12-31',accounts:all.accounts,journals:all.journals,coverage:all.coverage});assert.equal(income.totalExpenseMinor,'50000');
 assert.equal((await db.query<any>("select role from public.chat_messages where conversation_id=$1 order by sequence",[first.conversationId])).rows[0].role,'user');
 await owner('other');assert.equal((await db.query('select * from public.chat_messages')).rows.length,0);await assert.rejects(decide(first.message.id),/Workspace not found/);await assert.rejects(save(key(6),null),/Workspace not found/);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select public.decide_chat_changes($1,$2,$3)',[w,first.message.id,'apply']),/permission denied/);
 }finally{await db.close();}
});
