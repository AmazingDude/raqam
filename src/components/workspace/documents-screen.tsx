'use client';
import { useEffect, useState } from 'react';
import type { DocumentFields, SupportingDocument } from '../../lib/contracts/index.ts';
import { documentFieldsSchema } from '../../lib/contracts/schemas.ts';
import { parseAmount, formatAmount } from '../../lib/server/money.ts';
import { displayDate, money } from '../../lib/client/presentation.ts';
import { exampleReceiptPrint } from '../../lib/client/examples.ts';
import { Icon } from '../ui/icon.tsx';
import s from '../ui/theme.module.css';
export type UploadedSource = { sourceId: string; name: string; duplicate: boolean };
export type PrivateLink = { signedUrl: string; expiresInSeconds: number };
function ExampleReceipt({ doc }: { doc: SupportingDocument }) {
  const fields = exampleReceiptPrint[doc.id as keyof typeof exampleReceiptPrint] ?? doc.extractedFields;
  return <div className={s.receipt}><span className={`${s.badge} ${s.pending}`}>Synthetic receipt</span><h3>{fields.counterparty ?? 'Unknown counterparty'}</h3><p className={`${s.small} ${s.muted}`}>{fields.date ? displayDate(fields.date) : 'Unknown date'}</p><div className={s.receiptLine}><span>Service / purchase</span><span>1 item</span></div><div className={s.receiptLine}><strong>Total · {fields.currency ?? 'Unknown currency'}</strong><strong>{money(fields.totalMinor)}</strong></div><div className={s.receiptLine}><span>Reference</span><span>{fields.reference ?? 'Not present'}</span></div><p className={`${s.small} ${s.muted}`} style={{marginTop:24}}>Code-rendered development example. Not an original financial document.</p></div>;
}
function DocumentReview({ doc, onSave, onClose }: { doc: SupportingDocument; onSave: (fields: DocumentFields, accepted: boolean) => void; onClose: () => void }) {
  const initial = doc.correctedFields ?? doc.extractedFields;
  const [counterparty,setCounterparty]=useState(initial.counterparty ?? ''), [date,setDate]=useState(initial.date ?? ''), [total,setTotal]=useState(initial.totalMinor === null ? '' : formatAmount(initial.totalMinor)), [currency,setCurrency]=useState(initial.currency ?? ''), [reference,setReference]=useState(initial.reference ?? ''), [error,setError]=useState('');
  function save(accepted: boolean) {
    const fields: DocumentFields = {counterparty:counterparty.trim() || null,date:date || null,totalMinor:parseAmount(total),currency:currency.trim() || null,reference:reference.trim() || null};
    if (!documentFieldsSchema.safeParse(fields).success || (total.trim() && fields.totalMinor === null)) {setError('Check the date and amount. Use YYYY-MM-DD and an exact nonnegative decimal amount.');return;}
    if (accepted && (!fields.counterparty || !fields.date || fields.totalMinor === null || fields.currency !== 'PKR')) {setError('Review requires a counterparty, a valid date, a known total and confirmed PKR currency. Leave uncertain details unresolved.');return;}
    onSave(fields,accepted);
  }
  return <div className={s.stack}><div className={s.actions}><button className={s.textButton} onClick={onClose}>Back to documents</button><span className={s.badge}>Example field review</span></div><div className={s.reviewGrid}>
    <aside className={s.sourcePane}><strong>Original source</strong><ExampleReceipt doc={doc}/><p className={`${s.small} ${s.muted}`}>Source: {doc.source.sourceId}. Original extracted fields stay visible here after correction.</p></aside>
    <form className={s.formPane} onSubmit={event=>{event.preventDefault();save(true);}}><h2>Review the proposed fields</h2><p className={`${s.small} ${s.muted}`}>Confirm details against the source. Reviewing a receipt does not add cash to your books.</p>
      <label className={s.field}>Counterparty<input value={counterparty} onChange={event=>setCounterparty(event.target.value)} maxLength={2000}/><small>Original: {doc.extractedFields.counterparty ?? 'Unknown'}</small></label>
      <label className={s.field}>Document date<input type="date" value={date} onChange={event=>setDate(event.target.value)}/><small>Original: {doc.extractedFields.date ?? 'Unknown'}</small></label>
      <label className={s.field}>Total amount<input inputMode="decimal" value={total} onChange={event=>setTotal(event.target.value)} placeholder="Unknown"/><small>Original: {money(doc.extractedFields.totalMinor)}</small></label>
      <label className={s.field}>Currency<input value={currency} onChange={event=>setCurrency(event.target.value)} placeholder="Unknown" maxLength={10}/><small>Confirm from evidence; do not assume the workspace currency.</small></label>
      <label className={s.field}>Reference <span className={s.muted}>(optional)</span><input value={reference} onChange={event=>setReference(event.target.value)} maxLength={500}/></label>
      {error && <p className={s.error} role="alert">{error}</p>}<div className={s.actions}><button className={s.button} type="submit">Save reviewed fields</button><button className={s.secondary} type="button" onClick={()=>save(false)}>Keep unresolved</button></div><p className={`${s.small} ${s.muted}`}>Example changes are held in memory only.</p>
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
  return <div className={s.sourcePane}><strong>{source.name}</strong>{busy && <p role="status">Opening private source…</p>}{link && <img src={link} alt={`Private supporting source: ${source.name}`} onError={()=>{setLink(null);setError('The image could not be displayed. Refresh its link to retry.');}}/>}{error && <p role="alert" className={s.error}>{error}</p>}<button className={s.secondary} onClick={()=>setRefresh(value=>value+1)} disabled={busy}>Refresh private link</button><p className={`${s.small} ${s.muted}`}>Source stored. Extraction and field review are awaiting integration.</p></div>;
}
export function DocumentsScreen({ demo, documents, onSave, sources, onUpload, getLink }: {
  demo: boolean; documents: SupportingDocument[]; onSave: (id:string,fields:DocumentFields,accepted:boolean)=>void;
  sources: UploadedSource[]; onUpload?: ((file:File)=>Promise<UploadedSource>) | undefined; getLink?: ((id:string)=>Promise<PrivateLink>) | undefined;
}) {
  const [selected,setSelected]=useState<string|null>(null),[source,setSource]=useState<UploadedSource|null>(null),[file,setFile]=useState<File|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const doc=documents.find(d=>d.id===selected);
  async function upload() {
    if(!file || !onUpload || busy)return;
    if(!['image/jpeg','image/png'].includes(file.type)||file.size>2*1024*1024){setError('Choose one JPEG or PNG image no larger than 2 MiB.');return;}
    setBusy(true);setError('');
    try {const saved=await onUpload(file);setSource(saved);setFile(null);} catch(error) {setError(error instanceof Error ? error.message : 'The upload failed. Your cashbook is unchanged. Retry the selected file.');} finally {setBusy(false);}
  }
  return <><div className={s.pageHeading}><div><h1>Documents</h1><p>Keep the evidence close. Review each detail.</p></div><span className={s.badge}>{demo ? `${documents.length} example receipts` : `${sources.length} sources uploaded this session`}</span></div>
    {doc ? <DocumentReview key={doc.id} doc={doc} onClose={()=>setSelected(null)} onSave={(fields,accepted)=>{onSave(doc.id,fields,accepted);setSelected(null);}}/> : <div className={s.stack}>
      {!demo && <div className={s.upload}><Icon name="upload" size={28}/><h2>Upload a supporting image</h2><p>One private JPEG or PNG · maximum 2 MiB. Storing a source does not create a cash transaction or run OCR.</p><label className={s.field}>Receipt image<input className={s.fileInput} type="file" accept="image/png,image/jpeg" onChange={event=>{setFile(event.target.files?.[0] ?? null);setError('');}} disabled={busy}/></label><button className={s.button} disabled={!file||busy} onClick={upload}>{busy ? 'Uploading…' : 'Upload private source'}</button>{error && <p className={s.error} role="alert">{error}</p>}</div>}
      {source && getLink && <SourceViewer source={source} getLink={getLink}/>}
      {demo ? <div className={s.documentGrid}>{documents.map(d=>{const fields=d.correctedFields??d.extractedFields;return <article className={`${s.panel} ${s.documentCard}`} key={d.id}><div className={s.documentTop}><div><h2>{fields.counterparty??'Unknown counterparty'}</h2><p className={`${s.small} ${s.muted}`}>{fields.date ? displayDate(fields.date) : 'Unknown date'}</p></div><Icon name="file" size={25}/></div><span className={`${s.badge} ${d.reviewStatus==='accepted'?s.good:s.pending}`}>{d.reviewStatus==='accepted'?'Fields reviewed':fields.totalMinor===null?'Total needs review':'Fields proposed'}</span><p><strong>PKR {money(fields.totalMinor)}</strong></p><button className={s.secondary} onClick={()=>setSelected(d.id)}>Review document <Icon name="chevron" size={15}/></button><p className={`${s.small} ${s.muted}`}>Synthetic source · {d.source.sourceId}</p></article>;})}</div> : sources.length ? <section className={s.panel}>{sources.map(item=><article key={item.sourceId} className={s.proposal}><div className={s.proposalHeading}><div><h2>{item.name}</h2><p>Private source stored{item.duplicate?' · existing source reused':''}</p></div><button className={s.secondary} onClick={()=>setSource(item)}>View source</button></div><span className={`${s.badge} ${s.pending}`}>Extraction pending integration</span></article>)}</section> : <div className={`${s.panel} ${s.empty}`}><Icon name="file" size={28}/><h2>Give your records some context.</h2><p>Upload a receipt image above. The document list and OCR workflow are awaiting their APIs; uploaded sources are shown for this session.</p></div>}
    </div>}
  </>;
}
