'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/client/api.ts';
import { usePrivateRequests } from '../../lib/client/use-private-requests.ts';
import { formatAmount, parseAmount } from '../../lib/server/money.ts';
import type { LedgerAccount, LedgerHistoryCoverage, LedgerJournal } from '../../lib/contracts/ledger.ts';
import { Icon } from '../ui/icon.tsx';
import s from '../ui/theme.module.css';

type Report = Awaited<ReturnType<typeof api.ledgerReport>>;
type Snapshot = { accounts: LedgerAccount[]; journals: LedgerJournal[]; coverage: LedgerHistoryCoverage };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const reportNames = { trial_balance:'Trial balance', income_statement:'Income statement', balance_sheet:'Balance sheet', cash_flow:'Cash-flow statement' } as const;
function cash(value:string) { return `PKR ${formatAmount(value)}`; }

export function LedgerScreen({demo}:{demo:boolean}) {
  const run=usePrivateRequests();
  const [tab,setTab]=useState<'reports'|'accounts'|'journals'>('reports');
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[report,setReport]=useState<Report|null>(null);
  const [kind,setKind]=useState<keyof typeof reportNames>('trial_balance');
  const [from,setFrom]=useState('2026-01-01'),[to,setTo]=useState(today());
  const [historyFrom,setHistoryFrom]=useState('2026-01-01'),[historyThrough,setHistoryThrough]=useState(today());
  const [loading,setLoading]=useState(!demo),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [accountName,setAccountName]=useState(''),[accountCode,setAccountCode]=useState(''),[accountType,setAccountType]=useState<'asset'|'liability'|'equity'|'revenue'|'expense'>('expense');
  async function load() {
    if(demo){setLoading(false);return;}
    setError('');setLoading(true);
    try { const data=await run(signal=>api.ledger(signal));setSnapshot(data);setHistoryFrom(data.coverage.selectedFrom);setHistoryThrough(data.coverage.selectedThrough);setFrom(data.coverage.selectedFrom);setTo(data.coverage.selectedThrough); }
    catch(e){setError(e instanceof Error?e.message:'Ledger could not load. Retry.');}
    finally {setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  async function loadReport() {
    if(!snapshot)return;
    setBusy(true);setError('');
    try {
      const query=new URLSearchParams(kind==='trial_balance'||kind==='balance_sheet'?{kind,asOf:to}:kind==='cash_flow'?{kind,from,to,method:'direct'}:{kind,from,to});
      const result=await run(signal=>api.ledgerReport(query.toString(),signal));setReport(result);
    } catch(e){setError(e instanceof Error?e.message:'Report could not load. Check its dates and retry.');}
    finally {setBusy(false);}
  }
  async function createAccount(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!accountName.trim()||!accountCode.trim())return;
    const role=accountType==='revenue'?'revenue':accountType==='expense'?'expense':'other';
    const cashFlowClass=accountType==='asset'?'unclassified':accountType==='liability'||accountType==='equity'?'financing':'operating';
    setBusy(true);setError('');
    try { await run(signal=>api.saveLedgerAccount({requestId:crypto.randomUUID(),id:null,expectedVersion:null,code:accountCode.trim(),name:accountName.trim(),type:accountType,cashFlowClass,role,isCashAccount:false,active:true},signal));setAccountCode('');setAccountName('');setNotice('Account saved.');await load(); }
    catch(e){setError(e instanceof Error?e.message:'Account could not be saved.');}
    finally{setBusy(false);}
  }
  async function saveHistoryRange(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError('');setNotice('');
    try { const coverage=await run(signal=>api.saveLedgerHistory(historyFrom,historyThrough,signal));setSnapshot(current=>current?{...current,coverage}:current);setFrom(coverage.selectedFrom);setTo(coverage.selectedThrough);setReport(null);setNotice('Selected history range saved. Reports will show any evidence gaps.'); }
    catch(e){setError(e instanceof Error?e.message:'History range could not be saved. Check the dates and retry.');}
    finally{setBusy(false);}
  }
  const accounts=useMemo(()=>snapshot?.accounts??[],[snapshot]);
  const rows=report&&'rows'in report?report.rows:null;
  return <>
    <div className={s.pageHeading}><div><h1>Books</h1><p>Approved journals and exact reports, with source-history coverage visible.</p></div><button className={s.secondary} onClick={()=>void load()} disabled={loading||busy}><Icon name="reset" size={16}/> Refresh books</button></div>
    {demo&&<div className={s.notice}><p><strong>Ledger connection preview.</strong> This example workspace does not contain saved ledger data; open your signed-in workspace to load the owner-scoped ledger.</p></div>}
    {!demo&&snapshot&&<><section className={`${s.booksHealth} ${snapshot.coverage.isComplete?s.booksHealthGood:s.booksHealthPending}`} aria-live="polite"><span className={s.booksHealthMark}><Icon name={snapshot.coverage.isComplete?'check':'review'} size={18}/></span><div><strong>{snapshot.coverage.isComplete?'History coverage is complete':'History coverage needs attention'}</strong><p>{snapshot.coverage.selectedFrom} through {snapshot.coverage.selectedThrough} · {snapshot.coverage.missingSourceKinds.length?`Missing: ${snapshot.coverage.missingSourceKinds.join(', ')}`:'No source types missing'}{snapshot.coverage.unsupportedOpeningBalanceAccountIds.length?` · ${snapshot.coverage.unsupportedOpeningBalanceAccountIds.length} unsupported opening balance(s)`:''}</p></div><span className={s.badge}>{snapshot.coverage.isComplete?'Complete':'Incomplete'}</span></section><form className={`${s.panel} ${s.historyRange}`} onSubmit={saveHistoryRange}><div><strong>History range</strong><p className={s.small}>Choose the period you are reconstructing. Missing records stay incomplete, not zero.</p></div><label className={s.field}>From<input type="date" value={historyFrom} onChange={e=>setHistoryFrom(e.target.value)} required/></label><label className={s.field}>Through<input type="date" value={historyThrough} onChange={e=>setHistoryThrough(e.target.value)} required/></label><button className={s.secondary} disabled={busy}>Save range</button></form></>}
    {(error||notice)&&<p role={error?'alert':'status'} className={error?s.error:s.success}>{error||notice}</p>}
    <div className={s.tabs} aria-label="Bookkeeping views">{(['reports','accounts','journals'] as const).map(key=><button key={key} className={tab===key?s.selectedTab:''} aria-pressed={tab===key} onClick={()=>setTab(key)}>{key==='reports'?'Reports':key==='accounts'?'Chart of accounts':'Journal activity'}</button>)}</div>
    {loading&&<p role="status" className={s.muted}>Loading ledger and coverage…</p>}
    {!loading&&!demo&&!snapshot&&<section className={`${s.panel} ${s.empty}`}><Icon name="book" size={28}/><h2>Ledger storage is not available yet</h2><p>{error||'Check the workspace connection and try again.'}</p><button className={s.secondary} onClick={()=>void load()}>Retry loading ledger</button></section>}
    {tab==='reports'&&snapshot&&<section className={s.panel}>
      <div className={s.panelHeading}><div><h2>Financial statements</h2><p className={s.small}>Computed from posted journals; cash flow uses reviewed cash movements.</p></div><span className={s.badge}>PKR</span></div>
      <div className={s.filters}><label className={s.field}>Report<select value={kind} onChange={e=>{setKind(e.target.value as keyof typeof reportNames);setReport(null);}}>{Object.entries(reportNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{(kind==='trial_balance'||kind==='balance_sheet')?<label className={s.field}>As of<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>:<><label className={s.field}>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className={s.field}>Through<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></>}<button className={s.button} disabled={busy} onClick={()=>void loadReport()}>{busy?'Calculating…':'Run report'}</button></div>
      {!report?<div className={s.empty}><h2>Choose a report and date range</h2><p>Results include only approved postings within selected history coverage.</p></div>:<ReportResult report={report}/>}
    </section>}
    {tab==='accounts'&&snapshot&&<section className={s.panel}>
      <div className={s.panelHeading}><div><h2>Chart of accounts</h2><p className={s.small}>{accounts.length} accounts · account edits are version checked.</p></div></div>
      <div className={s.tableWrap}><table className={s.table}><caption className={s.srOnly}>Ledger accounts by code, name, type, role and status</caption><thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Role</th><th>Status</th></tr></thead><tbody>{accounts.map(a=><tr key={a.id}><td data-label="Code">{a.code}</td><td data-label="Account">{a.name}</td><td data-label="Type">{a.type}</td><td data-label="Role">{a.role.replaceAll('_',' ')}</td><td data-label="Status">{a.active?'Active':'Inactive'}</td></tr>)}</tbody></table></div>
      <form className={s.inlineForm} onSubmit={createAccount}><h3>Add account</h3><label className={s.field}>Code<input value={accountCode} onChange={e=>setAccountCode(e.target.value)} maxLength={32} required/></label><label className={s.field}>Name<input value={accountName} onChange={e=>setAccountName(e.target.value)} maxLength={120} required/></label><label className={s.field}>Type<select value={accountType} onChange={e=>setAccountType(e.target.value as typeof accountType)}>{['asset','liability','equity','revenue','expense'].map(x=><option key={x}>{x}</option>)}</select></label><button className={s.secondary} disabled={busy}>Add account</button></form>
      <p className={`${s.small} ${s.muted}`} style={{padding:'0 24px 20px'}}>Cash account setup and reporting classifications require reviewed ledger policy. This form creates non-cash accounts only.</p>
    </section>}
    {tab==='journals'&&snapshot&&<section className={s.panel}><div className={s.panelHeading}><div><h2>Journal activity</h2><p className={s.small}>Posted entries are immutable; corrections use reviewed reversals.</p></div><span className={s.badge}>{snapshot.journals.length} entries</span></div>{snapshot.journals.length?<div className={s.tableWrap}><table className={s.table}><caption className={s.srOnly}>Posted journal entries with dates, descriptions, lines and linked sources</caption><thead><tr><th>Date</th><th>Description</th><th>Lines</th><th>Sources</th></tr></thead><tbody>{snapshot.journals.map(j=><tr key={j.id}><td data-label="Date">{j.entryDate}</td><td data-label="Description">{j.description}<small>{j.status} · version {j.version}</small></td><td data-label="Lines">{j.lines.map(line=><span key={line.id} className={s.journalLine}>{snapshot.accounts.find(a=>a.id===line.accountId)?.name??'Account'} · Dr {cash(line.debitMinor)} / Cr {cash(line.creditMinor)}</span>)}</td><td data-label="Sources">{j.sources.map(source=>source.kind).join(', ')||'No linked source'}</td></tr>)}</tbody></table></div>:<div className={s.empty}><h2>No journal entries yet</h2><p>Reviewed supplier bills and approved financial events will appear here.</p></div>}</section>}
  </>;
}

function ReportResult({report}:{report:Report}) {
  if('rows'in report)return <div className={s.tableWrap}><table className={s.table}><caption className={s.srOnly}>Trial balance as of {report.asOf}</caption><thead><tr><th>Code</th><th>Account</th><th className={s.amount}>Debit</th><th className={s.amount}>Credit</th></tr></thead><tbody>{report.rows.map(row=><tr key={row.accountId}><td data-label="Code">{row.code}</td><td data-label="Account">{row.name}</td><td className={s.amount} data-label="Debit">{cash(row.debitMinor)}</td><td className={s.amount} data-label="Credit">{cash(row.creditMinor)}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Totals</th><th className={s.amount}>{cash(report.debitTotalMinor)}</th><th className={s.amount}>{cash(report.creditTotalMinor)}</th></tr></tfoot></table></div>;
  if('revenueRows'in report)return <div className={s.reportSummary}><p><span>Revenue</span><strong>{cash(report.totalRevenueMinor)}</strong></p><p><span>Expenses</span><strong>{cash(report.totalExpenseMinor)}</strong></p><p><span>Net income</span><strong>{cash(report.netIncomeMinor)}</strong></p><ReportRows title="Revenue accounts" rows={report.revenueRows}/><ReportRows title="Expense accounts" rows={report.expenseRows}/></div>;
  if('assetRows'in report)return <div className={s.reportSummary}><p><span>Total assets</span><strong>{cash(report.totalAssetsMinor)}</strong></p><p><span>Total liabilities</span><strong>{cash(report.totalLiabilitiesMinor)}</strong></p><p><span>Total equity</span><strong>{cash(report.totalEquityMinor)}</strong></p><p><span>Accounting equation</span><strong>{report.isBalanced?'Balances':'Needs review'}</strong></p><ReportRows title="Assets" rows={report.assetRows}/><ReportRows title="Liabilities" rows={report.liabilityRows}/><ReportRows title="Equity" rows={report.equityRows}/></div>;
  return <div className={s.reportSummary}><p><span>Operating net</span><strong>{cash(report.operatingNetMinor)}</strong></p><p><span>Investing net</span><strong>{cash(report.investingNetMinor)}</strong></p><p><span>Financing net</span><strong>{cash(report.financingNetMinor)}</strong></p><p><span>Unclassified, needs review</span><strong>{cash(report.unclassifiedNetMinor)} · {report.unclassifiedCount} movements</strong></p><p><span>Net cash movement</span><strong>{cash(report.netCashMovementMinor)}</strong></p><p><span>Reconciles to ledger</span><strong>{report.reconcilesToLedger?'Yes':'No — investigate'}</strong></p></div>;
}
function ReportRows({title,rows}:{title:string;rows:Array<{accountId:string;code:string;name:string;balanceMinor:string}>}) {return <details className={s.reportDetails}><summary>{title} ({rows.length})</summary>{rows.length?<ul>{rows.map(row=><li key={row.accountId}><span>{row.code} · {row.name}</span><strong>{cash(row.balanceMinor)}</strong></li>)}</ul>:<p className={s.muted}>No posted activity in this section.</p>}</details>;}
