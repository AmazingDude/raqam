'use client';
import { useRef, useState } from 'react';
import type { DocumentRecord } from '../../lib/contracts/documents.ts';
import { api } from '../../lib/client/api.ts';
import { money } from '../../lib/client/presentation.ts';
import { usePrivateRequests } from '../../lib/client/use-private-requests.ts';
import s from '../ui/theme.module.css';

type HistoryItem=Awaited<ReturnType<typeof api.documentHistory>>['items'][number];
const fields=[['counterparty','Counterparty'],['date','Date'],['totalMinor','Total'],['currency','Currency'],['reference','Reference']] as const;
export function DocumentHistory({record}:{record:DocumentRecord}) {
  const run=usePrivateRequests(),lock=useRef(false);
  const [items,setItems]=useState<HistoryItem[]>([]),[cursor,setCursor]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function load(){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{const page=await run(signal=>api.documentHistory(record.document.id,record.document.workspaceId,signal,loaded?cursor:null));
      setItems(current=>[...current,...page.items.filter(item=>!current.some(existing=>existing.id===item.id))]);setCursor(page.nextCursor);setLoaded(true);
    }catch(error){setError(error instanceof Error?error.message:'Document history could not load. Retry.');}
    finally{lock.current=false;setBusy(false);}
  }
  return <section className={s.stack} aria-label="Saved document history"><h3>Saved document history</h3><p className={`${s.small} ${s.muted}`}>Recorded extraction and owner review changes. A document review does not create cash.</p>
    {error&&<p role="alert" className={s.error}>{error}</p>}
    {items.map(item=><details key={item.id}><summary>Version {item.reviewVersion} · {item.operation==='review'?'Owner review':'Extraction'} · {item.createdAt}</summary><p>Review state: {item.previous.document.reviewStatus} → {item.current.document.reviewStatus}</p><dl className={s.details}>{fields.map(([key,label])=>{
      const before=(item.previous.document.correctedFields??item.previous.document.extractedFields)[key],after=(item.current.document.correctedFields??item.current.document.extractedFields)[key];
      const display=(value:string|null)=>key==='totalMinor'?money(value):value??'Unknown';
      return <div key={key}><dt>{label}</dt><dd style={{overflowWrap:'anywhere'}}>{display(before)} → {display(after)}</dd></div>;
    })}</dl><p className={`${s.small} ${s.muted}`}>Original extracted observations remain available separately from reviewed values.</p></details>)}
    {loaded&&!items.length&&<p className={s.notice}>No saved history entries were returned for this document.</p>}
    {(!loaded||cursor!==null)&&<button className={s.secondary} type="button" disabled={busy} onClick={load}>{busy?'Loading saved history…':loaded?'Load more document history':'Load saved document history'}</button>}
    {loaded&&<p className={`${s.small} ${s.muted}`}>{cursor!==null?'More saved changes remain.':'Reached the end of the returned document history.'}</p>}
  </section>;
}
