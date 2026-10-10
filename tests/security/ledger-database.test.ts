import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { ledgerJournalSchema } from '../../src/lib/contracts/ledger.ts';
import { calculateLedgerBalanceSheet,calculateLedgerCashFlow,calculateLedgerIncomeStatement,calculateLedgerTrialBalance } from '../../src/lib/server/ledger/calculations.ts';

const wA='10000000-0000-4000-8000-000000000001', wB='10000000-0000-4000-8000-000000000002';
const key=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const code=(expected:string)=>(error:unknown)=>typeof error==='object'&&error!==null&&'code'in error&&(error as {code?:string}).code===expected;

test('double-entry ledger migration seeds scoped accounts and posting is atomic, exact, immutable and idempotent',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.jwt() to authenticated,anon;
    create schema storage; create table storage.buckets(id text primary key,name text not null,public boolean not null);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
    alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated;`);
  const migrations=['202610100001_workspace_spine.sql','202610100002_csv_imports.sql','202610100003_cashbook_review.sql','202610100004_import_resolution.sql',
   '202610100005_review_conflict.sql','202610100006_documents_proposals.sql','202610100007_proposal_reviews_matches.sql','202610100008_receipt_extraction_context.sql',
   '202610100009_require_complete_receipt_source.sql','202610100010_long_statement_imports.sql','202610100011_invoices_spine.sql','202610100012_atomic_invoice_operations.sql',
   '202610100013_byok_provider_credentials.sql','202610100014_double_entry_ledger.sql','202610100016_invoice_payment_links.sql'];
  for(const name of migrations) await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
  const providerCheck=await db.query<Record<string,boolean>>(await readFile(new URL('../../scripts/check-provider-migration.sql',import.meta.url),'utf8'));
  assert.equal(Object.values(providerCheck.rows[0]!).every(Boolean),true);
  await db.query('insert into public.workspaces(id,owner_subject,business_name) values($1,$2,$3),($4,$5,$6)',[wA,'owner_A','Synthetic A',wB,'owner_B','Synthetic B']);
  await db.query(`insert into public.sources(id,workspace_id,source_type,content_hash,storage_path,original_name,status)
    values($1,$2,'transaction_csv',$3,$4,'synthetic.csv','complete')`,[key(51),wA,'a'.repeat(64),wA+'/a'.repeat(64)+'.csv']);
  await db.query(`insert into public.transactions(id,workspace_id,source_id,source_row,original_values,date,original_description,description,direction,amount_minor,category,category_status)
    values($1,$2,$3,2,'["synthetic"]','2026-10-10','Synthetic receipt','Synthetic receipt','in',2500,'customer_receipts','accepted')`,[key(50),wA,key(51)]);
  await db.query(`insert into public.transactions(id,workspace_id,source_id,source_row,original_values,date,original_description,description,direction,amount_minor)
    values($1,$2,$3,3,'["synthetic unreviewed"]','2026-10-10','Unreviewed receipt','Unreviewed receipt','in',2500)`,[key(52),wA,key(51)]);
  await db.query(`insert into public.imports(source_id,workspace_id,preview,status,confirmation_result,confirmation_plan,confirmed_at)
    values($1,$2,'{}','confirmed','{}','[{"rowNumber":2,"action":"import","transaction":{"date":"2026-10-10","description":"Synthetic receipt","direction":"in","amountMinor":"2500","currency":"PKR","reference":null}},{"rowNumber":3,"action":"import","transaction":{"date":"2026-10-10","description":"Unreviewed receipt","direction":"in","amountMinor":"2500","currency":"PKR","reference":null}}]'::jsonb,now())`,[key(51),wA]);
  await db.query(`insert into public.review_decisions(workspace_id,actor_subject,target_id,target_kind,source_row,action,previous_value,current_value)
    values($1,'owner_A',$2,'import_row',2,'accept','[]','{}')`,[wA,key(51)]);
  const owner=async(subject:string)=>{await db.exec('reset role');await db.query('select set_config($1,$2,false)',['request.jwt.claims',JSON.stringify({sub:subject})]);await db.exec('set role authenticated');};
  const read=async(id:string)=> (await db.query<{value:any}>('select public.read_workspace_ledger($1) value',[id])).rows[0]!.value;
  const post=async(id:string,journal:Record<string,unknown>,sources:unknown[]=[])=> {
   const {sources:linked=[],...command}=journal;
   const actualSources=sources.length?sources:(linked as Array<Record<string,any>>).map(source=>({kind:source.kind,id:source.evidenceId??source.transactionId??source.documentId??source.billId??source.invoiceId??source.paymentId??source.noteId,locator:source.locator??null,...(source.cutoverDate?{cutoverDate:source.cutoverDate}:{})}));
   return (await db.query<{value:any}>('select public.post_workspace_ledger_journal($1,$2::jsonb,$3::jsonb) value',[id,JSON.stringify(command),JSON.stringify(actualSources)])).rows[0]!.value;
  };
  await owner('owner_A');
  const seeded=await read(wA); assert.equal(seeded.accounts.length,7); assert.equal(seeded.coverage.isComplete,false);
  const accounts=seeded.accounts;
  await assert.rejects(()=>read(wB),code('P0002'));
  const coverage=(await db.query<{value:any}>('select public.set_workspace_ledger_history_range($1,$2,$3) value',[wA,'2026-01-01','2026-12-31'])).rows[0]!.value;
  assert.deepEqual([coverage.selectedFrom,coverage.selectedThrough,coverage.isComplete],["2026-01-01","2026-12-31",false]);
  const accountCommand={requestId:key(80),id:null,expectedVersion:null,code:'6100',name:'Materials expense',type:'expense',cashFlowClass:'operating',role:'expense',isCashAccount:false,active:true};
  const saveAccount=async(command:unknown)=>(await db.query<{value:any}>('select public.save_workspace_ledger_account($1,$2::jsonb) value',[wA,JSON.stringify(command)])).rows[0]!.value;
  const newAccount=await saveAccount(accountCommand);assert.equal(newAccount.duplicate,false);assert.equal(newAccount.account.code,'6100');
  assert.equal((await saveAccount(accountCommand)).duplicate,true);
  const draft={requestId:key(30),id:null,expectedVersion:null,originalText:'Paid 25 for a taxi to a client meeting',description:null,counterparty:null,occurredOn:null,amountMinor:null,currency:null};
  const saveDraft=async(value:unknown)=>(await db.query<{value:any}>('select public.save_workspace_expense_draft($1,$2::jsonb) value',[wA,JSON.stringify(value)])).rows[0]!.value;
  const firstDraft=await saveDraft(draft);assert.equal(firstDraft.duplicate,false);assert.equal(firstDraft.draft.status,'needs_review');
  assert.equal((await saveDraft(draft)).duplicate,true);
  const correctedDraft={...draft,requestId:key(31),id:firstDraft.draft.id,expectedVersion:0,description:'Taxi to client meeting',counterparty:'City cab',occurredOn:'2026-10-10',amountMinor:'2500',currency:'PKR'};
  const updatedDraft=await saveDraft(correctedDraft);assert.equal(updatedDraft.draft.version,1);assert.equal(updatedDraft.draft.status,'draft');
  await assert.rejects(()=>saveDraft({...correctedDraft,requestId:key(32),expectedVersion:0}),code('PT409'));
  const expenseDecision={action:'accept'};
  const reviewedExpense=async(request:string,version:number)=>(await db.query<{value:any}>('select public.review_workspace_expense_draft($1,$2,$3,$4,$5::jsonb) value',[wA,firstDraft.draft.id,request,version,JSON.stringify(expenseDecision)])).rows[0]!.value;
  const acceptedExpense=await reviewedExpense(key(33),1);assert.equal(acceptedExpense.draft.status,'accepted');assert.equal(acceptedExpense.draft.version,2);
  assert.equal((await reviewedExpense(key(33),1)).duplicate,true);
  assert.equal((await db.query<{count:number}>('select count(*)::int as count from public.transactions')).rows[0]!.count,2,'saving a written expense draft does not add another cash movement');
  const bill={requestId:key(40),id:null,expectedVersion:null,supplierName:'Synthetic supplier',supplierReference:'B-001',issueDate:'2026-10-09',dueDate:'2026-10-30',goodsReceivedDate:null,
   sourceDocumentId:null,expenseAccountId:null,lines:[{id:key(41),description:'Synthetic service',quantity:1,rateMinor:'2500',amountMinor:'2500'}]};
  const saveBill=async(value:unknown)=>(await db.query<{value:any}>('select public.save_workspace_supplier_bill($1,$2::jsonb) value',[wA,JSON.stringify(value)])).rows[0]!.value;
  const createdBill=await saveBill(bill);assert.equal(createdBill.duplicate,false);assert.equal(createdBill.bill.totalMinor,'2500');
  const expense=accounts.find((a:any)=>a.code==='5000').id;
  const reviewRequest=key(42), review={action:'accept',goodsReceivedDate:'2026-10-10',expenseAccountId:expense};
  const reviewBill=async(request:string,version:number)=>(await db.query<{value:any}>('select public.review_workspace_supplier_bill($1,$2,$3,$4,$5::jsonb) value',
   [wA,createdBill.bill.id,request,version,JSON.stringify(review)])).rows[0]!.value;
  const approved=await reviewBill(reviewRequest,0);assert.equal(approved.bill.status,'posted');assert.ok(approved.journal.id);
  await assert.rejects(()=>saveAccount({...accountCommand,requestId:key(81),id:expense,expectedVersion:0,name:'Renamed posted expense'}),code('22023'));
  assert.equal((await reviewBill(reviewRequest,0)).duplicate,true);await db.exec('reset role');assert.equal((await db.query<{count:number}>('select count(*)::int as count from public.ledger_journals where workspace_id=$1',[wA])).rows[0]!.count,1);await db.exec('set role authenticated');
  assert.equal((await db.query<{count:number}>('select count(*)::int as count from public.transactions')).rows[0]!.count,2,'bill accrual never creates another cash movement');
  const bank=accounts.find((a:any)=>a.code==='1000').id, equity=accounts.find((a:any)=>a.code==='3000').id;
  const payable=accounts.find((a:any)=>a.code==='2000').id, generalExpense=accounts.find((a:any)=>a.code==='5000').id;
  const noteJournal={id:key(70),requestId:key(71),expectedVersion:null,entryDate:'2026-10-10',description:'Reviewed expense note',currency:'PKR',sources:[{kind:'manual_note',noteId:firstDraft.draft.id,locator:{kind:'owner_decision',decisionId:key(33),field:'service_date'}}],
   recognitionEvidence:{basis:'service_delivery',date:'2026-10-10',source:{kind:'manual_note',noteId:firstDraft.draft.id,locator:{kind:'owner_decision',decisionId:key(33),field:'service_date'}},reviewDecisionId:key(33)},
   cashMovement:null,reversalOfId:null,reversalReason:null,
   lines:[{id:key(72),accountId:generalExpense,debitMinor:'2500',creditMinor:'0',memo:null},{id:key(73),accountId:payable,debitMinor:'0',creditMinor:'2500',memo:null}]};
  const noteAccrual=await post(wA,noteJournal);assert.equal(noteAccrual.journal.status,'posted');
  const movement={kind:'opening_balance',cutoverDate:'2026-01-01',evidenceId:key(4),locator:{kind:'owner_decision',decisionId:key(11),field:'opening_balance'}};
  const journal={id:key(10),requestId:key(11),expectedVersion:null,entryDate:'2026-01-01',description:'Owner-reviewed opening position',currency:'PKR',sources:[movement],
   recognitionEvidence:null,cashMovement:null,reversalOfId:null,reversalReason:null,
   lines:[{id:key(12),accountId:bank,debitMinor:'9007199254740993',creditMinor:'0',memo:null},{id:key(13),accountId:equity,debitMinor:'0',creditMinor:'9007199254740993',memo:null}]};
  const saved=await post(wA,journal);
  assert.equal(saved.duplicate,false); assert.equal(saved.journal.status,'posted'); assert.equal(saved.journal.lines[0].debitMinor,'9007199254740993');
  assert.equal((await post(wA,journal)).duplicate,true);
  await assert.rejects(()=>post(wA,{...journal,id:key(20),requestId:key(21),lines:[...journal.lines,{...journal.lines[1],id:key(22),creditMinor:'1'}]},[]),code('22023'));
  const bankMovement={id:key(60),requestId:key(61),expectedVersion:null,entryDate:'2026-10-10',description:'Reviewed bank receipt',currency:'PKR',sources:[{kind:'bank_transaction',transactionId:key(50)}],
   recognitionEvidence:null,cashMovement:{kind:'bank_transaction',transactionId:key(50)},reversalOfId:null,reversalReason:null,
   lines:[{id:key(62),accountId:bank,debitMinor:'2500',creditMinor:'0',memo:null},{id:key(63),accountId:accounts.find((a:any)=>a.code==='1200').id,debitMinor:'0',creditMinor:'2500',memo:null}]};
  const cashPost=await post(wA,bankMovement);assert.equal(cashPost.duplicate,false);
  await assert.rejects(()=>post(wA,{...bankMovement,id:key(90),requestId:key(91),cashMovement:{kind:'bank_transaction',transactionId:key(52)},sources:[{kind:'bank_transaction',transactionId:key(52)}],
   lines:bankMovement.lines.map((line,index)=>({...line,id:key(92+index)}))},[]),code('22023'));
  await assert.rejects(()=>post(wA,{...bankMovement,id:key(64),requestId:key(65)},[]),code('23505'));
  const raw=(await db.query<{value:any}>('select public.read_workspace_ledger($1) value',[wA])).rows[0]!.value;
  const parsedJournals=raw.journals.map((entry:unknown)=>ledgerJournalSchema.parse(entry));
  const ledger={workspaceId:wA,accounts:raw.accounts,journals:parsedJournals,coverage:raw.coverage};
  const income=calculateLedgerIncomeStatement({...ledger,from:'2026-10-10',to:'2026-10-10'});
  assert.equal(income.totalExpenseMinor,'5000');assert.equal(income.totalRevenueMinor,'0');
  assert.equal(calculateLedgerTrialBalance({...ledger,asOf:'2026-10-10'}).debitTotalMinor,'9007199254748493');
  assert.equal(calculateLedgerBalanceSheet({...ledger,asOf:'2026-10-10'}).isBalanced,true);
  const cashFlow=calculateLedgerCashFlow({...ledger,from:'2026-10-10',to:'2026-10-10',movements:[{transactionId:key(50),date:'2026-10-10',amountMinor:'2500',direction:'in',classification:'operating',reviewRequired:false}]});
  assert.equal(cashFlow.netCashMovementMinor,'2500');assert.equal(cashFlow.ledgerCashMovementMinor,'2500');assert.equal(cashFlow.reconcilesToLedger,true);
  await assert.rejects(()=>db.query('delete from public.ledger_journals'),code('42501'));
  await assert.rejects(()=>db.query('update public.ledger_journals set description=$1',['changed']),code('42501'));
  await owner('owner_B');
  await assert.rejects(()=>db.query('select id from public.ledger_accounts'),code('42501'));
  await assert.rejects(()=>read(wA),code('P0002'));
  await db.exec('reset role;set role anon'); await assert.rejects(()=>read(wA),code('42501'));
  await db.exec('reset role');
  const readiness=await db.query<Record<string,boolean>>(await readFile(new URL('../../scripts/check-bookkeeping-migration.sql',import.meta.url),'utf8'));
  assert.equal(readiness.rows.length,1);for(const [check,passed] of Object.entries(readiness.rows[0]!))assert.equal(passed,true,check);
 } finally { await db.close(); }
});
