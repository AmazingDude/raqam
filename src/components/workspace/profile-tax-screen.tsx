'use client';
import { useEffect, useState } from 'react';
import type { Workspace } from '../../lib/contracts/index.ts';
import { getCurrentPakistanTaxYear, pakistanTaxPeriod, taxReadinessCompletion, type TaxReadinessProfile } from '../../lib/contracts/tax-readiness.ts';
import { api } from '../../lib/client/api.ts';
import { usePrivateRequests } from '../../lib/client/use-private-requests.ts';
import { bookkeepingApi, type LedgerReport } from '../../lib/client/bookkeeping-api.ts';
import { Icon } from '../ui/icon.tsx';
import s from '../ui/theme.module.css';

function useSavedProfile(workspaceId: string) {
  const request = usePrivateRequests();
  const [profile, setProfile] = useState<TaxReadinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    void request(signal => api.taxReadiness(workspaceId, signal)).then(result => {
      if (live) { setProfile(result.profile); setLoading(false); }
    }).catch(reason => {
      if (live) { setError(reason instanceof Error ? reason.message : 'Saved tax profile could not load.'); setLoading(false); }
    });
    return () => { live = false; };
  }, [request, retry, workspaceId]);
  return { profile, loading, error, reload: () => setRetry(value => value + 1) };
}

export function ProfileScreen({workspace,onTaxReadiness}:{workspace:Workspace;onTaxReadiness:()=>void}) {
  const [tab,setTab]=useState<'business'|'tax'>('business');
  const { profile, loading, error, reload } = useSavedProfile(workspace.id);
  const completion = taxReadinessCompletion(profile);
  const profileStatus = loading ? 'Loading' : error ? 'Unavailable' : completion.complete ? 'Self-reported profile complete' : profile ? 'Needs answers' : 'Not started';
  return <>
    <div className={s.pageHeading}><div><h1>Business profile</h1><p>Review workspace details and your Pakistan income-tax facts.</p></div><span className={`${s.badge} ${completion.complete?'good':'pending'}`}>{profileStatus}</span></div>
    <div className={s.tabs} aria-label="Profile sections"><button className={tab==='business'?s.selectedTab:''} aria-pressed={tab==='business'} onClick={()=>setTab('business')}>Business details</button><button className={tab==='tax'?s.selectedTab:''} aria-pressed={tab==='tax'} onClick={()=>setTab('tax')}>Tax profile</button></div>
    {tab==='business'?<section className={s.profileGrid}>
      <article className={s.panel}><div className={s.panelHeading}><div><h2>Workspace basics</h2><p className={s.small}>Currently saved for this workspace.</p></div><Icon name="book" size={20}/></div><dl className={s.profileDetails}><dt>Business name</dt><dd>{workspace.businessName}</dd><dt>Book currency</dt><dd>{workspace.currency} · Pakistani rupee</dd><dt>Accounting workflow</dt><dd>Reviewed double-entry ledger</dd></dl></article>
      <article className={s.panel}><div className={s.panelHeading}><div><h2>Income-tax profile</h2><p className={s.small}>Owner-confirmed details for the current Pakistan tax year.</p></div></div>
        {loading?<p role="status">Loading saved tax profile…</p>:error?<div><p role="alert" className={s.error}>{error}</p><button className={s.secondary} onClick={reload}>Retry</button></div>:profile?<><div className={s.profileChecklist}><Fact title="Taxpayer type" status={profile.answers.taxpayerType.replaceAll('_',' ')}/><Fact title="Tax residency" status={profile.answers.residency.replaceAll('_',' ')}/><Fact title="Region" status={profile.answers.provinceOrTerritory.replaceAll('_',' ')}/><Fact title="Income sources" status={profile.answers.incomeSources.map(value=>value.replaceAll('_',' ')).join(', ')}/><Fact title="Profile completion" status={completion.complete?'Complete · self-reported':`Needs ${completion.missing.length} item${completion.missing.length===1?'':'s'}`}/></div><p className={s.noticeText}>Saved version {profile.version} for tax year {profile.taxYear}. These answers are self-reported; they are not independently verified taxpayer evidence.</p></>:<p className={s.noticeText}>No tax profile is saved yet. Start the interview to record taxpayer type, residency, region, income sources and available records.</p>}
        {completion.missing.length>0&&profile&&<ul>{completion.missing.map(item=><li key={item}>{item}</li>)}</ul>}
        <button className={s.button} onClick={onTaxReadiness}>{profile?'Review tax profile':'Start tax profile'}</button>
      </article>
      <article className={s.panel}><div className={s.panelHeading}><div><h2>Evidence and review</h2><p className={s.small}>Status is tied to saved answers and books.</p></div></div><ol className={s.profileSteps}><li>Save answers in the tax readiness interview.</li><li>Collect supporting records for each declared income source.</li><li>Reconcile the tax-year ledger and confirm excluded or missing records.</li><li>Have a qualified Pakistan tax practitioner review the workpaper.</li></ol><p className={s.noticeText}>Legal registration identifiers and business-activity classifications are not currently collected. The income-tax draft will call these out when relevant rather than infer them.</p></article>
    </section>:<section className={s.panel}><div className={s.panelHeading}><div><h2>Tax readiness profile</h2><p className={s.small}>Pakistan income tax only · {getCurrentPakistanTaxYear()} tax year · self-reported facts</p></div><span className={`${s.badge} ${completion.complete?'good':'pending'}`}>{profileStatus}</span></div><div className={s.profileChecklist}><p>The interview records taxpayer type, residency, region, filing history, income sources, records on hand and wealth records. Saving the complete interview unlocks a draft workpaper, not a tax calculation or filing-ready return.</p><button className={s.button} onClick={onTaxReadiness}>Open tax readiness interview</button></div>{profile&&completion.missing.length>0&&<div className={s.notice}><p><strong>Still needed:</strong> {completion.missing.join('; ')}.</p></div>}<div className={s.notice}><p><strong>Review boundary.</strong> Nothing is inferred from silence. Saved answers remain self-reported until evidence is checked by a qualified practitioner.</p></div></section>}
  </>;
}

function Fact({title,status}:{title:string;status:string}) {return <div className={s.profileFact}><span>{title}</span><span className={s.badge}>{status}</span></div>;}
function formatPkrMinor(value:string):string { const amount=BigInt(value);const sign=amount<0n?'-':'';const absolute=amount<0n?-amount:amount;return `${sign}PKR ${new Intl.NumberFormat('en-PK').format(absolute/100n)}.${(absolute%100n).toString().padStart(2,'0')}`; }

type WorkpaperState = { profile: TaxReadinessProfile | null; ledger: LedgerReport | null; error: string; loading: boolean };
export function TaxWorkpaperScreen({workspaceId, onTaxReadiness}:{workspaceId:string;onTaxReadiness:()=>void}) {
  const request = usePrivateRequests();
  const [state,setState]=useState<WorkpaperState>({profile:null,ledger:null,error:'',loading:true});
  const [generated,setGenerated]=useState(false);
  const [retry,setRetry]=useState(0);
  const taxYear=getCurrentPakistanTaxYear();
  const period=pakistanTaxPeriod(taxYear);
  useEffect(()=>{
    let live=true;
    setState({profile:null,ledger:null,error:'',loading:true});
    void Promise.all([
      request(signal=>api.taxReadiness(workspaceId,signal)),
      request(signal=>bookkeepingApi.report(workspaceId,{kind:'income_statement',from:period.startDate,to:period.endDate},signal)),
    ]).then(([tax,ledger])=>{if(live)setState({profile:tax.profile,ledger,error:'',loading:false});})
      .catch(reason=>{if(live)setState({profile:null,ledger:null,error:reason instanceof Error?reason.message:'Tax workpaper evidence could not load.',loading:false});});
    return()=>{live=false;};
  },[request,retry,workspaceId,period.startDate,period.endDate]);
  const completion=taxReadinessCompletion(state.profile);
  const coverage=state.ledger?.coverage;
  const incomeStatement=state.ledger&&'totalRevenueMinor' in state.ledger?state.ledger:null;
  const ledgerReady=Boolean(coverage?.isComplete && coverage.selectedFrom<=period.startDate && coverage.selectedThrough>=period.endDate);
  const recordRequirements=state.profile?.answers.incomeSources.filter(source=>source!=='none'&&source!=='not_sure').map(source=>source.replaceAll('_',' '))??[];
  const canGenerate=Boolean(state.profile&&completion.complete&&incomeStatement&&!state.error);
  return <>
    <div className={s.pageHeading}><div><h1>Tax workpaper</h1><p>Pakistan income tax · TY{taxYear} · {period.startDate} to {period.endDate}</p></div><span className={`${s.badge} ${generated?'good':canGenerate?'pending':'pending'}`}>{generated?'Draft generated':canGenerate?'Draft available':'Needs profile'}</span></div>
    {state.error&&<div className={s.notice} role="alert"><p>{state.error}</p><button className={s.secondary} onClick={()=>setRetry(value=>value+1)}>Retry</button></div>}
    <section className={s.taxGate} aria-labelledby="tax-gate-title"><div className={s.taxGateIcon}><Icon name="review" size={24}/></div><div><h2 id="tax-gate-title">{canGenerate?'A review draft can be generated':'Complete the saved profile to generate a draft'}</h2><p>The draft summarizes owner-confirmed facts and ledger evidence. It does not determine taxable income or liability. An approved, year-specific FBR rule set and qualified practitioner review are still required before any return can be prepared.</p></div></section>
    <div className={s.taxColumns}><section className={s.panel}><div className={s.panelHeading}><div><h2>Before a workpaper can be prepared</h2><p className={s.small}>Current gate status for this tax year.</p></div></div><div className={s.profileChecklist}>
      <Fact title="Saved taxpayer profile" status={state.loading?'Loading':state.profile?(completion.complete?'Complete · self-reported':`Needs ${completion.missing.length} answers`):'Missing'}/>
      <Fact title="Tax year and tax type" status={`TY${taxYear} · Pakistan income tax`}/>
      <Fact title="Reviewed official rule version" status="Unavailable · calculation blocked"/>
      <Fact title="Ledger history for tax year" status={state.loading?'Loading':!coverage?'Unavailable':ledgerReady?'Complete coverage':'Incomplete coverage'}/>
      <Fact title="Income and withholding evidence" status={recordRequirements.length?`${recordRequirements.length} income source(s) declared · practitioner check required`:'Not declared'}/>
      <Fact title="Qualified practitioner review" status="Required · not yet reviewed"/>
    </div>{state.profile&&!completion.complete&&<><p className={s.noticeText}>Complete these items in the tax readiness interview:</p><ul>{completion.missing.map(item=><li key={item}>{item}</li>)}</ul><button className={s.button} onClick={onTaxReadiness}>Complete profile</button></>}</section>
    <section className={s.panel}><div className={s.panelHeading}><div><h2>Workpaper draft</h2><p className={s.small}>Source-linked summary; no tax calculation.</p></div></div><ul className={s.taxContents}><li>Saved taxpayer facts and their self-reported status</li><li>Tax-year income-statement totals and ledger coverage</li><li>Declared income sources and records to verify</li><li>Missing rule pack, supporting evidence and practitioner sign-off</li></ul>
      <button className={s.button} disabled={!canGenerate||state.loading} onClick={()=>{setGenerated(true);window.setTimeout(()=>window.print(),0);}}>{state.loading?'Loading evidence…':generated?'Print draft workpaper':'Generate and print draft'}</button>
      {!state.loading&&state.profile&&completion.complete&&<p className={s.noticeText}>{ledgerReady?'Ledger coverage spans the full tax year.':'Ledger data is available, but coverage does not yet span the full tax year; that limitation will be included in the draft.'}</p>}
      {generated&&state.profile&&incomeStatement&&<article className={s.workpaperPreview} aria-live="polite"><h3>Pakistan income-tax workpaper · TY{taxYear}</h3><p><strong>Status:</strong> Draft only · practitioner review pending · no tax liability calculated.</p><p><strong>Workspace:</strong> {incomeStatement.workspaceId} · <strong>Profile version:</strong> {state.profile.version} · <strong>Saved:</strong> {new Date(state.profile.updatedAt).toLocaleString('en-PK')}</p><p><strong>Taxpayer:</strong> {state.profile.answers.taxpayerType.replaceAll('_',' ')} · {state.profile.answers.residency.replaceAll('_',' ')} · {state.profile.answers.provinceOrTerritory.replaceAll('_',' ')}</p><p><strong>Income sources declared:</strong> {state.profile.answers.incomeSources.join(', ')}</p><p><strong>Tax-year ledger:</strong> {formatPkrMinor(incomeStatement.totalRevenueMinor)} revenue; {formatPkrMinor(incomeStatement.totalExpenseMinor)} expenses; {formatPkrMinor(incomeStatement.netIncomeMinor)} net income. Coverage {coverage?.selectedFrom} to {coverage?.selectedThrough}; full-period coverage {ledgerReady?'yes':'no'}.</p><p><strong>Open items:</strong> official TY{taxYear} rule version and deterministic calculations; source-document verification; withholding/supporting schedules; practitioner review.</p></article>}
    </section></div>
    <p className={s.taxFooter}>This draft is a bookkeeping aid. It is not a return, tax opinion, filing instruction or tax calculation. Raqam will not file or pay taxes.</p>
  </>;
}
