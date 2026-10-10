import test from 'node:test';
import assert from 'node:assert/strict';
import type { RequestSession } from '../../src/lib/server/auth.ts';
import {createOrUpdateInvoice,listInvoices,mapInvoice,updateInvoiceStatus,deleteInvoice} from '../../src/lib/server/invoices.ts';
import {syntheticInvoice,databaseInvoice,invoiceWorkspace,invoiceId} from '../helpers/invoice-fixture.ts';
function session(handler:(name:string,args:Record<string,unknown>)=>{data:unknown;error:unknown}):RequestSession {
 return {database:{rpc:async(name:string,args:Record<string,unknown>)=>handler(name,args)}} as unknown as RequestSession;
}
test('invoice persistence uses atomic RPC and snake-case client contact, retains supplied UUID and computes totals',async()=>{
 const calls:string[]=[];const db=session((name,args)=>{calls.push(name);if(name==='read_workspace_invoice')return{data:null,error:null};
 assert.equal(name,'save_workspace_invoice');const payload=args.p_invoice as Record<string,unknown>;assert.equal(payload.client_contact,'Synthetic contact');assert.equal(payload.workspace_id,invoiceWorkspace);assert.equal(payload.total_minor,'10000');assert.equal(args.p_expected_version,null);return{data:databaseInvoice(),error:null};});
 const input={id:invoiceId,invoiceNumber:'SYNTHETIC-001',clientName:'Synthetic Client',clientContact:'Synthetic contact',items:[{description:'Synthetic service',quantity:1,rateMinor:'10000'}]};
 const result=await createOrUpdateInvoice(db,invoiceWorkspace,input,'PKR','Synthetic Studio');assert.equal(result.id,invoiceId);assert.deepEqual(calls,['read_workspace_invoice','save_workspace_invoice']);
});
test('invoice missing migration and database write failures never become successful empty lists or saves',async()=>{
 for(const code of ['42P01','PGRST202','42501']){
  const db=session(()=>({data:null,error:{code}}));await assert.rejects(listInvoices(db,invoiceWorkspace));await assert.rejects(createOrUpdateInvoice(db,invoiceWorkspace,{clientName:'Synthetic',items:[{description:'Synthetic',quantity:1,rateMinor:'100'}]},'PKR','Synthetic sender'));
  await assert.rejects(updateInvoiceStatus(db,invoiceWorkspace,invoiceId,'paid',0));await assert.rejects(deleteInvoice(db,invoiceWorkspace,invoiceId,0));
 }
});
test('invoice reads reject foreign records, imprecise bigint JSON, missing lines and inconsistent totals',()=>{
 const raw=databaseInvoice();for(const bad of [{...raw,workspace_id:crypto.randomUUID()},{...raw,total_minor:10000},{...raw,items:[]},{...raw,total_minor:'1'}])assert.throws(()=>mapInvoice(bad,invoiceWorkspace));
 assert.equal(mapInvoice(raw,invoiceWorkspace).totalMinor,'10000');
});
test('legacy database line metadata is accepted only for the current owner workspace',()=>{
 const raw=databaseInvoice();
 const line=(raw.items as Record<string,unknown>[])[0]!;
 const legacy={...raw,items:[{...line,workspace_id:invoiceWorkspace,created_at:'2026-10-10T00:00:00Z'}]};
 assert.equal(mapInvoice(legacy,invoiceWorkspace).items[0]!.invoiceId,invoiceId);
 assert.throws(()=>mapInvoice({...legacy,items:[{...legacy.items[0],workspace_id:crypto.randomUUID()}]},invoiceWorkspace));
 assert.throws(()=>mapInvoice({...legacy,items:[{...legacy.items[0],unexpected:'synthetic'}]},invoiceWorkspace));
});
test('invoice edits preserve omitted fields and reject missing/stale-shaped versions before writes',async()=>{
 const old=syntheticInvoice();old.clientAddress='Synthetic address';let saves=0;
 const db=session((name,args)=>{if(name==='read_workspace_invoice')return{data:databaseInvoice(old),error:null};saves++;assert.equal((args.p_invoice as Record<string,unknown>).client_address,'Synthetic address');return{data:databaseInvoice({...old,reviewVersion:1}),error:null};});
 const input={id:invoiceId,items:old.items.map(({description,quantity,rateMinor})=>({description,quantity,rateMinor}))};
 await assert.rejects(createOrUpdateInvoice(db,invoiceWorkspace,input),/Reload/);assert.equal(saves,0);
 assert.equal((await createOrUpdateInvoice(db,invoiceWorkspace,{...input,expectedVersion:0})).reviewVersion,1);assert.equal(saves,1);
});
test('an identical complete create retry reads the committed invoice without another write',async()=>{
 const old=syntheticInvoice();let calls=0;
 const db=session(name=>{calls++;assert.equal(name,'read_workspace_invoice');return{data:databaseInvoice(old),error:null};});
 const input={id:old.id,invoiceNumber:old.invoiceNumber,status:old.status,issueDate:old.issueDate,dueDate:old.dueDate,
   fromName:old.fromName,clientName:old.clientName,currency:old.currency,items:old.items.map(({id,description,quantity,rateMinor})=>({id,description,quantity,rateMinor}))};
 assert.equal((await createOrUpdateInvoice(db,invoiceWorkspace,input)).id,old.id);assert.equal(calls,1);
 await assert.rejects(createOrUpdateInvoice(db,invoiceWorkspace,{...input,clientName:'Changed synthetic client'}),/Reload/);
 const edited=session(()=>({data:databaseInvoice({...old,reviewVersion:1}),error:null}));
 await assert.rejects(createOrUpdateInvoice(edited,invoiceWorkspace,input),/Reload/);
});
