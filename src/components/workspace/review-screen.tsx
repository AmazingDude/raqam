'use client';
import { useRef, useState } from 'react';
import type { Category, CategoryProposal, SupportingDocument, Transaction } from '../../lib/contracts/index.ts';
import type { ProposalRecord } from '../../lib/contracts/proposals.ts';
import { CATEGORIES } from '../../lib/contracts/index.ts';
import { categoryLabels, money } from '../../lib/client/presentation.ts';
import { api } from '../../lib/client/api.ts';
import { usePrivateRequests } from '../../lib/client/use-private-requests.ts';
import { Icon } from '../ui/icon.tsx';
import s from '../ui/theme.module.css';
export type ReviewableCategoryProposal = CategoryProposal & { reviewVersion?: number; transactionVersion?: number };
export type ReviewableMatchProposal = Omit<ProposalRecord, 'suggestion'> & {
  suggestion: Extract<ProposalRecord['suggestion'], { kind: 'match' }>;
};
type MatchScanSnapshot = Awaited<ReturnType<typeof import('../../lib/client/api.ts').api.generateMatchProposals>>['snapshot'];
function ProposalTrail({proposalId,workspaceId}:{proposalId:string;workspaceId:string}) {
  const run=usePrivateRequests(),lock=useRef(false);
  const [open,setOpen]=useState(false),[loaded,setLoaded]=useState(false),[items,setItems]=useState<Awaited<ReturnType<typeof api.proposalReviews>>['items']>([]);
  const [cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  async function load(nextCursor:string|null=null) {
    if(lock.current)return;lock.current=true;setLoading(true);setError('');
    try {
      const page=await run(signal=>api.proposalReviews(proposalId,workspaceId,signal,nextCursor));
      setItems(current=>nextCursor?[...current,...page.items]:page.items);setCursor(page.nextCursor);setLoaded(true);
    }catch(failure){setError(failure instanceof Error?failure.message:'Saved decision history could not load. Retry.');}
    finally{lock.current=false;setLoading(false);}
  }
  return <div className={s.stack} style={{gap:8}}>
    <button className={s.textButton} type="button" aria-expanded={open} onClick={()=>{const next=!open;setOpen(next);if(next&&!loaded)void load();}}>{open?'Hide saved decision history':'View saved decision history'}</button>
    {open&&<div className={s.stack}>
      <p className={`${s.small} ${s.muted}`}>Owner decisions are saved with timestamps and before/after proposal values.</p>
      {error&&<p className={s.error} role="alert">{error} <button className={s.textButton} type="button" onClick={()=>void load()}>Retry</button></p>}
      {loaded&&!items.length&&<p className={s.notice}>No owner decisions have been saved for this proposal.</p>}
      {items.map(item=><article key={item.id} className={s.notice}>
        <strong>{String(item.decision.decision??'Review decision').replaceAll('_',' ')}</strong>
        <time className={s.small} dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
        <p>{item.previous.status} → {item.current.status}</p>
        <details><summary>Previous and current values</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12}}>{JSON.stringify({previous:item.previous,current:item.current},null,2)}</pre></details>
      </article>)}
      {!loaded&&!error&&<p role="status">Loading saved decisions…</p>}
      {cursor!==null&&<button className={s.secondary} type="button" disabled={loading} onClick={()=>void load(cursor)}>{loading?'Loading saved decisions…':'Load more decisions'}</button>}
    </div>}
  </div>;
}
function SavedCategoryCard({proposal,record,onReview,onRecord}:{proposal:ReviewableCategoryProposal;record:Transaction|undefined;onReview:(category:Category|null)=>void|Promise<void>;onRecord:(record:Transaction)=>void}) {
  const run=usePrivateRequests(),lock=useRef(false);
  const [fetched,setFetched]=useState<Transaction|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const current=record??fetched;
  async function load() {
    if(lock.current)return;lock.current=true;setLoading(true);setError('');
    try {
      const result=await run(signal=>api.transaction(proposal.transactionId,signal));
      if(result.transaction.id!==proposal.transactionId||result.transaction.workspaceId!==proposal.workspaceId)throw new Error('The transaction does not belong to this proposal. Reload the workspace.');
      setFetched(result.transaction);
    }catch(error){setError(error instanceof Error?error.message:'The source row could not load. Retry.');}
    finally {lock.current=false;setLoading(false);}
  }
  if(current)return <CategoryCard proposal={proposal} record={current} onReview={onReview} onRecord={()=>onRecord(current)}/>;
  return <article className={s.proposal}><h2>Category suggestion needs its source row</h2><p>{proposal.rationale}</p><p className={s.notice}>This transaction is outside the loaded cashbook page. Load its original record before accepting or correcting the suggestion.</p>{error&&<p role="alert" className={s.error}>{error}</p>}<button className={s.secondary} disabled={loading} onClick={load}>{loading?'Loading original record…':'Load original transaction'}</button>{proposal.reviewVersion!==undefined&&<ProposalTrail proposalId={proposal.id} workspaceId={proposal.workspaceId}/>}</article>;
}
function CategoryCard({proposal,record,onReview,onRecord}:{proposal:ReviewableCategoryProposal;record:Transaction;onReview:(category:Category|null)=>void|Promise<void>;onRecord:()=>void}) {
  const [category,setCategory]=useState<Category>(proposal.category);
  const [saving,setSaving]=useState(false),lock=useRef(false);
  async function review(value:Category|null){if(lock.current)return;lock.current=true;setSaving(true);try{await onReview(value);}finally{lock.current=false;setSaving(false);}}
  return <article className={s.proposal}><div className={s.proposalHeading}><div><h2>{record.description}</h2><p>PKR {money(record.amountMinor)} · CSV row {record.source.rowNumber}</p></div><span className={`${s.badge} ${s.pending}`}>Category proposed</span></div><p>{proposal.rationale}</p><div className={s.reviewChoice}><label className={s.field}>Review category<select value={category} disabled={saving} onChange={event=>setCategory(event.target.value as Category)}>{CATEGORIES.map(c=><option value={c} key={c}>{categoryLabels[c]}</option>)}</select></label><button className={s.button} disabled={saving} onClick={()=>void review(category)}>{category===proposal.category?'Accept category':'Save changed category'}</button><button className={s.secondary} disabled={saving} onClick={()=>void review(null)}>Reject suggestion</button></div><button className={s.textButton} style={{justifySelf:'start'}} onClick={onRecord}>View original source row</button>{proposal.reviewVersion!==undefined&&<ProposalTrail proposalId={proposal.id} workspaceId={proposal.workspaceId}/>}</article>;
}
function ReviewedCategoryCard({proposal,record}:{proposal:ReviewableCategoryProposal;record:Transaction|undefined}) {
  return <article className={s.proposal}><div className={s.proposalHeading}><div><h3>{record?.description??'Reviewed transaction category'}</h3><p>{categoryLabels[proposal.category]} · {record?`PKR ${money(record.amountMinor)} · CSV row ${record.source.rowNumber}`:`Transaction ${proposal.transactionId}`}</p></div><span className={`${s.badge} ${proposal.status==='accepted'?s.good:s.pending}`}>{proposal.status==='accepted'?'Accepted':'Rejected'}</span></div><p>{proposal.rationale}</p><ProposalTrail proposalId={proposal.id} workspaceId={proposal.workspaceId}/></article>;
}
function MatchCard({doc,records,onMatch,onReject,onDocuments,onRecord}:{doc:SupportingDocument;records:Transaction[];onMatch:(id:string)=>void;onReject:()=>void;onDocuments:()=>void;onRecord:(r:Transaction)=>void}) {
  const fields=doc.correctedFields??doc.extractedFields;
  const candidates=records.filter(r=>r.direction==='out' && (fields.totalMinor===null || r.amountMinor===fields.totalMinor) && r.matchStatus!=='accepted');
  const [candidate,setCandidate]=useState(''),[checked,setChecked]=useState(false);
  const selected=candidates.find(r=>r.id===candidate);
  const reviewed=doc.reviewStatus==='accepted';
  return <article className={s.proposal}><div className={s.proposalHeading}><div><h2>{fields.counterparty??'Unknown counterparty'}</h2><p>PKR {money(fields.totalMinor)} · {doc.source.sourceId}</p></div><span className={`${s.badge} ${s.pending}`}>{fields.totalMinor===null?'Unknown total':candidates.length>1?'Multiple candidates':'Match proposed'}</span></div><p>{candidates.length>1 ? 'Several records could support this document. Amount alone cannot establish a match; inspect the source and choose deliberately.' : 'Check the date, reference and source details before confirming this relationship.'}</p>
    {!reviewed && <div className={s.notice}><p>Review the document’s required fields before confirming a match.</p><button className={s.textButton} onClick={onDocuments}>Open documents</button></div>}
    <label className={s.field}>Choose a transaction<select value={candidate} onChange={event=>{setCandidate(event.target.value);setChecked(false);}}><option value="">Select after reviewing evidence</option>{candidates.map(r=><option key={r.id} value={r.id}>{r.description} · {r.date} · PKR {money(r.amountMinor)}</option>)}</select></label>
    {selected && <button className={s.textButton} style={{justifySelf:'start'}} onClick={()=>onRecord(selected)}>View selected source row</button>}
    <label className={s.checkbox}><input type="checkbox" checked={checked} onChange={event=>setChecked(event.target.checked)} disabled={!reviewed||!selected}/>I compared the source details and confirm this one-to-one relationship.</label>
    <div className={s.actions}><button className={s.button} disabled={!reviewed||!selected||!checked||fields.currency!=='PKR'||fields.totalMinor===null} onClick={()=>{if(selected)onMatch(selected.id);}}>Confirm match</button><button className={s.secondary} onClick={onReject}>Reject match suggestion</button></div>
  </article>;
}
function LiveMatchCard({proposal,document,records,onReview,onRecord}:{proposal:ReviewableMatchProposal;document:SupportingDocument|undefined;records:Transaction[];onReview:(decision:{kind:'accept'|'reject'}|{kind:'correct';transactionId:string})=>void;onRecord:(record:Transaction)=>void}) {
  const [transactionId,setTransactionId]=useState(proposal.transactionId);
  const [checked,setChecked]=useState(false);
  const fields=document?.correctedFields??document?.extractedFields;
  const candidates=records.filter(record=>record.direction==='out'&&(record.matchStatus!=='accepted'||record.id===proposal.transactionId)&&fields?.currency===record.currency&&fields.totalMinor===record.amountMinor);
  const selected=candidates.find(record=>record.id===transactionId);
  const disabled=proposal.status==='accepted'||proposal.status==='rejected'||!document||document.reviewStatus!=='accepted';
  const bestSupported=proposal.rationale.startsWith('Best-supported candidate;');
  return <article className={s.proposal}><div className={s.proposalHeading}><div><h2>{fields?.counterparty??'Receipt candidate'}</h2><p>{selected?`${selected.date} · PKR ${money(selected.amountMinor)} · ${selected.description}`:'Candidate transaction unavailable'}</p></div><span className={`${s.badge} ${s.pending}`}>{proposal.status==='accepted'?'Match accepted':proposal.status==='rejected'?'Candidate rejected':bestSupported?'Best-supported suggestion':'Compare candidate evidence'}</span></div>
    <p>{proposal.rationale}</p>
    {document&&<p className={`${s.small} ${s.muted}`}>Receipt date {fields?.date??'unknown'} · reference {fields?.reference??'not provided'} · document fields must stay reviewed before accepting.</p>}
    <label className={s.field}>Candidate transaction<select value={transactionId} disabled={disabled} onChange={event=>{setTransactionId(event.target.value);setChecked(false);}}><option value="">Choose a compatible transaction</option>{candidates.map(record=><option value={record.id} key={record.id}>{record.date} · PKR {money(record.amountMinor)} · {record.description}</option>)}</select></label>
    {selected&&<button className={s.textButton} style={{justifySelf:'start'}} onClick={()=>onRecord(selected)}>View original source row</button>}
    {!disabled&&<><label className={s.checkbox}><input type="checkbox" checked={checked} disabled={!selected} onChange={event=>setChecked(event.target.checked)}/>I compared the receipt and original transaction source and confirm this one-to-one relationship.</label><div className={s.actions}><button className={s.button} disabled={!checked||!selected||selected.id!==proposal.transactionId} onClick={()=>onReview({kind:'accept'})}>Accept match</button><button className={s.secondary} disabled={!checked||!selected||selected.id===proposal.transactionId} onClick={()=>selected&&onReview({kind:'correct',transactionId:selected.id})}>Save changed match</button><button className={s.secondary} onClick={()=>onReview({kind:'reject'})}>Reject candidate</button></div></>}
    <ProposalTrail proposalId={proposal.id} workspaceId={proposal.workspaceId}/>
  </article>;
}
export function ReviewScreen({demo,records,documents,proposals,matchProposals,matchScans={},hasMoreCategoryProposals=false,onLoadMoreCategoryProposals,loadingCategoryPage=false,hasMoreMatchProposals=false,onLoadMoreMatchProposals,onMatchPageLoading=false,matchedDocumentIds,rejectedDocumentIds,onCategory,onMatch,onRejectMatch,onReviewMatch,onGenerateMatch,onDocuments,onRecord,onGenerateCategories,generatingCategories=false,generatingMatchDocumentId=null,categoryError='',matchesError='',proposalsError=''}:{
  demo:boolean;records:Transaction[];documents:SupportingDocument[];proposals:ReviewableCategoryProposal[];matchProposals:ReviewableMatchProposal[];matchScans?:Record<string,MatchScanSnapshot>;hasMoreCategoryProposals?:boolean;onLoadMoreCategoryProposals?:(()=>Promise<void>)|undefined;loadingCategoryPage?:boolean;hasMoreMatchProposals?:boolean;onLoadMoreMatchProposals?:(()=>void|Promise<void>)|undefined;onMatchPageLoading?:boolean;matchedDocumentIds:string[];rejectedDocumentIds:string[];
  onCategory:(proposal:ReviewableCategoryProposal,category:Category|null)=>void|Promise<void>;onMatch:(documentId:string,transactionId:string)=>void;onRejectMatch:(id:string)=>void;onDocuments:()=>void;onRecord:(record:Transaction)=>void;
  onReviewMatch:(proposal:ReviewableMatchProposal,decision:{kind:'accept'|'reject'}|{kind:'correct';transactionId:string})=>void|Promise<void>;
  onGenerateMatch:(documentId:string)=>void;onGenerateCategories?: (()=>void)|undefined;generatingCategories?:boolean;generatingMatchDocumentId?:string|null;categoryError?:string;matchesError?:string;proposalsError?:string;
}) {
  const [tab,setTab]=useState<'categories'|'matches'>('categories');
  const pending=proposals.filter(p=>p.status==='proposed'||p.status==='needs_review');
  const matching=documents.filter(d=>!matchedDocumentIds.includes(d.id)&&!rejectedDocumentIds.includes(d.id));
  const livePendingMatches=matchProposals.filter(proposal=>proposal.status==='proposed'||proposal.status==='needs_review');
  const acceptedDocuments=new Set(matchProposals.filter(proposal=>proposal.status==='accepted').map(proposal=>proposal.suggestion.kind==='match'?proposal.suggestion.documentId:''));
  return <><div className={s.pageHeading}><div><h1>Review queue</h1><p>Suggestions are a starting point. Decisions belong to you.</p></div><Icon name="review" size={26}/></div><div className={s.tabs} aria-label="Review views"><button className={tab==='categories'?s.selectedTab:''} aria-pressed={tab==='categories'} onClick={()=>setTab('categories')}>Categories {demo?`(${pending.length})`:''}</button><button className={tab==='matches'?s.selectedTab:''} aria-pressed={tab==='matches'} onClick={()=>setTab('matches')}>Matches {demo?`(${matching.length})`:''}</button></div>
    <section className={s.panel}>
      {tab==='categories' ? <div className={s.stack}>{proposalsError&&<p className={s.error} role="alert">{proposalsError}</p>}{categoryError&&<p className={s.error} role="alert">{categoryError}</p>}{pending.length ? pending.map(p=><SavedCategoryCard key={p.id} proposal={p} record={records.find(r=>r.id===p.transactionId)} onReview={category=>onCategory(p,category)} onRecord={onRecord}/>) : <div className={s.empty}><Icon name="check" size={30}/><h2>{hasMoreCategoryProposals?'No pending suggestions in the loaded pages.':'Loaded category suggestions reviewed.'}</h2><p>{demo?'Example suggestions can be reset from the sidebar.':'Unreviewed transactions can receive new suggestions. Accepted categories remain protected when you rerun preparation.'}</p></div>}{!demo&&hasMoreCategoryProposals&&<p className={s.notice}>More saved category decisions remain. Load the next page before treating this queue as complete.</p>}{!demo&&hasMoreCategoryProposals&&onLoadMoreCategoryProposals&&<button className={s.secondary} disabled={loadingCategoryPage||generatingCategories} onClick={onLoadMoreCategoryProposals}>{loadingCategoryPage?'Loading category decisions?':'Load more category decisions'}</button>}{!demo&&onGenerateCategories&&<div className={s.actions}><button className={s.button} onClick={onGenerateCategories} disabled={loadingCategoryPage||generatingCategories||!records.some(record=>record.categoryStatus!=='accepted')}>{generatingCategories?'Preparing suggestions…':'Prepare category suggestions'}</button></div>}</div> : demo ? matching.length ? matching.map(d=><MatchCard key={d.id} doc={d} records={records} onMatch={id=>onMatch(d.id,id)} onReject={()=>onRejectMatch(d.id)} onDocuments={onDocuments} onRecord={onRecord}/>) : <div className={s.empty}><Icon name="check" size={30}/><h2>Visible match suggestions reviewed.</h2><p>Unmatched records remain visible in the cashbook.</p></div> : <div className={s.stack}>{matchesError&&<p className={s.error} role="alert">{matchesError}</p>}{matchProposals.map(proposal=><LiveMatchCard key={proposal.id} proposal={proposal as ReviewableMatchProposal} document={documents.find(item=>item.id===proposal.suggestion.documentId)} records={records} onReview={decision=>onReviewMatch(proposal as ReviewableMatchProposal,decision)} onRecord={onRecord}/>)}{documents.filter(document=>document.reviewStatus==='accepted'&&!matchedDocumentIds.includes(document.id)&&!acceptedDocuments.has(document.id)).map(document=><article key={document.id} className={s.proposal}><h2>{(document.correctedFields??document.extractedFields).counterparty??'Reviewed receipt'}</h2><p>Compare candidates with compatible exact PKR totals. Dates, reference agreement or conflict, and counterparty wording help rank candidates; amount alone never identifies a match. The generated items are suggestions only; review each source before deciding. If more than fifty candidates exist, run this scan again to receive the next batch.</p>{matchScans[document.id]&&<div className={s.notice} role="status"><strong>{matchScans[document.id]!.complete?'Candidate scan complete':'More candidates remain'}</strong><p>{matchScans[document.id]!.eligibleCount} of {matchScans[document.id]!.transactionCount} transactions were eligible. {matchScans[document.id]!.candidateCount} exact-compatible candidates found; {matchScans[document.id]!.createdCount} new suggestions saved and {matchScans[document.id]!.alreadyPendingCount} already awaiting review.</p>{matchScans[document.id]!.omittedCount>0?<p>{matchScans[document.id]!.omittedCount} candidates were omitted from this batch. Run another scan to continue reviewing the bounded results.</p>:matchScans[document.id]!.candidateCount===0?<p>{matchScans[document.id]!.eligibleCount===0?'No unmatched cash outflows were available for this receipt.': 'No single unmatched cash outflow matched the reviewed currency and amount exactly. Amount differences and split-payment cases remain unresolved; no match was recorded.'}</p>:null}</div>}<button className={s.button} disabled={generatingMatchDocumentId===document.id} onClick={()=>onGenerateMatch(document.id)}>{generatingMatchDocumentId===document.id?'Scanning complete cashbook…':matchProposals.some(proposal=>proposal.suggestion.documentId===document.id&&(proposal.status==='proposed'||proposal.status==='needs_review'))?'Prepare more candidates':'Prepare match candidates'}</button></article>)}{hasMoreMatchProposals&&onLoadMoreMatchProposals&&<button className={s.secondary} disabled={onMatchPageLoading} onClick={onLoadMoreMatchProposals}>{onMatchPageLoading?'Loading saved decisions…':'Load more saved match decisions'}</button>}{!livePendingMatches.length&&!documents.some(document=>document.reviewStatus==='accepted'&&!matchedDocumentIds.includes(document.id)&&!acceptedDocuments.has(document.id))&&<div className={s.empty}><Icon name="review" size={30}/><h2>No reviewed receipts need matching.</h2><p>Review the receipt fields first. A receipt never creates a cash transaction.</p><button className={s.textButton} onClick={onDocuments}>Open documents</button></div>}</div>}
    </section>
    {!demo&&tab==='categories'&&proposals.some(p=>p.status==='accepted'||p.status==='rejected')&&<section className={s.panel} aria-label="Reviewed category decisions"><div className={s.stack}><h2>Reviewed category decisions</h2>{proposals.filter(p=>p.status==='accepted'||p.status==='rejected').map(p=><ReviewedCategoryCard key={p.id} proposal={p as ReviewableCategoryProposal} record={records.find(r=>r.id===p.transactionId)}/>)}</div></section>}
  </>;
}
