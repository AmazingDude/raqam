'use client';
import { useEffect, useRef, useState } from 'react';
import type { Invoice, InvoiceStatus, InvoicesSummary } from '../../../lib/contracts/invoices.ts';
import { invoiceUpsertInputSchema } from '../../../lib/contracts/invoices.ts';
import { api } from '../../../lib/client/api.ts';
import { usePrivateRequests } from '../../../lib/client/use-private-requests.ts';
import { InvoicesDashboard } from './invoices-dashboard.tsx';
import { InvoiceEditor } from './invoice-editor.tsx';
import { InvoicePreview } from './invoice-preview.tsx';

export function InvoicesScreen({ demo = false, businessName = '', currency = 'PKR' }: { demo?: boolean; businessName?: string; currency?: string }) {
  const run=usePrivateRequests(), locked=useRef(false);
  const [view,setView]=useState<'dashboard'|'editor'>('dashboard');
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [summary,setSummary]=useState<InvoicesSummary>({ currency,period:new Date().toISOString().slice(0,7),sentMinor:'0',sentCount:0,paidMinor:'0',paidCount:0,
    overdueMinor:'0',overdueDueNowMinor:'0',overdueDueNowCount:0,overdueNextWeekMinor:'0',overdueNextWeekCount:0,overdueFutureMinor:'0',overdueFutureCount:0,
    cashflow:Array.from({length:31},(_,i)=>({day:i+1,amountMinor:'0'})) });
  const [activeInvoice,setActiveInvoice]=useState<Invoice|null>(null);
  const [previewInvoice,setPreviewInvoice]=useState<Invoice|null>(null);
  const [loading,setLoading]=useState(!demo),[busy,setBusy]=useState(false),[loadError,setLoadError]=useState('');
  useEffect(()=>{
    if (demo) return;
    let active=true; const controller=new AbortController();
    void api.invoices(controller.signal).then(data=>{if(active){setInvoices(data.items);setSummary(data.summary);}})
      .catch(error=>{if(active && error.name!=='AbortError')setLoadError(error instanceof Error?error.message:'Invoices could not be loaded.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[demo]);
  async function refreshData() {
    const data=await run(signal=>api.invoices(signal));
    setInvoices(data.items);setSummary(data.summary);setLoadError('');
  }
  async function exclusive(work:()=>Promise<void>) {
    if(locked.current)return;
    if(demo)throw new Error('Example invoices are read-only. Open your workspace to save.');
    locked.current=true;setBusy(true);setLoadError('');
    try {await work();} finally{locked.current=false;setBusy(false);}
  }
  async function handleSave(draft:Partial<Invoice>) {
    await exclusive(async()=>{
      const { workspaceId:_workspaceId,subtotalMinor:_subtotal,totalMinor:_total,viewsCount:_views,createdAt:_created,updatedAt:_updated,
        reviewVersion,items,...fields }=draft;
      const input=invoiceUpsertInputSchema.safeParse({...fields,...(activeInvoice?{expectedVersion:reviewVersion}:{}),
        items:(items??[]).map(({id,description,quantity,rateMinor})=>({id,description,quantity,rateMinor}))});
      if(!input.success)throw new Error('Enter a client, sender, line description and valid amounts. Quantities allow two decimals.');
      const saved=await run(signal=>api.saveInvoice(input.data,signal));
      setInvoices(current=>[saved,...current.filter(item=>item.id!==saved.id)]);
      try{await refreshData();}catch{setLoadError('The invoice was saved, but the list and summary could not refresh. Reload invoices before making another change.');}
      setView('dashboard');setActiveInvoice(null);
    });
  }
  async function handleUpdateStatus(id:string,status:InvoiceStatus) {
    try{await exclusive(async()=>{
      const invoice=invoices.find(item=>item.id===id);if(!invoice)throw new Error('Reload the invoice list.');
      const saved=await run(signal=>api.updateInvoiceStatus(id,status,invoice.reviewVersion,signal));
      setInvoices(current=>current.map(item=>item.id===id?saved:item));await refreshData();
    });}catch(error){if(!(error instanceof Error && error.name==='AbortError'))setLoadError(error instanceof Error?error.message:'Status could not be updated.');}
  }
  async function handleDelete(id:string) {
    try{await exclusive(async()=>{
      const invoice=invoices.find(item=>item.id===id);if(!invoice)throw new Error('Reload the invoice list.');
      await run(signal=>api.deleteInvoice(id,invoice.reviewVersion,signal));
      setInvoices(current=>current.filter(item=>item.id!==id));await refreshData();
    });}catch(error){if(!(error instanceof Error && error.name==='AbortError'))setLoadError(error instanceof Error?error.message:'Invoice could not be deleted.');}
  }
  if(view==='editor')return <InvoiceEditor initialInvoice={activeInvoice} businessName={businessName} workspaceCurrency={currency} demo={demo} onSave={handleSave} onCancel={()=>{if(!busy){setView('dashboard');setActiveInvoice(null);}}}/>;
  return <>
    {loadError&&<div role="alert" style={{padding:'12px 20px',background:'var(--bad-bg)',color:'var(--bad)',borderRadius:8,margin:'16px 24px'}}>{loadError}<button type="button" disabled={busy} onClick={()=>{void exclusive(refreshData).catch(error=>setLoadError(error instanceof Error?error.message:'Reload failed.'));}}>Reload invoices</button></div>}
    <InvoicesDashboard invoices={invoices} summary={summary} loading={loading} busy={busy} onCreateNew={()=>{setActiveInvoice(null);setView('editor');}}
      onEditInvoice={invoice=>{setActiveInvoice(invoice);setView('editor');}} onPreviewInvoice={invoice=>setPreviewInvoice(invoice)} onUpdateStatus={handleUpdateStatus} onDeleteInvoice={handleDelete}/>
    {previewInvoice&&<InvoicePreview invoice={previewInvoice} onClose={()=>setPreviewInvoice(null)}/>}
  </>;
}
