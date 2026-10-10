'use client';
import { useEffect, useState } from 'react';
import type { DocumentFields, SupportingDocument } from '../../lib/contracts/index.ts';
import type { DocumentRecord } from '../../lib/contracts/documents.ts';
import { documentFieldsSchema } from '../../lib/contracts/schemas.ts';
import { parseAmount, formatAmount } from '../../lib/server/money.ts';
import { displayDate, money } from '../../lib/client/presentation.ts';
import { exampleReceiptPrint } from '../../lib/client/examples.ts';
import { Icon } from '../ui/icon.tsx';
import { ReceiptEvidence } from './receipt-evidence.tsx';
import { DocumentHistory } from './document-history.tsx';
import s from '../ui/theme.module.css';
export type UploadedSource = { sourceId: string; name: string; duplicate: boolean };
export type PrivateLink = { signedUrl: string; expiresInSeconds: number };
function ExampleReceipt({ doc }: { doc: SupportingDocument }) {
  const fields = exampleReceiptPrint[doc.id as keyof typeof exampleReceiptPrint] ?? doc.extractedFields;
  return <div className={s.receipt}><span className={`${s.badge} ${s.pending}`}>Synthetic receipt</span><h3>{fields.counterparty ?? 'Unknown counterparty'}</h3><p className={`${s.small} ${s.muted}`}>{fields.date ? displayDate(fields.date) : 'Unknown date'}</p><div className={s.receiptLine}><span>Service / purchase</span><span>1 item</span></div><div className={s.receiptLine}><strong>Total · {fields.currency ?? 'Unknown currency'}</strong><strong>{money(fields.totalMinor)}</strong></div><div className={s.receiptLine}><span>Reference</span><span>{fields.reference ?? 'Not present'}</span></div><p className={`${s.small} ${s.muted}`} style={{marginTop:24}}>Code-rendered development example. Not an original financial document.</p></div>;
}
function DocumentReview({ doc, liveRecord, demo, getLink, onSave, onClose }: { doc: SupportingDocument; liveRecord?:DocumentRecord|undefined; demo:boolean; getLink?:((id:string)=>Promise<PrivateLink>)|undefined; onSave: (fields: DocumentFields, accepted: boolean, requestId:string) => void|Promise<void>; onClose: () => void }) {
  const initial = doc.correctedFields ?? doc.extractedFields;
  const [counterparty,setCounterparty]=useState(initial.counterparty ?? ''), [date,setDate]=useState(initial.date ?? ''), [total,setTotal]=useState(initial.totalMinor === null ? '' : formatAmount(initial.totalMinor)), [currency,setCurrency]=useState(initial.currency ?? ''), [reference,setReference]=useState(initial.reference ?? ''), [error,setError]=useState(''),[saving,setSaving]=useState(false),[requestId]=useState(()=>crypto.randomUUID());
  async function save(accepted: boolean) {
    if(saving)return;
    const fields: DocumentFields = {counterparty:counterparty.trim() || null,date:date || null,totalMinor:parseAmount(total),currency:currency.trim() || null,reference:reference.trim() || null};
    if (!documentFieldsSchema.safeParse(fields).success || (total.trim() && fields.totalMinor === null)) {setError('Check the date and amount. Use YYYY-MM-DD and an exact nonnegative decimal amount.');return;}
    if (accepted && (!fields.date || fields.totalMinor === null || fields.currency !== 'PKR')) {setError('Review requires a valid date, a known total and explicitly confirmed PKR currency. Merchant and reference may remain unknown.');return;}
    setSaving(true);setError('');
    try{await onSave(fields,accepted,requestId);}catch(error){setError(error instanceof Error?error.message:'The review could not be saved. Your cashbook is unchanged.');}finally{setSaving(false);}
  }
  return <div className={s.stack}><div className={s.actions}><button className={s.textButton} onClick={onClose}>Back to documents</button><span className={s.badge}>{demo?'Example field review':liveRecord?`Saved review version ${liveRecord.reviewVersion}`:'Field review'}</span></div><div className={s.reviewGrid}>
    <aside className={s.sourcePane}><strong>Original source</strong>{demo?<ExampleReceipt doc={doc}/>:getLink?<SourceViewer source={{sourceId:doc.source.sourceId,name:doc.source.sourceId,duplicate:false}} getLink={getLink}/>:<p>Private source preview is unavailable.</p>}<p className={`${s.small} ${s.muted}`}>Source: {doc.source.sourceId}. Original extracted fields stay visible here after correction.</p>{!demo&&liveRecord&&<><ReceiptEvidence record={liveRecord}/><DocumentHistory key={`${liveRecord.document.id}:${liveRecord.reviewVersion}`} record={liveRecord}/></>}</aside>
    <form className={s.formPane} onSubmit={event=>{event.preventDefault();void save(true);}}><h2>Review the proposed fields</h2><p className={`${s.small} ${s.muted}`}>Confirm details against the source. Reviewing a receipt does not add cash to your books.</p>{!demo&&liveRecord?.extractionFailure&&<p className={s.error}>The last extraction needs attention: {liveRecord.extractionFailure.replaceAll('_',' ')}. You can correct fields manually.</p>}
      <label className={s.field}>Counterparty<input value={counterparty} onChange={event=>setCounterparty(event.target.value)} maxLength={2000}/><small>Original: {doc.extractedFields.counterparty ?? 'Unknown'}</small></label>
      <label className={s.field}>Document date<input type="date" value={date} onChange={event=>setDate(event.target.value)}/><small>Original: {doc.extractedFields.date ?? 'Unknown'}</small></label>
      <label className={s.field}>Total amount<input inputMode="decimal" value={total} onChange={event=>setTotal(event.target.value)} placeholder="Unknown"/><small>Original: {money(doc.extractedFields.totalMinor)}</small></label>
      <label className={s.field}>Currency<input value={currency} onChange={event=>setCurrency(event.target.value)} placeholder="Unknown" maxLength={10}/><small>Confirm from evidence; do not assume the workspace currency.</small></label>
      <label className={s.field}>Reference <span className={s.muted}>(optional)</span><input value={reference} onChange={event=>setReference(event.target.value)} maxLength={500}/></label>
      {error && <p className={s.error} role="alert">{error}</p>}<div className={s.actions}><button className={s.button} type="submit" disabled={saving}>{saving?'Saving…':'Save reviewed fields'}</button><button className={s.secondary} type="button" disabled={saving} onClick={()=>save(false)}>Keep unresolved</button></div>{demo&&<p className={`${s.small} ${s.muted}`}>Example changes are held in memory only.</p>}
    </form>
  </div></div>;
}
function SourceViewer({ source, getLink }: { source: UploadedSource; getLink: (id:string)=>Promise<PrivateLink> }) {
  const [link,setLink]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
  useEffect(()=> {
    let active=true; let timer: ReturnType<typeof setTimeout> | undefined;
    setLink(null);setError('');setBusy(true);
    void getLink(source.sourceId).then(result=> {
      if(!active)return;
      const protocol = new URL(result.signedUrl).protocol;
      if(protocol !== 'https:' && protocol !== 'http:')throw new Error('Unsupported source link');
      setLink(result.signedUrl);
      timer=setTimeout(()=>{setLink(null);setError('This private source link expired. Refresh it to view the image again.');},result.expiresInSeconds*1000);
    }).catch(()=> {if(active)setError('The source could not be opened. Refresh its link to retry.');}).finally(()=>{if(active)setBusy(false);});
    return ()=>{active=false;if(timer)clearTimeout(timer);};
  },[source.sourceId,getLink,refresh]);
  return <div className={s.sourcePane}><strong>{source.name}</strong>{busy && <p role="status">Opening private source…</p>}{link && <img src={link} alt={`Private supporting source: ${source.name}`} onError={()=>{setLink(null);setError('The image could not be displayed. Refresh its link to retry.');}}/>}{error && <p role="alert" className={s.error}>{error}</p>}<button className={s.secondary} onClick={()=>setRefresh(value=>value+1)} disabled={busy}>Refresh private link</button><p className={`${s.small} ${s.muted}`}>Private source preview. Extracted fields remain suggestions until reviewed.</p></div>;
}
export function DocumentsScreen({ demo, documents, liveRecords=[], documentError='', onSave, sources, onUpload, getLink, onExtractDocument, extractingDocumentId=null }: {
  demo: boolean; documents: SupportingDocument[]; liveRecords?:DocumentRecord[]; documentError?:string; onSave: (id:string,fields:DocumentFields,accepted:boolean,requestId:string)=>void|Promise<void>;
  sources: UploadedSource[]; onUpload?: ((file:File)=>Promise<UploadedSource>) | undefined; getLink?: ((id:string)=>Promise<PrivateLink>) | undefined;
  onExtractDocument?: ((id:string)=>Promise<void>)|undefined; extractingDocumentId?:string|null;
}) {
  const [selected,setSelected]=useState<string|null>(null),[source,setSource]=useState<UploadedSource|null>(null),[file,setFile]=useState<File|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const doc=documents.find(d=>d.id===selected);
  async function upload() {
    if(!file || !onUpload || busy)return;
    if(!['image/jpeg','image/png'].includes(file.type)||file.size>2*1024*1024){setError('Choose one JPEG or PNG image no larger than 2 MiB.');return;}
    setBusy(true);setError('');
    try {const saved=await onUpload(file);setSource(saved);setFile(null);} catch(error) {setError(error instanceof Error ? error.message : 'The upload failed. Your cashbook is unchanged. Retry the selected file.');} finally {setBusy(false);}
  }
  const selectedRecord=doc?liveRecords.find(item=>item.document.id===doc.id):undefined;
  return <><div className={s.pageHeading}><div><h1>Documents</h1><p>Keep the evidence close. Review each detail.</p></div><span className={s.badge}>{demo ? `${documents.length} example receipts` : `${documents.length} registered receipts`}</span></div>
    {doc ? <DocumentReview key={doc.id} doc={doc} liveRecord={selectedRecord} demo={demo} getLink={getLink} onClose={()=>setSelected(null)} onSave={async(fields,accepted,requestId)=>{await onSave(doc.id,fields,accepted,requestId);setSelected(null);}}/> : <div className={s.stack}>
      {!demo && <div className={s.upload}><Icon name="upload" size={28}/><h2>Upload a supporting image</h2><p>One private JPEG or PNG · maximum 2 MiB. Uploading registers the evidence and starts bounded AI extraction when configured. A receipt never creates a cash transaction.</p><label className={s.field}>Receipt image<input className={s.fileInput} type="file" accept="image/png,image/jpeg" onChange={event=>{setFile(event.target.files?.[0] ?? null);setError('');}} disabled={busy}/></label><button className={s.button} disabled={!file||busy} onClick={upload}>{busy ? 'Uploading and extracting…' : 'Upload and read receipt'}</button>{error && <p className={s.error} role="alert">{error}</p>}{documentError&&<p className={s.error} role="alert">{documentError}</p>}</div>}
      {source && getLink && <SourceViewer source={source} getLink={getLink}/>}
      {demo ? <div className={s.documentGrid}>{documents.map(d=>{const fields=d.correctedFields??d.extractedFields;return <article className={`${s.panel} ${s.documentCard}`} key={d.id}><div className={s.documentTop}><div><h2>{fields.counterparty??'Unknown counterparty'}</h2><p className={`${s.small} ${s.muted}`}>{fields.date ? displayDate(fields.date) : 'Unknown date'}</p></div><Icon name="file" size={25}/></div><span className={`${s.badge} ${d.reviewStatus==='accepted'?s.good:s.pending}`}>{d.reviewStatus==='accepted'?'Fields reviewed':fields.totalMinor===null?'Total needs review':'Fields proposed'}</span><p><strong>PKR {money(fields.totalMinor)}</strong></p><button className={s.secondary} onClick={()=>setSelected(d.id)}>Review document <Icon name="chevron" size={15}/></button><p className={`${s.small} ${s.muted}`}>Synthetic source · {d.source.sourceId}</p></article>;})}</div> : liveRecords.length ? <section className={s.panel}>{liveRecords.map(item=>{const d=item.document,fields=d.correctedFields??d.extractedFields;return <article key={d.id} className={s.proposal}><div className={s.proposalHeading}><div><h2>{fields.counterparty??'Unknown counterparty'}</h2><p>{fields.date?displayDate(fields.date):'Date needs review'} · {fields.currency??'Currency unknown'} · {money(fields.totalMinor)}</p></div><span className={`${s.badge} ${d.reviewStatus==='accepted'?s.good:s.pending}`}>{d.reviewStatus==='accepted'?'Fields reviewed':d.extractionStatus==='complete'?'Extraction ready':d.extractionStatus==='failed'?'Extraction needs retry':'Awaiting extraction'}</span></div>{item.extractionFailure&&<p className={s.error}>Extraction status: {item.extractionFailure.replaceAll('_',' ')}.</p>}<div className={s.actions}><button className={s.secondary} onClick={()=>setSelected(d.id)}>Review fields</button>{d.reviewStatus!=='rejected'&&onExtractDocument&&<button className={s.textButton} disabled={extractingDocumentId===d.id} onClick={()=>void onExtractDocument(d.id)}>{extractingDocumentId===d.id?'Reading receipt…':d.extractionStatus==='complete'?'Recheck extraction':'Run extraction'}</button>}</div><p className={`${s.small} ${s.muted}`}>Original source · {d.source.sourceId} · review version {item.reviewVersion}</p></article>;})}</section> : sources.length ? <section className={s.panel}>{sources.map(item=><article key={item.sourceId} className={s.proposal}><div className={s.proposalHeading}><div><h2>{item.name}</h2><p>Private source stored{item.duplicate?' · existing source reused':''}</p></div><button className={s.secondary} onClick={()=>setSource(item)}>View source</button></div><p className={`${s.small} ${s.muted}`}>The image is stored. Registration or extraction can be retried by selecting the same file again.</p></article>)}</section> : <div className={`${s.panel} ${s.empty}`}><Icon name="file" size={28}/><h2>Give your records some context.</h2><p>Upload a receipt image. Each supporting document stays separate from cash transactions.</p></div>}
    </div>}
  </>;
}
