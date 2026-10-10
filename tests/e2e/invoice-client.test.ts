import test from 'node:test';
import assert from 'node:assert/strict';
import { api,ClientError } from '../../src/lib/client/api.ts';
import { syntheticInvoice,invoiceId } from '../helpers/invoice-fixture.ts';
const summary={currency:'PKR',period:'2026-10',sentMinor:'0',sentCount:0,paidMinor:'0',paidCount:0,overdueMinor:'0',overdueDueNowMinor:'0',overdueDueNowCount:0,overdueNextWeekMinor:'0',overdueNextWeekCount:0,overdueFutureMinor:'0',overdueFutureCount:0,cashflow:Array.from({length:31},(_,i)=>({day:i+1,amountMinor:'0'}))};
const envelope=(data:unknown)=>Response.json({data,error:null});
test('invoice list unwraps the API envelope and never returns undefined items for filter',async t=>{
 t.mock.method(globalThis,'fetch',async()=>envelope({items:[],summary}));assert.deepEqual((await api.invoices()).items,[]);
 for(const data of [{summary},{items:null,summary},{items:[{...syntheticInvoice(),totalMinor:'1'}],summary},{items:[{...syntheticInvoice(),totalMinor:10000}],summary}]){
  t.mock.method(globalThis,'fetch',async()=>envelope(data));await assert.rejects(api.invoices(),error=>error instanceof ClientError&&error.code==='UNAVAILABLE');t.mock.restoreAll();
 }
});
test('invoice commands unwrap verified records, preserve versions/signals and surface errors',async t=>{
 const invoice=syntheticInvoice(),signal=new AbortController().signal,calls:{path:string;body:unknown}[]=[];
 t.mock.method(globalThis,'fetch',async(path: string | URL | Request,init:RequestInit)=>{assert.equal(init.signal,signal);assert.equal(init.cache,'no-store');assert.equal(init.credentials,'same-origin');calls.push({path:String(path),body:JSON.parse(String(init.body))});return envelope(init.method==='DELETE'?{ok:true,deleted:invoiceId}:invoice);});
 const input={id:invoiceId,expectedVersion:0,clientName:invoice.clientName,items:invoice.items.map(({id,description,quantity,rateMinor})=>({id,description,quantity,rateMinor}))};
 assert.equal((await api.saveInvoice(input,signal)).id,invoiceId);
 assert.equal((await api.updateInvoiceStatus(invoiceId,'sent',0,signal)).reviewVersion,0);
 assert.equal((await api.deleteInvoice(invoiceId,0,signal)).ok,true);
 assert.equal((calls[1]!.body as {expectedVersion:number}).expectedVersion,0);assert.equal((calls[2]!.body as {expectedVersion:number}).expectedVersion,0);
 t.mock.restoreAll();t.mock.method(globalThis,'fetch',async()=>Response.json({data:null,error:{code:'CONFLICT',message:'Reload invoice.'}},{status:409}));
 await assert.rejects(api.saveInvoice(input),error=>error instanceof ClientError&&error.code==='CONFLICT'&&error.message==='Reload invoice.');
});
test('invoice AI uses the shared envelope and preserves actionable provider errors',async t=>{
 t.mock.method(globalThis,'fetch',async()=>envelope({draft:{clientName:'Synthetic Client'},assistantMessage:'Unsaved proposal',missingFields:['rate']}));
 assert.equal((await api.generateInvoiceWithAI('Synthetic',{})).draft.clientName,'Synthetic Client');
 t.mock.restoreAll();t.mock.method(globalThis,'fetch',async()=>Response.json({data:null,error:{code:'UNAVAILABLE',message:'Invoice AI reached the provider quota.'}},{status:503}));
 await assert.rejects(api.generateInvoiceWithAI('Synthetic',{}),/provider quota/);
});
