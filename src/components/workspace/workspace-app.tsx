'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CashSummary, Category, DocumentFields, ReviewDecision, Transaction, Workspace } from '../../lib/contracts/index.ts';
import { documentReviewSchema, type DocumentRecord } from '../../lib/contracts/documents.ts';
import type { ProposalRecord } from '../../lib/contracts/proposals.ts';
import { CATEGORIES } from '../../lib/contracts/index.ts';
import { exampleDocuments, exampleProposals } from '../../lib/client/examples.ts';
import { categoryLabels, displayDate, downloadExample, downloadText, money } from '../../lib/client/presentation.ts';
import { api } from '../../lib/client/api.ts';
import { usePrivateRequests } from '../../lib/client/use-private-requests.ts';
import { Icon, Mark } from '../ui/icon.tsx';
import type { IconName } from '../ui/icon.tsx';
import { Dialog } from '../ui/dialog.tsx';
import { Cashbook } from './cashbook.tsx';
import { ImportScreen } from './import-screen.tsx';
import { LiveImportScreen } from './live-import-screen.tsx';
import { LiveRecordDetail } from './live-record-detail.tsx';
import { DocumentsScreen } from './documents-screen.tsx';
import type { PrivateLink, UploadedSource } from './documents-screen.tsx';
import { ReviewScreen } from './review-screen.tsx';
import type { ReviewableCategoryProposal } from './review-screen.tsx';
import { AssistantScreen } from './assistant-screen.tsx';
import { InvoicesScreen } from './invoices/invoices-screen.tsx';
import s from '../ui/theme.module.css';
type View = 'cashbook' | 'invoices' | 'import' | 'documents' | 'review' | 'assistant';
const views: {id:View;label:string;icon:IconName}[] = [
  {id:'cashbook',label:'Cashbook',icon:'book'},
  {id:'invoices',label:'Invoices',icon:'file'},
  {id:'documents',label:'Documents',icon:'file'},
  {id:'review',label:'Review queue',icon:'review'},
  {id:'assistant',label:'Ask Raqam',icon:'spark'}
];
const EMPTY_DOCUMENTS: DocumentRecord[] = [];
const EMPTY_PROPOSALS: ProposalRecord[] = [];
function sameSnapshot<T>(current:T[], incoming:T[]):boolean {
  return current===incoming||(current.length===incoming.length&&current.every((item,index)=>item===incoming[index]||JSON.stringify(item)===JSON.stringify(incoming[index])));
}
function upsertDocument(records:DocumentRecord[], value:DocumentRecord):DocumentRecord[] {
  return [...records.filter(item=>item.document.id!==value.document.id),value].sort((a,b)=>a.document.id.localeCompare(b.document.id));
}
function RecordDetail({record,demo,onSave,onClose}: {record:Transaction;demo:boolean;onSave:(description:string,category:Category|null)=>void;onClose:()=>void}) {
  const [description,setDescription]=useState(record.description);
  const [category,setCategory]=useState<Category|null>(record.category);
  return <Dialog title="Transaction details" onClose={onClose}><div className={s.stack}><dl className={s.details}><dt>Source</dt><dd>{record.source.sourceId} / row {record.source.rowNumber}</dd><dt>Original text</dt><dd>{record.originalDescription}</dd><dt>Date</dt><dd>{displayDate(record.date)}</dd><dt>Amount</dt><dd>{record.direction==='in'?'Cash in':'Cash out'} · PKR {money(record.amountMinor)}</dd><dt>Reference</dt><dd>{record.reference??'Not present'}</dd><dt>Category</dt><dd>{record.categoryStatus==='accepted'&&record.category?categoryLabels[record.category]:'Unreviewed'} / {record.categoryStatus}</dd><dt>Evidence</dt><dd>{record.matchStatus==='accepted'?'Accepted document match':record.matchStatus==='proposed'?'Match proposed':'No accepted match'}</dd></dl>
    <form className={s.stack} onSubmit={event=>{event.preventDefault();if(description.trim())onSave(description.trim(),category);}}><label className={s.field}>Reviewed description<textarea rows={3} maxLength={2000} value={description} onChange={event=>setDescription(event.target.value)} disabled={!demo} required/></label><label className={s.field}>Reviewed category<select value={category??''} disabled={!demo} onChange={event=>setCategory(event.target.value?(event.target.value as Category):null)}><option value="">Leave unreviewed</option>{CATEGORIES.map(c=><option key={c} value={c}>{categoryLabels[c]}</option>)}</select></label>{demo?<><p className={`${s.small} ${s.muted}`}>Saving a selected category confirms your review. Example edits preserve the original source text and create a session review entry.</p><button className={s.button} type="submit" disabled={!description.trim()}>Save reviewed changes</button></>:<p className={`${s.small} ${s.muted}`}>Audited corrections are awaiting the transaction update API.</p>}</form>
  </div></Dialog>;
}
export function WorkspaceApp({demo,workspace,records:liveRecords,hasMore=false,loadMore,onUpload,getLink,account,onReload,summary=null,summaryError='',documents:initialDocuments=EMPTY_DOCUMENTS,documentsError='',proposals:initialProposals=EMPTY_PROPOSALS,proposalsError='',onChanged=async()=>{throw new Error('Reload the workspace to refresh saved records.');}}: {
  demo:boolean;workspace:Workspace;records:Transaction[];hasMore?:boolean;loadMore?: (()=>Promise<void>) | undefined;
  onUpload?: ((file:File)=>Promise<UploadedSource>) | undefined;getLink?: ((id:string)=>Promise<PrivateLink>) | undefined;
  account?:ReactNode;onReload?: (()=>void) | undefined;
  documents?:DocumentRecord[];documentsError?:string;proposals?:ProposalRecord[];proposalsError?:string;
  summary?:CashSummary|null;summaryError?:string;onChanged?:(()=>Promise<void>)|undefined;
}) {
  const run=usePrivateRequests(),exportLock=useRef(false);
  const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
  const [view,setView]=useState<View>('cashbook'),[demoRecords,setDemoRecords]=useState(liveRecords),[demoDocuments,setDemoDocuments]=useState(demo?exampleDocuments():[]),[demoProposals,setDemoProposals]=useState(demo?exampleProposals():[]),[liveDocuments,setLiveDocuments]=useState(initialDocuments),[liveProposalRecords,setLiveProposalRecords]=useState(initialProposals);
  const [matches,setMatches]=useState<{documentId:string;transactionId:string}[]>([]),[rejectedMatches,setRejectedMatches]=useState<string[]>([]),[sources,setSources]=useState<UploadedSource[]>([]);
  const [record,setRecord]=useState<Transaction|null>(null),[exportOpen,setExportOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[history,setHistory]=useState<ReviewDecision[]>([]),[notice,setNotice]=useState(''),[failure,setFailure]=useState(''),[imported,setImported]=useState(false),[unresolved,setUnresolved]=useState(0),[reset,setReset]=useState(0),[extractingDocumentId,setExtractingDocumentId]=useState<string|null>(null),[generatingCategories,setGeneratingCategories]=useState(false),[categoryError,setCategoryError]=useState('');
  const records=demo?demoRecords:liveRecords;
  const documents=demo?demoDocuments:liveDocuments.map(item=>item.document);
  const proposals:ReviewableCategoryProposal[]=demo?demoProposals:liveProposalRecords.filter(item=>item.suggestion.kind==='category').map(item=>({
    id:item.id,workspaceId:item.workspaceId,kind:'category',transactionId:item.transactionId,
    category:item.suggestion.kind==='category'?item.suggestion.category:'uncategorized',rationale:item.rationale,status:item.status,
    reviewVersion:item.reviewVersion,transactionVersion:item.transactionVersion,
  }));
  // Refreshed parents can supply new array identities for unchanged snapshots.
  // Preserve local state in that case so the prop-sync effects cannot render-loop.
  useEffect(()=>{if(!demo)setLiveDocuments(current=>sameSnapshot(current,initialDocuments)?current:initialDocuments);},[demo,initialDocuments]);
  useEffect(()=>{if(!demo)setLiveProposalRecords(current=>sameSnapshot(current,initialProposals)?current:initialProposals);},[demo,initialProposals]);
  const reviewCount=proposals.filter(p=>p.status==='proposed'||p.status==='needs_review').length+documents.filter(d=>!matches.some(m=>m.documentId===d.id)&&!rejectedMatches.includes(d.id)).length;
  function navigate(next:View) {setView(next);setFailure(''); document.querySelector<HTMLDetailsElement>('[data-mobile-nav]')?.removeAttribute('open');}
  function decision(targetId:string,action:'accept'|'correct'|'reject',previous:unknown,current:unknown) {
    setHistory(entries=>[...entries,{id:crypto.randomUUID(),workspaceId:workspace.id,actorSubject:'example-owner',targetId,action,previous,current,createdAt:new Date().toISOString()}]);
  }
  async function reviewCategory(proposal:ReviewableCategoryProposal,category:Category|null) {
    const prior=records.find(r=>r.id===proposal.transactionId);
    if(demo) {
      if(!prior)return;
      setDemoRecords(current=>current.map(r=>r.id===proposal.transactionId?{...r,category,categoryStatus:category?'accepted':'rejected'}:r));
      setDemoProposals(current=>current.map(p=>p.transactionId===proposal.transactionId?{...p,status:category?'accepted':'rejected'}:p));
      decision(proposal.transactionId,category?'accept':'reject',prior.category,category);setNotice(category?'Example category reviewed. Cash movement totals are unchanged.':'Example suggestion rejected. The record remains uncategorized.');
      return;
    }
    if(proposal.reviewVersion===undefined){setCategoryError('This proposal has no saved review version. Reload the workspace.');return;}
    setCategoryError('');
    try {
      const decision=category===null?{decision:'reject' as const}:category===proposal.category?{decision:'accept' as const}:{decision:'correct_category' as const,category};
      const result=await run(signal=>api.reviewProposal({requestId:crypto.randomUUID(),proposalId:proposal.id,expectedVersion:proposal.reviewVersion!,...decision},signal));
      if(prior)setLiveProposalRecords(current=>current.map(item=>item.id===proposal.id?result.proposal:item));
      await onChanged();
      const refreshed=await run(signal=>api.categoryProposals(signal));setLiveProposalRecords(refreshed.items);
      setNotice(category===null?'Category suggestion rejected. The transaction remains visible for later review.':category===proposal.category?'Category accepted. Cash movement totals are unchanged.':'Category corrected and saved. Cash movement totals are unchanged.');
    } catch(error) {setCategoryError(error instanceof Error?error.message:'Category review could not be saved. Reload and retry.');}
  }
  async function saveDocument(id:string,fields:DocumentFields,accepted:boolean,requestId:string) {
    const prior=documents.find(d=>d.id===id);if(!prior)return;
    if(!demo) {
      const current=liveDocuments.find(item=>item.document.id===id);
      if(!current)throw new Error('Document state is unavailable. Reload the documents list.');
      const base={requestId,expectedVersion:current.reviewVersion};
      const command=accepted?documentReviewSchema.parse({...base,action:'accept',fields}):documentReviewSchema.parse({...base,action:'correct',fields});
      const result=await run(signal=>api.reviewDocument(id,command,signal));
      setLiveDocuments(items=>upsertDocument(items,result.currentRecord));
      setNotice(accepted?'Receipt fields reviewed. No cash transaction was added.':'Receipt corrections saved; the document remains unresolved.');
      await onChanged();
      return;
    }
    const allocation=matches.find(m=>m.documentId===id);
    const changed=JSON.stringify(prior.correctedFields??prior.extractedFields)!==JSON.stringify(fields);
    if(allocation&&(changed||!accepted)) {
      setMatches(current=>current.filter(m=>m.documentId!==id));
      setDemoRecords(current=>current.map(r=>r.id===allocation.transactionId?{...r,matchStatus:'unmatched'}:r));
      decision(id,'reject',{transactionId:allocation.transactionId},null);
    }
    setDemoDocuments(current=>current.map(d=>d.id===id?{...d,correctedFields:fields,reviewStatus:accepted?'accepted':'needs_review'}:d));
    decision(id,'correct',prior.correctedFields??prior.extractedFields,fields);setNotice(allocation&&(changed||!accepted)?'Example document changed. Its earlier match was released and needs fresh review.':accepted?'Example document fields reviewed. No cash transaction was added.':'Example document kept unresolved.');
  }
  function match(documentId:string,transactionId:string) {
    const doc=documents.find(d=>d.id===documentId),r=records.find(r=>r.id===transactionId);const fields=doc?.correctedFields??doc?.extractedFields;
    if(!demo||!doc||doc.reviewStatus!=='accepted'||!r||r.direction!=='out'||fields?.currency!=='PKR'||fields.totalMinor!==r.amountMinor||matches.some(m=>m.documentId===documentId||m.transactionId===transactionId)) {setFailure('This match cannot be confirmed. Review the fields, amount, currency and existing allocation.');return;}
    setMatches(current=>[...current,{documentId,transactionId}]);setDemoRecords(current=>current.map(item=>item.id===transactionId?{...item,matchStatus:'accepted'}:item));decision(documentId,'accept',null,{transactionId});setNotice('Example match confirmed. The document is allocated once; cash totals are unchanged.');
  }
  const nav=<nav className={s.nav} aria-label="Workspace navigation">{views.map(item=><button key={item.id} className={view===item.id?s.active:''} aria-current={view===item.id?'page':undefined} onClick={()=>navigate(item.id)}><Icon name={item.icon} size={19}/>{item.label}{item.id==='review'&&demo&&reviewCount>0&&<span className={s.navCount}>{reviewCount}</span>}</button>)}</nav>;
  async function upload(file:File) {
    if(!onUpload)throw new Error('Source upload is unavailable.');
    const saved={...await onUpload(file),name:file.name};
    setSources(current=>current.some(item=>item.sourceId===saved.sourceId)?current.map(item=>item.sourceId===saved.sourceId?saved:item):[...current,saved]);
    const registration=await run(signal=>api.registerDocument(saved.sourceId,signal));
    setLiveDocuments(current=>upsertDocument(current,registration.record));
    const extracted=await run(signal=>api.extractDocument(registration.record.document.id,{requestId:crypto.randomUUID(),expectedVersion:registration.record.reviewVersion},signal));
    setLiveDocuments(current=>upsertDocument(current,extracted.currentRecord));
    setNotice(extracted.state==='failed'?'Receipt stored, but extraction needs attention. The source and cashbook are safe.':'Receipt stored and read. Check the proposed fields against its original image.');
    return saved;
  }
  async function extractDocument(id:string) {
    const current=liveDocuments.find(item=>item.document.id===id);
    if(!current){setFailure('Document state is unavailable. Reload the documents list.');return;}
    setExtractingDocumentId(id);setFailure('');
    try {
      const result=await run(signal=>api.extractDocument(id,{requestId:crypto.randomUUID(),expectedVersion:current.reviewVersion},signal));
      setLiveDocuments(items=>upsertDocument(items,result.currentRecord));
      setNotice(result.state==='failed'?'Extraction could not complete. Review the safe status and retry when ready.':'Extraction finished. Verify every proposed field against the private image.');
    } catch(error) {setFailure(error instanceof Error?error.message:'Receipt extraction could not complete. The source and cashbook are unchanged.');}
    finally {setExtractingDocumentId(null);}
  }
  async function generateCategories() {
    if(generatingCategories)return;
    const unreviewed=records.filter(item=>item.categoryStatus!=='accepted');
    if(!unreviewed.length){setCategoryError('There are no unreviewed transactions to prepare.');return;}
    const transactionIds=unreviewed.slice(0, 10).map(item=>item.id);
    setGeneratingCategories(true);setCategoryError('');
    try {
      await run(signal=>api.generateCategoryProposals({requestId:crypto.randomUUID(),transactionIds},signal));
      const refreshed=await run(signal=>api.categoryProposals(signal));
      setLiveProposalRecords(refreshed.items);
      const remaining=unreviewed.length - transactionIds.length;
      setNotice(remaining > 0
        ? `Prepared ${transactionIds.length} category suggestions. ${remaining} more unreviewed transactions remaining.`
        : refreshed.items.some(item=>item.status==='proposed'||item.status==='needs_review')
          ? 'Category suggestions are ready for your review.'
          : 'No new category suggestions were needed. Existing accepted categories remain unchanged.');
    } catch(error) {setCategoryError(error instanceof Error?error.message:'Category preparation failed. Existing books are unchanged.');}
    finally {setGeneratingCategories(false);}
  }
  function resetExample() {
    setDemoRecords(liveRecords);setDemoDocuments(exampleDocuments());setDemoProposals(exampleProposals());setMatches([]);setRejectedMatches([]);setHistory([]);setImported(false);setUnresolved(0);setNotice('Example workspace reset.');setReset(value=>value+1);setView('cashbook');
  }
  return <div className={`${s.root} ${s.app}`} data-raqam-ui>
    <a href="#workspace-main" className={s.skip}>Skip to cashbook content</a>
    <aside className={s.sidebar}><Link href="/" className={s.brand} aria-label="Raqam home"><Mark/>raqam</Link><div className={s.business}><span className={s.businessIcon}>{workspace.businessName.slice(0,1).toUpperCase()}</span><div><strong>{workspace.businessName}</strong><p className={s.muted}>Business workspace · PKR</p></div></div>{nav}<div className={s.sidebarBottom}><p>Clear books start with<br/>a little context.</p>{demo?<Link href="/workspace" className={s.secondary}>Open your workspace</Link>:<button className={s.secondary} onClick={onReload}>Reload workspace</button>}<Link href="/" className={`${s.small} ${s.muted}`}>Back to Raqam</Link></div></aside>
    <details className={s.mobileMenu} data-mobile-nav><summary><span className={s.brand}><Mark/>raqam</span><span className={s.actions}><span className={s.small}>Menu</span><Icon name="menu"/></span></summary>{nav}<Link href="/" className={s.textButton}>Back to Raqam</Link></details>
    <main className={s.main} id="workspace-main"><header className={s.topbar}><span>{workspace.businessName} / {view==='cashbook'?'Cashbook':view==='invoices'?'Invoices':views.find(v=>v.id===view)?.label??'Import'}</span><span className={s.identity}><span>{demo?'Example owner':'Your account'}</span>{account??<span className={s.avatar}>SS</span>}</span></header>
      {demo && <div className={s.notice}><p><strong>Example workspace.</strong> Synthetic records, simulated suggestions and session-only changes. No live AI or saved books.</p><button className={s.textButton} onClick={resetExample}><Icon name="reset" size={14}/> Reset example</button></div>}
      {notice && <p role="status" className={s.success} style={{marginBottom:24}}>{notice}</p>}{failure&&<p className={s.error} role="alert">{failure}</p>}
      {view !== 'invoices' && <div className={s.actions} style={{justifyContent:'flex-end',marginBottom:16}}>{demo && <button className={s.textButton} onClick={()=>setHistoryOpen(true)}>Review trail ({history.length})</button>}<button className={s.secondary} onClick={()=>setExportOpen(true)}><Icon name="download" size={16}/> Export cashbook</button></div>}
      <div key={reset}>
        {view==='cashbook'&&<Cashbook records={records} workspaceId={workspace.id} unresolved={unresolved} onRecord={setRecord} onImport={()=>navigate('import')} onReview={()=>navigate('review')} hasMore={hasMore} loadMore={loadMore} live={!demo} liveSummary={summary} summaryError={summaryError} onRefreshSummary={onChanged}/>}
        {view==='invoices'&&<InvoicesScreen demo={demo} businessName={workspace.businessName} currency={workspace.currency}/>}
        {view==='import'&&!demo&&<LiveImportScreen onChanged={onChanged}/>}
        {view==='import'&&demo&&<ImportScreen demo={demo} workspaceId={workspace.id} imported={imported} onConfirm={(next,remaining)=>{if(!demo||imported)return;setDemoRecords(current=>[...current,...next]);setUnresolved(remaining);setImported(true);decision('example-import-csv','accept',null,{validRows:next.length,unresolvedRows:remaining});setNotice(`${next.length} example rows imported; ${remaining} unresolved rows excluded from totals.`);}}/>}
        {view==='documents'&&<DocumentsScreen demo={demo} documents={documents} liveRecords={liveDocuments} documentError={documentsError} extractingDocumentId={extractingDocumentId} onExtractDocument={demo?undefined:extractDocument} onSave={saveDocument} sources={sources} onUpload={onUpload?upload:undefined} getLink={getLink}/>}
        {view==='review'&&<ReviewScreen demo={demo} records={records} documents={documents} proposals={proposals} matchedDocumentIds={matches.map(m=>m.documentId)} rejectedDocumentIds={rejectedMatches} onCategory={reviewCategory} onGenerateCategories={demo?undefined:generateCategories} generatingCategories={generatingCategories} categoryError={categoryError} proposalsError={proposalsError} onMatch={match} onRejectMatch={id=>{setRejectedMatches(current=>[...current,id]);const affected=matches.find(m=>m.documentId===id);if(affected)setDemoRecords(current=>current.map(r=>r.id===affected.transactionId?{...r,matchStatus:'unmatched'}:r));else if(id==='example-doc-1')setDemoRecords(current=>current.map(r=>r.id==='example-2'?{...r,matchStatus:'unmatched'}:r));decision(id,'reject',null,null);setNotice('Example match suggestion rejected. Unmatched records remain visible.');}} onDocuments={()=>navigate('documents')} onRecord={setRecord}/>}
        {view==='assistant'&&<AssistantScreen key={workspace.id} demo={demo} records={records} workspaceId={workspace.id} onRecord={setRecord}/>}
      </div>
      {record&&!demo&&<LiveRecordDetail key={record.id} record={record} onClose={()=>setRecord(null)} onChanged={onChanged}/>}
      {record&&demo&&<RecordDetail key={record.id} record={record} demo={demo} onClose={()=>setRecord(null)} onSave={(description,category)=>{if(!demo)return;setDemoRecords(current=>current.map(r=>r.id===record.id?{...r,description,category,categoryStatus:category?'accepted':category!==record.category?'needs_review':record.categoryStatus}:r));if(category!==record.category)setDemoProposals(current=>current.map(p=>p.transactionId===record.id?{...p,status:category?'accepted':'needs_review'}:p));decision(record.id,'correct',{description:record.description,category:record.category},{description,category});setRecord(null);setNotice('Example record reviewed. Original source text is preserved.');}}/>}
      {exportOpen&&<Dialog title="Export your cashbook" onClose={()=>{setExportOpen(false);setExportError('');}}><div className={s.stack}><p>{demo?`${records.length} synthetic records with exact PKR amounts, accepted categories, review and match statuses, and source references.`:'Download every imported cash record in your private workspace, with reviewed categories and source references. Table filters do not limit this export.'}</p><p className={`${s.small} ${s.muted}`}>Unresolved import rows are excluded from cash records and counted after download. Pending category and match statuses stay visible. Spreadsheet formula text is safely encoded.</p>{exportError&&<p className={s.error} role="alert">{exportError}</p>}{demo?<button className={s.button} onClick={()=>{downloadExample(records,workspace.id);setNotice('Example cashbook downloaded. It contains synthetic records only.');setExportOpen(false);}}>Download example CSV</button>:<button className={s.button} disabled={exporting} onClick={async()=>{if(exportLock.current)return;exportLock.current=true;setExporting(true);setExportError('');try{const result=await run(signal=>api.export(signal));downloadText('raqam-cashbook.csv',result.csv);setNotice(`Cashbook downloaded. ${result.unresolved} unresolved import rows excluded from cash records.`);setExportOpen(false);}catch(error){setExportError(error instanceof Error?error.message:'Export could not complete. Retry.');}finally{exportLock.current=false;setExporting(false);}}}>{exporting?'Preparing export…':'Download cashbook CSV'}</button>}</div></Dialog>}
      {historyOpen&&<Dialog title="Example review trail" onClose={()=>setHistoryOpen(false)}><div className={s.stack}><p className={`${s.small} ${s.muted}`}>Session-only development history. Reloading resets it.</p>{history.length?history.map(entry=><article key={entry.id} className={s.stack} style={{gap:8}}><strong>{entry.action} / {entry.targetId}</strong><time className={`${s.small} ${s.muted}`} dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleTimeString()}</time><details><summary>Previous and reviewed values</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12}}>{JSON.stringify({previous:entry.previous,current:entry.current},null,2)}</pre></details></article>):<p>No example decisions yet. Review a category or document to add one.</p>}</div></Dialog>}
    </main>
  </div>;
}
