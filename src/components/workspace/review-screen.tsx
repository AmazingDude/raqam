'use client';
import { useState } from 'react';
import type { Category, CategoryProposal, SupportingDocument, Transaction } from '../../lib/contracts/index.ts';
import { CATEGORIES } from '../../lib/contracts/index.ts';
import { categoryLabels, money } from '../../lib/client/presentation.ts';
import { Icon } from '../ui/icon.tsx';
import s from '../ui/theme.module.css';
export type ReviewableCategoryProposal = CategoryProposal & { reviewVersion?: number; transactionVersion?: number };
function CategoryCard({proposal,record,onReview,onRecord}:{proposal:CategoryProposal;record:Transaction;onReview:(category:Category|null)=>void;onRecord:()=>void}) {
  const [category,setCategory]=useState<Category>(proposal.category);
  return <article className={s.proposal}><div className={s.proposalHeading}><div><h2>{record.description}</h2><p>PKR {money(record.amountMinor)} · CSV row {record.source.rowNumber}</p></div><span className={`${s.badge} ${s.pending}`}>Category proposed</span></div><p>{proposal.rationale}</p><div className={s.reviewChoice}><label className={s.field}>Review category<select value={category} onChange={event=>setCategory(event.target.value as Category)}>{CATEGORIES.map(c=><option value={c} key={c}>{categoryLabels[c]}</option>)}</select></label><button className={s.button} onClick={()=>onReview(category)}>{category===proposal.category?'Accept category':'Save changed category'}</button><button className={s.secondary} onClick={()=>onReview(null)}>Reject suggestion</button></div><button className={s.textButton} style={{justifySelf:'start'}} onClick={onRecord}>View original source row</button></article>;
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
export function ReviewScreen({demo,records,documents,proposals,matchedDocumentIds,rejectedDocumentIds,onCategory,onMatch,onRejectMatch,onDocuments,onRecord,onGenerateCategories,generatingCategories=false,categoryError='',proposalsError=''}:{
  demo:boolean;records:Transaction[];documents:SupportingDocument[];proposals:ReviewableCategoryProposal[];matchedDocumentIds:string[];rejectedDocumentIds:string[];
  onCategory:(proposal:ReviewableCategoryProposal,category:Category|null)=>void|Promise<void>;onMatch:(documentId:string,transactionId:string)=>void;onRejectMatch:(id:string)=>void;onDocuments:()=>void;onRecord:(record:Transaction)=>void;
  onGenerateCategories?: (()=>void)|undefined;generatingCategories?:boolean;categoryError?:string;proposalsError?:string;
}) {
  const [tab,setTab]=useState<'categories'|'matches'>('categories');
  const pending=proposals.filter(p=>p.status==='proposed'||p.status==='needs_review');
  const matching=documents.filter(d=>!matchedDocumentIds.includes(d.id)&&!rejectedDocumentIds.includes(d.id));
  return <><div className={s.pageHeading}><div><h1>Review queue</h1><p>Suggestions are a starting point. Decisions belong to you.</p></div><Icon name="review" size={26}/></div><div className={s.tabs} aria-label="Review views"><button className={tab==='categories'?s.selectedTab:''} aria-pressed={tab==='categories'} onClick={()=>setTab('categories')}>Categories {demo?`(${pending.length})`:''}</button><button className={tab==='matches'?s.selectedTab:''} aria-pressed={tab==='matches'} onClick={()=>setTab('matches')}>Matches {demo?`(${matching.length})`:''}</button></div>
    <section className={s.panel}>
      {tab==='categories' ? <div className={s.stack}>{proposalsError&&<p className={s.error} role="alert">{proposalsError}</p>}{categoryError&&<p className={s.error} role="alert">{categoryError}</p>}{pending.length ? pending.map(p=>{const record=records.find(r=>r.id===p.transactionId);return record?<CategoryCard key={p.id} proposal={p} record={record} onReview={category=>onCategory(p,category)} onRecord={()=>onRecord(record)}/>:null;}) : <div className={s.empty}><Icon name="check" size={30}/><h2>No category proposals need review.</h2><p>{demo?'Example suggestions can be reset from the sidebar.':'Unreviewed transactions can receive new suggestions. Accepted categories remain protected when you rerun preparation.'}</p></div>}{!demo&&onGenerateCategories&&<div className={s.actions}><button className={s.button} onClick={onGenerateCategories} disabled={generatingCategories||!records.some(record=>record.categoryStatus!=='accepted')}>{generatingCategories?'Preparing suggestions…':'Prepare category suggestions'}</button></div>}</div> : demo ? matching.length ? matching.map(d=><MatchCard key={d.id} doc={d} records={records} onMatch={id=>onMatch(d.id,id)} onReject={()=>onRejectMatch(d.id)} onDocuments={onDocuments} onRecord={onRecord}/>) : <div className={s.empty}><Icon name="check" size={30}/><h2>Visible match suggestions reviewed.</h2><p>Unmatched records remain visible in the cashbook.</p></div> : <div className={s.empty}><Icon name="review" size={30}/><h2>Match proposals are not ready yet.</h2><p>Receipt field review is connected. Matching remains a separate review step.</p></div>}
    </section>
  </>;
}
