'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/client/api.ts';
import { usePrivateRequests } from '../../lib/client/use-private-requests.ts';
import { formatAmount, parseAmount } from '../../lib/server/money.ts';
import type { ExpenseDraft, SupplierBill } from '../../lib/contracts/bookkeeping.ts';
import type { LedgerAccount } from '../../lib/contracts/ledger.ts';
import { Icon } from '../ui/icon.tsx';
import s from '../ui/theme.module.css';

const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
function formatMinor(value:string|null){return value===null?'Not provided':`PKR ${formatAmount(value)}`;}

export function DraftsScreen({demo}:{demo:boolean}) {
  const run=usePrivateRequests(),[tab,setTab]=useState<'expenses'|'bills'>('expenses');
  const [expenses,setExpenses]=useState<ExpenseDraft[]>([]),[bills,setBills]=useState<SupplierBill[]>([]),[accounts,setAccounts]=useState<LedgerAccount[]>([]);
  const [loading,setLoading]=useState(!demo),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [note,setNote]=useState(''),[expenseDescription,setExpenseDescription]=useState(''),[counterparty,setCounterparty]=useState(''),[occurredOn,setOccurredOn]=useState(''),[amount,setAmount]=useState('');
  const [supplier,setSupplier]=useState(''),[reference,setReference]=useState(''),[issueDate,setIssueDate]=useState(today()),[receivedDate,setReceivedDate]=useState(''),[billAmount,setBillAmount]=useState(''),[billDescription,setBillDescription]=useState(''),[accountId,setAccountId]=useState('');
  async function load() {
    if(demo){setLoading(false);return;}
    setError('');setLoading(true);
    try { const [expenseResult,billResult,ledger]=await run(signal=>Promise.all([api.expenseDrafts(signal),api.supplierBills(signal),api.ledger(signal)]));setExpenses(expenseResult.items);setBills(billResult.items);setAccounts(ledger.accounts.filter(a=>a.active&&(a.type==='expense'||a.type==='asset')&&!a.isCashAccount)); }
    catch(e){setError(e instanceof Error?e.message:'Records could not load. Retry.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  async function saveExpense(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();const minor=amount.trim()?parseAmount(amount):null;if(amount.trim()&&minor===null){setError('Enter a positive PKR amount with at most two decimal places.');return;}
    setBusy(true);setError('');setNotice('');
    try { const result=await run(signal=>api.saveExpenseDraft({requestId:crypto.randomUUID(),id:null,expectedVersion:null,originalText:note,description:expenseDescription.trim()||null,counterparty:counterparty.trim()||null,occurredOn:occurredOn||null,amountMinor:minor,currency:minor===null?null:'PKR'},signal));setNote('');setExpenseDescription('');setCounterparty('');setOccurredOn('');setAmount('');setNotice(result.duplicate?'Existing draft reopened.':'Expense draft saved; no cash or journal was created.');await load(); }
    catch(err){setError(err instanceof Error?err.message:'Expense draft could not be saved.');}
    finally{setBusy(false);}
  }
  async function reviewExpense(draft:ExpenseDraft,action:'accept'|'reject') {
    if(!draft.id){setError('This expense draft has no saved ID. Reload the workspace before reviewing it.');return;}
    const draftId=draft.id;
    setBusy(true);setError('');setNotice('');
    try { await run(signal=>api.reviewExpenseDraft(draftId,{requestId:crypto.randomUUID(),expectedVersion:draft.version,action,...(action==='reject'?{reason:'Rejected during owner review'}:{})},signal));setNotice(action==='accept'?'Expense note reviewed. No cash movement or ledger journal was created.':'Expense draft rejected.');await load(); }
    catch(err){setError(err instanceof Error?err.message:'Review could not be saved. Reload and retry.');}
    finally{setBusy(false);}
  }
  async function saveBill(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();const minor=parseAmount(billAmount);if(minor===null||BigInt(minor)===0n){setError('Enter a positive PKR line amount.');return;}
    setBusy(true);setError('');setNotice('');
    try { const result=await run(signal=>api.saveSupplierBill({requestId:crypto.randomUUID(),id:null,expectedVersion:null,supplierName:supplier,supplierReference:reference.trim()||null,issueDate,dueDate:null,goodsReceivedDate:receivedDate||null,sourceDocumentId:null,expenseAccountId:null,lines:[{id:crypto.randomUUID(),description:billDescription||'Supplier goods or service',quantity:1,rateMinor:minor,amountMinor:minor}]},signal));setSupplier('');setReference('');setBillAmount('');setBillDescription('');setReceivedDate('');setNotice(result.duplicate?'Existing supplier bill reopened.':'Supplier bill draft saved. It has not changed cash or the ledger.');await load(); }
    catch(err){setError(err instanceof Error?err.message:'Supplier bill could not be saved.');}
    finally{setBusy(false);}
  }
  async function reviewBill(bill:SupplierBill,action:'accept'|'reject') {
    if(!bill.id){setError('This supplier bill has no saved ID. Reload the workspace before reviewing it.');return;}
    const billId=bill.id;
    if(action==='accept'&&(!receivedDate||!accountId)){setError('Choose a confirmed goods-received date and expense or asset account before approval.');return;}
    setBusy(true);setError('');setNotice('');
    try { await run(signal=>api.reviewSupplierBill(billId,{requestId:crypto.randomUUID(),expectedVersion:bill.version,action,...(action==='accept'?{goodsReceivedDate:receivedDate,expenseAccountId:accountId}:{reason:'Rejected during owner review'})},signal));setNotice(action==='accept'?'Bill approved. The accrual journal was posted; cash did not change.':'Supplier bill rejected.');await load(); }
    catch(err){setError(err instanceof Error?err.message:'Bill review could not be saved. Reload and retry.');}
    finally{setBusy(false);}
  }
  return <>
    <div className={s.pageHeading}><div><h1>Expenses and bills</h1><p>Capture a written expense or supplier bill. Review is separate from cash settlement.</p></div><button className={s.secondary} onClick={()=>void load()} disabled={loading||busy}><Icon name="reset" size={16}/> Refresh</button></div>
    {demo&&<div className={s.notice}><p><strong>Live workflow preview.</strong> Expense and bill records are private saved resources; use your signed-in workspace to load them.</p></div>}
    {(error||notice)&&<p role={error?'alert':'status'} className={error?s.error:s.success}>{error||notice}</p>}
    <div className={s.tabs} aria-label="Expense records"><button className={tab==='expenses'?s.selectedTab:''} aria-pressed={tab==='expenses'} onClick={()=>setTab('expenses')}>Written expenses</button><button className={tab==='bills'?s.selectedTab:''} aria-pressed={tab==='bills'} onClick={()=>setTab('bills')}>Supplier bills</button></div>
    {loading&&<p role="status" className={s.muted}>Loading drafts and accounts…</p>}
    {tab==='expenses'&&<><form className={`${s.panel} ${s.formPanel}`} onSubmit={saveExpense}><div><h2>Record a written expense</h2><p className={`${s.small} ${s.muted}`}>Start with the words you have. Keep unclear details blank; AI assistance can be added without changing the source note.</p></div><fieldset className={s.formFieldset} disabled={demo||busy}><label className={s.field}>Original note<textarea rows={3} maxLength={3000} value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. Paid 4,500 rupees for internet on 8 October" required/></label><div className={s.formGrid}><label className={s.field}>Reviewed description<input value={expenseDescription} onChange={e=>setExpenseDescription(e.target.value)} maxLength={500}/></label><label className={s.field}>Vendor or person<input value={counterparty} onChange={e=>setCounterparty(e.target.value)} maxLength={200}/></label><label className={s.field}>Date<input type="date" value={occurredOn} onChange={e=>setOccurredOn(e.target.value)}/></label><label className={s.field}>Amount (PKR)<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Leave blank if unknown"/></label></div><div className={s.actions}><button className={s.button} disabled={busy||demo||!note.trim()}>{busy?'Saving…':'Save expense draft'}</button><span className={`${s.small} ${s.muted}`}>Saving the note does not create cash or a journal.</span></div></fieldset></form><section className={s.panel}><div className={s.panelHeading}><div><h2>Saved expense notes</h2><p className={s.small}>Review versions and unresolved fields before accepting the note.</p></div><span className={s.badge}>{expenses.length} drafts</span></div>{expenses.length?expenses.map(d=><article className={s.proposal} key={d.id}><div className={s.proposalHeading}><div><h3>{d.description??'Expense details need review'}</h3><p>{d.counterparty??'Vendor unknown'} · {d.occurredOn??'Date unknown'} · {formatMinor(d.amountMinor)}</p></div><span className={`${s.badge} ${d.status==='accepted'?s.good:d.status==='rejected'?s.bad:s.pending}`}>{d.status.replaceAll('_',' ')}</span></div><details><summary>Original note and recorded fields</summary><p><strong>Original:</strong> {d.originalText}</p><p>{d.description??'Description missing'} · {d.counterparty??'Counterparty missing'} · {d.occurredOn??'Date missing'} · {formatMinor(d.amountMinor)}</p></details>{d.status==='draft'||d.status==='needs_review'?<div className={s.actions}><button className={s.button} disabled={busy||!d.description||!d.counterparty||!d.occurredOn||!d.amountMinor} onClick={()=>void reviewExpense(d,'accept')}>Confirm note review</button><button className={s.secondary} disabled={busy} onClick={()=>void reviewExpense(d,'reject')}>Reject draft</button></div>:<p className={`${s.small} ${s.muted}`}>This review state does not record a payment or update cash.</p>}</article>):<div className={s.empty}><Icon name="file" size={28}/><h2>No written expenses yet</h2><p>Save a note above to create a reviewable draft.</p></div>}</section></>}
    {tab==='bills'&&<><form className={`${s.panel} ${s.formPanel}`} onSubmit={saveBill}><div><h2>Add a supplier bill</h2><p className={`${s.small} ${s.muted}`}>A reviewed bill records an accrual. It does not count as paid or add a cash movement.</p></div><fieldset className={s.formFieldset} disabled={demo||busy}><div className={s.formGrid}><label className={s.field}>Supplier<input value={supplier} onChange={e=>setSupplier(e.target.value)} maxLength={200} required/></label><label className={s.field}>Supplier reference<input value={reference} onChange={e=>setReference(e.target.value)} maxLength={128}/></label><label className={s.field}>Bill date<input type="date" value={issueDate} onChange={e=>setIssueDate(e.target.value)} required/></label><label className={s.field}>Goods received date<input type="date" value={receivedDate} onChange={e=>setReceivedDate(e.target.value)}/></label><label className={s.field}>Line description<input value={billDescription} onChange={e=>setBillDescription(e.target.value)} maxLength={1000} placeholder="Goods or service" required/></label><label className={s.field}>Line amount (PKR)<input inputMode="decimal" value={billAmount} onChange={e=>setBillAmount(e.target.value)} required/></label></div><button className={s.button} disabled={busy||demo}>{busy?'Saving…':'Save bill draft'}</button></fieldset></form><section className={s.panel}><div className={s.panelHeading}><div><h2>Saved supplier bills</h2><p className={s.small}>Confirm what was received and choose a reviewed expense/asset account before posting.</p></div><span className={s.badge}>{bills.length} bills</span></div>{bills.length?bills.map(b=><article className={s.proposal} key={b.id}><div className={s.proposalHeading}><div><h3>{b.supplierName}</h3><p>{b.supplierReference??'No supplier reference'} · issued {b.issueDate} · {formatMinor(b.totalMinor)}</p></div><span className={`${s.badge} ${b.status==='posted'?s.good:b.status==='rejected'?s.bad:s.pending}`}>{b.status.replaceAll('_',' ')}</span></div><p>{b.lines.map(line=>`${line.description} × ${line.quantity} · ${formatMinor(line.amountMinor)}`).join(' / ')}</p>{b.status==='draft'||b.status==='needs_review'?<div className={s.reviewBillForm}><label className={s.field}>Goods received date<input type="date" value={receivedDate} onChange={e=>setReceivedDate(e.target.value)}/></label><label className={s.field}>Expense or asset account<select value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Choose account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name} ({a.type})</option>)}</select></label><div className={s.actions}><button className={s.button} disabled={busy||demo||!receivedDate||!accountId} onClick={()=>void reviewBill(b,'accept')}>Approve and post accrual</button><button className={s.secondary} disabled={busy||demo} onClick={()=>void reviewBill(b,'reject')}>Reject bill</button></div></div>:<p className={`${s.small} ${s.muted}`}>{b.status==='posted'?`Posted on ${b.goodsReceivedDate}; journal ${b.journalId}. Payment must be recorded separately.`:'Rejected during review.'}</p>}</article>):<div className={s.empty}><Icon name="file" size={28}/><h2>No supplier bills yet</h2><p>Add one above, then review its received date and account.</p></div>}</section></>}
  </>;
}
