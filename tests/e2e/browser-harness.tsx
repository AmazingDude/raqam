'use client';
// Temporary local browser fixture. All API responses are simulated, including
// deliberate failures after a save. This never authenticates or contacts Supabase.
import { useEffect, useRef, useState } from 'react';
import { WorkspaceApp } from '../../src/components/workspace/workspace-app.tsx';
import type { ReviewDecision, Transaction } from '../../src/lib/contracts/index.ts';
import type { ImportConfirmation } from '../../src/lib/contracts/imports.ts';
import { calculateCashSummary } from '../../src/lib/server/summary.ts';
import { exportCashbook } from '../../src/lib/server/export.ts';
import { exampleTransactions } from '../../src/lib/client/examples.ts';

const importId = '10000000-0000-4000-8000-000000000001';
const workspace = { id: 'fixture-workspace', ownerSubject: 'fixture-owner', businessName: 'Synthetic browser fixture', currency: 'PKR' as const };
const preview = { currency: 'PKR' as const, contentHash: 'a'.repeat(64), header: ['date', 'description', 'direction', 'amount', 'reference'] as const,
  validCount: 1, invalidCount: 1, rows: [
    { rowNumber: 2, lineNumber: 2, original: ['2026-10-10','Fixture customer','in','100.01','B-1'], transaction: { date:'2026-10-10',description:'Fixture customer',direction:'in' as const,amountMinor:'10001',currency:'PKR' as const,reference:'B-1' }, errors: [] },
    { rowNumber: 3, lineNumber: 3, original: ['2026-10-10','Fixture unknown','out','unknown',''], transaction: null, errors: [{field:'amount',message:'Amount is unknown.'}] },
  ] };
type History = ReviewDecision & { reviewVersion: number };
export default function BrowserHarness() {
  const store = useRef({ records: exampleTransactions().slice(0,2).map((record,index) => ({...record,id:`20000000-0000-4000-8000-00000000000${index+1}`,workspaceId:workspace.id})),
    confirmed:false, confirmation:null as null | {importId:string;importedCount:number;rejectedCount:number;unresolvedCount:number},
    outcomes: new Map<number,{rowNumber:number;outcome:'imported'|'rejected'|'unresolved';transactionId:string|null}>(),
    receipts:new Map<string,unknown>(), versions:new Map<string,number>(), history:[] as History[], loseConfirm:false, loseResolution:false, conflict:false, failSummary:false, failExport:false,
  });
  const [ready,setReady]=useState(false),[records,setRecords]=useState<Transaction[]>([]),[revision,setRevision]=useState(0),[summaryError,setSummaryError]=useState('');
  useEffect(()=>{
    const originalFetch=window.fetch;
    const ok=(data:unknown)=>Response.json({data,error:null});
    const error=(code:string,message:string,status=409)=>Response.json({data:null,error:{code,message}},{status});
    window.fetch=async(input,init)=>{
      const path=String(input),db=store.current;
      if(!path.startsWith('/api/'))return originalFetch(input,init);
      const url=new URL(path,window.location.origin),method=init?.method??'GET';
      if(init?.signal?.aborted)throw new DOMException('Aborted','AbortError');
      if(url.pathname==='/api/export')return db.failExport?error('UNAVAILABLE','Simulated export unavailable. Retry.',503):new Response(exportCashbook(db.records,workspace.id),{headers:{'Content-Type':'text/csv','X-Raqam-Transaction-Count':String(db.records.length),'X-Raqam-Unresolved-Import-Rows':String([...db.outcomes.values()].filter(row=>row.outcome==='unresolved').length)}});
      const batch=()=>({importId,preview,status:db.confirmed?'confirmed':'pending',confirmation:db.confirmation});
      if(path==='/api/imports'&&method==='POST')return ok({...batch(),duplicate:db.confirmed});
      if(path===`/api/imports/${importId}`)return ok(batch());
      const apply=(rows:ImportConfirmation['rows'],initial:boolean)=>{
        for(const row of preview.rows){
          if(!initial&&db.outcomes.get(row.rowNumber)?.outcome!=='unresolved')continue;
          const decision=rows.find(item=>item.rowNumber===row.rowNumber);
          if(!initial&&!decision)continue;
          const transaction=decision?.action==='correct'?decision.transaction:decision?.action==='reject'?null:row.transaction;
          if(transaction){const id=`30000000-0000-4000-8000-00000000000${row.rowNumber}`;
            db.records.push({...transaction,id,workspaceId:workspace.id,source:{sourceId:importId,rowNumber:row.rowNumber},originalDescription:row.original[1]!,category:null,categoryStatus:'needs_review',matchStatus:'unmatched'});
            db.outcomes.set(row.rowNumber,{rowNumber:row.rowNumber,outcome:'imported',transactionId:id});
          }else db.outcomes.set(row.rowNumber,{rowNumber:row.rowNumber,outcome:decision?.action==='reject'?'rejected':'unresolved',transactionId:null});
        }
      };
      if(path===`/api/imports/${importId}/confirmation`){
        const duplicate=db.confirmed;
        if(!duplicate){apply(JSON.parse(String(init?.body)).rows,true);db.confirmed=true;const rows=[...db.outcomes.values()];db.confirmation={importId,importedCount:rows.filter(row=>row.outcome==='imported').length,rejectedCount:rows.filter(row=>row.outcome==='rejected').length,unresolvedCount:rows.filter(row=>row.outcome==='unresolved').length};}
        if(db.loseConfirm){db.loseConfirm=false;throw new TypeError('Simulated lost confirmation response. Retry the saved decisions.');}
        return ok({...db.confirmation,duplicate});
      }
      if(path===`/api/imports/${importId}/resolutions`){
        const rows=()=>[...db.outcomes.values()];
        if(method==='GET')return ok({importId,rows:rows(),importedCount:rows().filter(row=>row.outcome==='imported').length,rejectedCount:rows().filter(row=>row.outcome==='rejected').length,unresolvedCount:rows().filter(row=>row.outcome==='unresolved').length});
        const body=JSON.parse(String(init?.body)) as ImportConfirmation&{requestId:string},prior=db.receipts.get(body.requestId);
        if(prior)return ok({...prior as object,duplicate:true});
        apply(body.rows,false);
        const receipt={importId,requestId:body.requestId,correctedCount:body.rows.filter(row=>row.action==='correct').length,rejectedCount:body.rows.filter(row=>row.action==='reject').length,remainingUnresolvedCount:rows().filter(row=>row.outcome==='unresolved').length,transactionIds:body.rows.filter(row=>row.action==='correct').map(row=>`30000000-0000-4000-8000-00000000000${row.rowNumber}`),duplicate:false};
        db.receipts.set(body.requestId,receipt);
        if(db.loseResolution){db.loseResolution=false;throw new TypeError('Simulated lost resolution response. Retry the same request.');}
        return ok(receipt);
      }
      const match=url.pathname.match(/^\/api\/transactions\/([^/]+)(\/reviews)?$/);
      if(match){const id=match[1]!,record=db.records.find(item=>item.id===id);if(!record)return error('NOT_FOUND','Fixture record missing.',404);
        if(match[2])return ok({items:db.history.filter(item=>item.targetId===id),nextCursor:null});
        const version=db.versions.get(id)??0;
        if(method==='PATCH'){
          const patch=JSON.parse(String(init?.body));
          if(db.conflict){db.conflict=false;record.description='Changed in another browser';db.versions.set(id,version+1);return error('CONFLICT','This transaction changed. Reload it before saving your review.');}
          if(patch.expectedVersion!==version)return error('CONFLICT','Reload before saving.');
          const previous={description:record.description,category:record.category};record.description=patch.description;record.category=patch.category;record.categoryStatus=patch.category?'accepted':'needs_review';db.versions.set(id,version+1);
          db.history.push({id:crypto.randomUUID(),workspaceId:workspace.id,targetId:id,actorSubject:workspace.ownerSubject,action:'correct',previous,current:{description:record.description,category:record.category},createdAt:new Date().toISOString(),reviewVersion:version+1});
        }
        return ok({transaction:record,reviewVersion:db.versions.get(id)??0});
      }
      return error('UNAVAILABLE','This synthetic endpoint is intentionally unavailable.',503);
    };
    setRecords([...store.current.records]);setReady(true);
    return()=>{window.fetch=originalFetch;};
  },[]);
  async function refresh(){setRecords([...store.current.records]);setSummaryError(store.current.failSummary?'Simulated summary unavailable. Retry.':'');setRevision(value=>value+1);}
  const unresolved=[...store.current.outcomes.values()].filter(row=>row.outcome==='unresolved').length;
  return <><aside style={{padding:16,background:'#fff3cd',fontFamily:'sans-serif'}}><strong>LOCAL TEST ONLY: synthetic API responses; no login, cloud records or live AI.</strong><div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:12}}>
    <button onClick={()=>{store.current.loseConfirm=true;}}>Lose next confirmation response</button><button onClick={()=>{store.current.loseResolution=true;}}>Lose next resolution response</button><button onClick={()=>{store.current.conflict=true;}}>Conflict on next review</button><button onClick={()=>{store.current.failSummary=!store.current.failSummary;void refresh();}}>Toggle summary failure</button><button onClick={()=>{store.current.failExport=!store.current.failExport;}}>Toggle export failure</button><button onClick={()=>setRevision(value=>value+1)}>Remount private screens</button>
  </div></aside>{ready&&<WorkspaceApp key={revision} demo={false} workspace={workspace} records={records} summary={summaryError?null:calculateCashSummary(records,workspace.id,unresolved)} summaryError={summaryError} onChanged={async()=>{setRecords([...store.current.records]);}}/>}</>;
}
