'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {Invoice} from '../../../lib/contracts/invoices.ts';
import type {ExpenseDraft,SupplierBill} from '../../../lib/contracts/bookkeeping.ts';
import type {LedgerAccount} from '../../../lib/contracts/ledger.ts';
import type {WorkspacePayment} from '../../../lib/contracts/payments.ts';
import {invoiceRecognitionInputSchema,paymentLinkInputSchema} from '../../../lib/contracts/payments.ts';
import {api} from '../../../lib/client/api.ts';
import {bookkeepingApi} from '../../../lib/client/bookkeeping-api.ts';
import {displayMinor,RetryKey} from '../../../lib/client/bookkeeping-editor.ts';
import {usePrivateRequests} from '../../../lib/client/use-private-requests.ts';
import type {Transaction} from '../../../lib/contracts/index.ts';
import s from '../../ui/theme.module.css';
import b from './bookkeeping.module.css';

type Target={kind:'invoice'|'supplier_bill'|'expense_draft';id:string;name:string;amountMinor:string;version:number;recognized:boolean;serviceDate:string|null};
const amount=(value:string)=>`PKR ${displayMinor(value)}`;

export function PaymentsScreen({workspaceId,demo=false}:{workspaceId:string;demo?:boolean}){
 const run=usePrivateRequests();const [invoices,setInvoices]=useState<Invoice[]>([]),[bills,setBills]=useState<SupplierBill[]>([]),[expenses,setExpenses]=useState<ExpenseDraft[]>([]),[payments,setPayments]=useState<WorkspacePayment[]>([]),[accounts,setAccounts]=useState<LedgerAccount[]>([]),[transactions,setTransactions]=useState<Transaction[]>([]),[recognizedInvoices,setRecognizedInvoices]=useState<Map<string,string>>(new Map()),[postedExpenses,setPostedExpenses]=useState<Set<string>>(new Set());
 const [cursor,setCursor]=useState<string|null>(null),[targetKey,setTargetKey]=useState(''),[transactionId,setTransactionId]=useState(''),[cashAccountId,setCashAccountId]=useState(''),[serviceDate,setServiceDate]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [loading,setLoading]=useState(!demo),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');const lock=useRef(false),retry=useRef(new RetryKey());
 const targets=useMemo<Target[]>(()=>[
  ...invoices.filter(item=>item.status==='sent'||item.status==='overdue').map(item=>({kind:'invoice' as const,id:item.id,name:`${item.invoiceNumber} · ${item.clientName}`,amountMinor:item.totalMinor,version:item.reviewVersion,
   recognized:recognizedInvoices.has(item.id),serviceDate:recognizedInvoices.get(item.id)??item.supplyDate??null})),
  ...bills.filter((item):item is SupplierBill&{id:string}=>item.status==='posted'&&item.id!==null).map(item=>({kind:'supplier_bill' as const,id:item.id,name:item.supplierName,amountMinor:item.totalMinor,version:item.version,
   recognized:payments.some(payment=>payment.targetKind==='supplier_bill'&&payment.targetId===item.id),serviceDate:item.goodsReceivedDate})),
  ...expenses.filter((item):item is ExpenseDraft&{id:string;amountMinor:string;occurredOn:string}=>item.status==='accepted'&&!!item.id&&!!item.amountMinor&&!!item.occurredOn&&item.currency==='PKR'&&postedExpenses.has(item.id)).map(item=>({kind:'expense_draft' as const,id:item.id,name:item.description??item.counterparty??'Recorded expense',amountMinor:item.amountMinor,version:item.version,recognized:true,serviceDate:item.occurredOn})),
 ].filter(target=>!payments.some(payment=>payment.targetKind===target.kind&&payment.targetId===target.id)),[invoices,bills,expenses,payments,recognizedInvoices,postedExpenses]);
 const target=targets.find(item=>`${item.kind}:${item.id}`===targetKey)??null;
 const candidates=useMemo(()=>target?transactions.filter(item=>item.direction===(target.kind==='invoice'?'in':'out')&&item.currency==='PKR'&&item.amountMinor===target.amountMinor&&
  !payments.some(payment=>payment.transactionId===item.id)):[],[target,transactions,payments]);
 async function reload(signal:AbortSignal){
  const [nextInvoices,nextBills,nextExpenses,nextPayments,nextLedger]=await Promise.all([bookkeepingApi.invoices(workspaceId,signal),bookkeepingApi.bills(workspaceId,signal),bookkeepingApi.expenses(workspaceId,signal),bookkeepingApi.payments(workspaceId,signal),bookkeepingApi.ledger(workspaceId,signal)]);
  const page=await api.transactions(signal);setInvoices(nextInvoices);setBills(nextBills);setExpenses(nextExpenses);setPayments(nextPayments);setAccounts(nextLedger.accounts);setTransactions(page.items);setCursor(page.nextCursor);
  setRecognizedInvoices(new Map(nextLedger.journals.flatMap(journal=>journal.recognitionEvidence?.basis==='service_delivery'&&journal.recognitionEvidence.source.kind==='invoice'?
   [[journal.recognitionEvidence.source.invoiceId,journal.recognitionEvidence.date] as [string,string]]:[])));
  setPostedExpenses(new Set(nextLedger.journals.flatMap(journal=>journal.recognitionEvidence?.basis==='expense_incurred'&&journal.recognitionEvidence.source.kind==='manual_note'?[journal.recognitionEvidence.source.noteId]:[])));
 }
 useEffect(()=>{if(demo)return;let active=true;const controller=new AbortController();void reload(controller.signal).catch(e=>{if(active&&e.name!=='AbortError')setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;controller.abort();};},[workspaceId,demo]);
 async function action(work:()=>Promise<void>){if(lock.current||demo)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await work();}catch(e){if(!(e instanceof Error&&e.name==='AbortError'))setError(e instanceof Error?e.message:'Payment review could not complete. Your saved books are unchanged.');}finally{lock.current=false;setBusy(false);}}
 async function loadMore(){if(!cursor)return;await action(async()=>{const page=await run(signal=>api.transactions(signal,cursor));setTransactions(current=>[...current,...page.items.filter(item=>!current.some(old=>old.id===item.id))]);setCursor(page.nextCursor);});}
 async function recognize(){if(!target||target.kind!=='invoice'||!serviceDate||!confirmed)return;await action(async()=>{
  const revenueAccountId=cashAccountId;const command=invoiceRecognitionInputSchema.parse({requestId:retry.current.for({operation:'recognize_invoice',invoiceId:target.id,expectedVersion:target.version,serviceDate,revenueAccountId}),expectedVersion:target.version,serviceDate,revenueAccountId});
  await run(signal=>bookkeepingApi.recognizeInvoice(workspaceId,target.id,command,signal));const controller=new AbortController();await reload(controller.signal);setCashAccountId('');setConfirmed(false);setNotice('Earned revenue and receivable posted on the confirmed service date. No cash movement was created.');
 });}
 async function link(){if(!target||!transactionId||!cashAccountId||!confirmed)return;await action(async()=>{
  const selected=await run(signal=>bookkeepingApi.cashTransaction(workspaceId,transactionId,signal));
  const command=paymentLinkInputSchema.parse({requestId:retry.current.for({operation:'link_payment',targetKind:target.kind,targetId:target.id,transactionId,cashAccountId,expectedVersion:target.version,expectedTransactionVersion:selected.reviewVersion}),
   targetKind:target.kind,targetId:target.id,expectedVersion:target.version,transactionId,expectedTransactionVersion:selected.reviewVersion,cashAccountId});
  const saved=await run(signal=>bookkeepingApi.linkPayment(workspaceId,command,signal));setPayments(current=>[saved.payment,...current.filter(item=>item.id!==saved.payment.id)]);setInvoices(await run(signal=>bookkeepingApi.invoices(workspaceId,signal)));setBills(await run(signal=>bookkeepingApi.bills(workspaceId,signal)));
  setNotice('Payment linked to the existing bank transaction and journal. Cash was counted once.');setConfirmed(false);setTransactionId('');setTargetKey('');
 });}
 const cashAccounts=accounts.filter(item=>item.active&&item.isCashAccount);
 return <div className={s.stack}>
  <div className={s.pageHeading}><div><h1>Payments and ledger links</h1><p>Connect one exact imported cash movement to earned invoices, approved supplier bills or posted expenses.</p></div><button className={s.secondary} disabled={busy||demo} onClick={()=>void action(async()=>{const controller=new AbortController();await reload(controller.signal);setNotice('Payment, cashbook and ledger records reloaded.');})}>Reload links</button></div>
  {demo&&<p className={s.notice}>Payment linking requires a signed-in workspace and reviewed statement rows.</p>}{error&&<p className={s.error} role="alert">{error}</p>}{notice&&<p className={s.success} role="status">{notice}</p>}{loading&&<p role="status">Loading invoices, bills, accounts and cash movements…</p>}
  {!demo&&<div className={b.split}>
   <section className={`${s.panel} ${b.section}`}><h2>Open records</h2>{targets.length===0?<p className={s.muted}>There are no issued invoices or approved bills awaiting a full payment link.</p>:<ul className={b.list}>{targets.map(item=><li key={`${item.kind}:${item.id}`}><button className={`${b.record} ${targetKey===`${item.kind}:${item.id}`?b.selected:''}`} disabled={busy} onClick={()=>{setTargetKey(`${item.kind}:${item.id}`);setTransactionId('');setServiceDate(item.serviceDate??'');setCashAccountId('');setConfirmed(false);}}><strong>{item.name}</strong><span>{amount(item.amountMinor)} · {item.kind==='invoice'?'incoming':'outgoing'}</span><span className={s.badge}>{item.kind==='invoice'?(item.recognized?'earned revenue posted':'service recognition required'):'received '+(item.serviceDate??'date unknown')}</span></button></li>)}</ul>}</section>
   <section className={`${s.panel} ${b.section}`}><h2>{target?`Link payment · ${target.name}`:'Select an open invoice or bill'}</h2>{target&&<>
    {target.kind==='invoice'&&!target.recognized&&<div className={s.stack}><h3>Confirm earned service</h3><label className={s.field}>Service-delivery date<input type="date" required disabled={busy} value={serviceDate} onChange={e=>{setConfirmed(false);setServiceDate(e.target.value);}}/></label><label className={s.field}>Revenue account<select disabled={busy} value={cashAccountId} onChange={e=>{setConfirmed(false);setCashAccountId(e.target.value);}}><option value="">Select a reviewed revenue account</option>{accounts.filter(a=>a.active&&a.role==='revenue').map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label><label><input type="checkbox" checked={confirmed} disabled={busy||!serviceDate||!cashAccountId} onChange={e=>setConfirmed(e.target.checked)}/> I confirm the service was delivered on this date and reviewed the revenue account.</label><button className={s.button} disabled={busy||!serviceDate||!cashAccountId||!confirmed} onClick={()=>void recognize()}>Post earned invoice revenue</button><p className={s.small}>This posts receivable and revenue only. It does not record a cash payment.</p></div>}
    {(target.kind==='supplier_bill'||target.recognized)&&<div className={s.stack}><label className={s.field}>Imported statement movement<select disabled={busy} value={transactionId} onChange={e=>{setTransactionId(e.target.value);setConfirmed(false);}}><option value="">Choose an exact matching bank movement</option>{candidates.map(item=><option key={item.id} value={item.id}>{item.date} · {item.direction==='in'?'inflow':'outflow'} · {amount(item.amountMinor)} · {item.description.slice(0,90)}</option>)}</select></label>{!candidates.length&&<p className={s.muted}>No currently loaded statement row exactly matches this full amount and direction. Load older rows or resolve the statement first; a partial/approximate match cannot be posted here.</p>}{cursor&&<button className={s.secondary} disabled={busy} onClick={()=>void loadMore()}>Load more cashbook rows</button>}<label className={s.field}>Cash or bank account<select disabled={busy} value={cashAccountId} onChange={e=>{setCashAccountId(e.target.value);setConfirmed(false);}}><option value="">Select a reviewed cash/bank account</option>{cashAccounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label><label><input type="checkbox" checked={confirmed} disabled={busy||!transactionId||!cashAccountId} onChange={e=>setConfirmed(e.target.checked)}/> I verified this complete bank movement settles the selected record.</label><button className={s.button} disabled={busy||!transactionId||!cashAccountId||!confirmed} onClick={()=>void link()}>Link full payment and post ledger entry</button><p className={s.small}>The cashbook transaction stays the single cash movement. This adds only the receivable/payable settlement journal. Partial payments and manual-only payments are not yet supported.</p></div>}
   </>}</section>
  </div>}
  <section className={`${s.panel} ${b.section}`}><h2>Linked payments</h2>{payments.length===0?<p className={s.muted}>No payments have been linked.</p>:<div className={b.tableWrap}><table className={b.table}><thead><tr><th scope="col">Date</th><th scope="col">Record</th><th scope="col">Cash row</th><th scope="col">Amount · PKR</th><th scope="col">Journal</th></tr></thead><tbody>{payments.map(payment=><tr key={payment.id}><td>{payment.date}</td><td>{payment.targetKind.replace('_',' ')} · {payment.targetId.slice(0,8)}</td><td>{payment.transactionId.slice(0,8)}</td><td>{displayMinor(payment.amountMinor)}</td><td>{payment.journalId.slice(0,8)}</td></tr>)}</tbody></table></div>}</section>
 </div>;
}
