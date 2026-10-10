import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const workspace='10000000-0000-4000-8000-000000000001';
const invoice='20000000-0000-4000-8000-000000000001';
const invoiceLine='20000000-0000-4000-8000-000000000002';
const transaction='20000000-0000-4000-8000-000000000003';
const source='20000000-0000-4000-8000-000000000004';
const expenseId='20000000-0000-4000-8000-000000000005';
const expenseTransaction='20000000-0000-4000-8000-000000000006';
const unreviewedTransaction='20000000-0000-4000-8000-000000000007';
const request=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('invoice recognition and bank payment link post once, preserve exact cash and require source review', async () => {
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
      '202610100014_double_entry_ledger.sql','202610100016_invoice_payment_links.sql'];
    for(const name of migrations) await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
    await db.query('insert into public.workspaces(id,owner_subject,business_name) values($1,$2,$3)',[workspace,'synthetic_owner','Synthetic studio']);
    await db.query(`insert into public.sources(id,workspace_id,source_type,content_hash,storage_path,original_name,status)
      values($1,$2,'transaction_csv',$3,$4,'statement.csv','complete')`,[source,workspace,'a'.repeat(64),workspace+'/'+ 'a'.repeat(64)+'.csv']);
    await db.query(`insert into public.transactions(id,workspace_id,source_id,source_row,original_values,date,original_description,description,direction,amount_minor)
      values($1,$2,$3,2,'["2026-10-10","Invoice settlement","5.00"]','2026-10-10','Invoice settlement','Invoice settlement','in',500)`,[transaction,workspace,source]);
    await db.query(`insert into public.transactions(id,workspace_id,source_id,source_row,original_values,date,original_description,description,direction,amount_minor)
      values($1,$2,$3,3,'["2026-10-10","Expense payment","5.00"]','2026-10-10','Expense payment','Expense payment','out',500)`,[expenseTransaction,workspace,source]);
    await db.query(`insert into public.transactions(id,workspace_id,source_id,source_row,original_values,date,original_description,description,direction,amount_minor)
      values($1,$2,$3,4,'["2026-10-10","Unreviewed payment","5.00"]','2026-10-10','Unreviewed payment','Unreviewed payment','in',500)`,[unreviewedTransaction,workspace,source]);
    await db.query(`insert into public.imports(source_id,workspace_id,preview,status,confirmation_result,confirmation_plan,confirmed_at)
      values($1,$2,'{}','confirmed','{}',$3::jsonb,now())`,[source,workspace,JSON.stringify([
        {rowNumber:2,action:'import',transaction:{date:'2026-10-10',description:'Invoice settlement',direction:'in',amountMinor:'500',currency:'PKR',reference:null}},
        {rowNumber:3,action:'import',transaction:{date:'2026-10-10',description:'Expense payment',direction:'out',amountMinor:'500',currency:'PKR',reference:null}},
        {rowNumber:4,action:'import',transaction:{date:'2026-10-10',description:'Unreviewed payment',direction:'in',amountMinor:'500',currency:'PKR',reference:null}},
      ])]);
    await db.query(`insert into public.review_decisions(workspace_id,actor_subject,target_id,target_kind,source_row,action,previous_value,current_value)
      values($1,'synthetic_owner',$2,'import_row',2,'accept','[]','{}'),($1,'synthetic_owner',$2,'import_row',3,'accept','[]','{}')`,[workspace,source]);
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:'synthetic_owner'})]);
    await db.exec('set role authenticated');
    const accountData=(await db.query<{value:any}>('select public.read_workspace_ledger($1) value',[workspace])).rows[0]!.value;
    const account=(code:string)=>accountData.accounts.find((row:any)=>row.code===code).id as string;
    const invoicePayload={id:invoice,workspace_id:workspace,invoice_number:'SYN-1',status:'draft',issue_date:'2026-10-10',due_date:'2026-10-20',from_name:'Synthetic studio',client_name:'Synthetic client',currency:'PKR',
      discount_minor:'0',shipping_minor:'0',tax_minor:'0',items:[{id:invoiceLine,description:'Consulting',quantity:1,rate_minor:'500'}]};
    await db.query('select public.save_workspace_invoice($1,$2::jsonb,null)',[workspace,JSON.stringify(invoicePayload)]);
    await db.query('select public.set_workspace_invoice_status($1,$2,$3,$4)',[workspace,invoice,'sent',0]);
    await assert.rejects(()=>db.query('select public.recognize_workspace_invoice($1,$2,$3,$4,$5,$6)',[workspace,request(1),invoice,0,'2026-10-10',account('4000')]),/version changed/i);
    const recognized=(await db.query<{value:any}>('select public.recognize_workspace_invoice($1,$2,$3,$4,$5,$6) value',
      [workspace,request(1),invoice,1,'2026-10-10',account('4000')])).rows[0]!.value;
    assert.equal(recognized.duplicate,false);
    assert.equal(recognized.journal.lines.reduce((sum:bigint,line:any)=>sum+BigInt(line.debitMinor),0n),500n);
    assert.equal((await db.query<{value:any}>('select public.read_workspace_ledger($1) value',[workspace])).rows[0]!.value.journals.length,1);
    await assert.rejects(()=>db.query('select public.save_workspace_invoice($1,$2::jsonb,$3)',[workspace,JSON.stringify({...invoicePayload,client_name:'Changed'}),2]),/reversal and replacement/i);
    await assert.rejects(()=>db.query('select public.link_workspace_payment($1,$2,$3,$4,$5,$6,$7,$8)',
      [workspace,request(18),'invoice',invoice,2,unreviewedTransaction,0,account('1000')]),/confirmed and reviewed/i);
    const paymentArgs=[workspace,request(2),'invoice',invoice,2,transaction,0,account('1000')];
    const paid=(await db.query<{value:any}>('select public.link_workspace_payment($1,$2,$3,$4,$5,$6,$7,$8) value',paymentArgs)).rows[0]!.value;
    assert.equal(paid.duplicate,false);assert.equal(paid.payment.amountMinor,'500');assert.equal(paid.journal.cashMovement.transactionId,transaction);
    const duplicate=(await db.query<{value:any}>('select public.link_workspace_payment($1,$2,$3,$4,$5,$6,$7,$8) value',paymentArgs)).rows[0]!.value;
    assert.equal(duplicate.duplicate,true);
    await assert.rejects(()=>db.query('select public.link_workspace_payment($1,$2,$3,$4,$5,$6,$7,$8)',[workspace,request(3),'invoice',invoice,3,transaction,0,account('1000')]),/already linked/i);
    const badReversal={requestId:request(12),expectedVersion:null,id:request(11),entryDate:'2026-10-10',description:'Synthetic invalid reversal',currency:'PKR',
      recognitionEvidence:{basis:'correction',date:'2026-10-10',source:{kind:'invoice',invoiceId:invoice,locator:{kind:'owner_decision',decisionId:request(13),field:'service_date'}},reviewDecisionId:request(13)},
      cashMovement:null,reversalOfId:recognized.journal.id,reversalReason:'Synthetic correction fixture',lines:[
        {id:request(14),accountId:account('4000'),debitMinor:'500',creditMinor:'0',memo:null},
        {id:request(15),accountId:account('1100'),debitMinor:'0',creditMinor:'500',memo:null},
        {id:request(16),accountId:account('1000'),debitMinor:'100',creditMinor:'0',memo:null},
        {id:request(17),accountId:account('3000'),debitMinor:'0',creditMinor:'100',memo:null}],sources:[{kind:'invoice',id:invoice}]};
    await assert.rejects(()=>db.query('select public.post_workspace_ledger_journal($1,$2::jsonb,$3::jsonb)',[workspace,JSON.stringify((({sources,...journal})=>journal)(badReversal)),JSON.stringify(badReversal.sources)]),/Reversal must exactly reverse original/i);
    const draftInput={requestId:request(4),id:null,expectedVersion:null,originalText:'Taxi on confirmed client visit',description:'Taxi',counterparty:'Synthetic cab',occurredOn:'2026-10-10',amountMinor:'500',currency:'PKR'};
    const createdDraft=(await db.query<{value:any}>('select public.save_workspace_expense_draft($1,$2::jsonb) value',[workspace,JSON.stringify(draftInput)])).rows[0]!.value.draft;
    const acceptedDraft=(await db.query<{value:any}>('select public.review_workspace_expense_draft($1,$2,$3,$4,$5::jsonb) value',
      [workspace,createdDraft.id,request(5),0,JSON.stringify({action:'accept'})])).rows[0]!.value.draft;
    const expensePosting=(await db.query<{value:any}>('select public.post_workspace_expense_accrual($1,$2,$3,$4,$5) value',
      [workspace,request(6),createdDraft.id,acceptedDraft.version,account('5000')])).rows[0]!.value;
    assert.equal(expensePosting.duplicate,false);assert.equal(expensePosting.journal.cashMovement,null);assert.equal(expensePosting.posting.incurredOn,'2026-10-10');
    const expensePaymentArgs=[workspace,request(7),'expense_draft',createdDraft.id,acceptedDraft.version,expenseTransaction,0,account('1000')];
    const expensePayment=(await db.query<{value:any}>('select public.link_workspace_payment($1,$2,$3,$4,$5,$6,$7,$8) value',expensePaymentArgs)).rows[0]!.value;
    assert.equal(expensePayment.payment.direction,'out');assert.equal(expensePayment.payment.amountMinor,'500');
    const invoices=(await db.query<{value:any}>('select public.read_workspace_invoice($1,$2) value',[workspace,invoice])).rows[0]!.value;
    assert.equal(invoices.status,'paid');
    const ledger=(await db.query<{value:any}>('select public.read_workspace_ledger($1) value',[workspace])).rows[0]!.value;
    assert.equal(ledger.journals.length,4);
    const cashLines=ledger.journals.flatMap((journal:any)=>journal.lines.filter((line:any)=>line.accountId===account('1000')));
    assert.equal(cashLines.reduce((sum:bigint,line:any)=>sum+BigInt(line.debitMinor),0n),500n);
    assert.equal(cashLines.reduce((sum:bigint,line:any)=>sum+BigInt(line.creditMinor),0n),500n);
    await assert.rejects(()=>db.query('select id from public.workspace_payments'),/permission denied/i);
    await db.exec('reset role;set role anon');
    await assert.rejects(()=>db.query('select public.read_workspace_payments($1)',[workspace]),/permission denied/i);
  } finally { await db.close(); }
});
