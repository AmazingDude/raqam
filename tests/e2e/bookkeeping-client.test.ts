import test from 'node:test';import assert from 'node:assert/strict';
import {bookkeepingApi} from '../../src/lib/client/bookkeeping-api.ts';
import {RetryKey,billLine,exactMoney,displayMinor} from '../../src/lib/client/bookkeeping-editor.ts';
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const workspace=id(1),foreign=id(2),signal=new AbortController().signal;
const coverage={workspaceId:workspace,selectedFrom:'2026-01-01',selectedThrough:'2026-12-31',availableFrom:null,availableThrough:null,isComplete:false,missingSourceKinds:['bank'],unsupportedOpeningBalanceAccountIds:[]};
const expense={id:id(3),workspaceId:workspace,originalText:'Synthetic note',description:null,counterparty:null,occurredOn:null,amountMinor:null,currency:null,status:'needs_review',version:0,createdAt:'2026-10-10T00:00:00Z',updatedAt:'2026-10-10T00:00:00Z'};
const line=billLine(id(4),'Synthetic service','0.5','1.01');
const bill={id:id(5),workspaceId:workspace,supplierName:'Synthetic supplier',supplierReference:null,issueDate:'2026-10-10',dueDate:null,goodsReceivedDate:null,sourceDocumentId:null,expenseAccountId:null,lines:[line],totalMinor:'51',status:'draft',version:0,journalId:null,createdAt:'2026-10-10T00:00:00Z',updatedAt:'2026-10-10T00:00:00Z'};
const envelope=(data:unknown)=>Response.json({data,error:null});
test('draft clients preserve unknowns and reject foreign, duplicate or missing responses',async t=>{
 t.mock.method(globalThis,'fetch',async()=>envelope({items:[expense]}));assert.equal((await bookkeepingApi.expenses(workspace,signal))[0]!.amountMinor,null);
 for(const items of [[{...expense,workspaceId:foreign}],[expense,expense],[{...expense,id:null}],[{...expense,amountMinor:25}]]){t.mock.method(globalThis,'fetch',async()=>envelope({items}));await assert.rejects(bookkeepingApi.expenses(workspace,signal));}
 t.mock.method(globalThis,'fetch',async()=>envelope({}));await assert.rejects(bookkeepingApi.expenses(workspace,signal));
});
test('expense saves and reviews send canonical fields, stable keys, versions and cancellation',async t=>{
 let calls=0;const keys=new RetryKey();const command={id:null,expectedVersion:null,originalText:expense.originalText,description:null,counterparty:null,occurredOn:null,amountMinor:null,currency:null};const requestId=keys.for(command);
 t.mock.method(globalThis,'fetch',async(path:string|URL|Request,init:RequestInit)=>{calls++;assert.equal(init.signal,signal);assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');const input=JSON.parse(String(init.body));assert.equal(input.requestId,requestId);assert.ok(!('workspaceId'in input));return envelope({draft:expense,duplicate:calls>1});});
 assert.equal((await bookkeepingApi.saveExpense(workspace,{...command,requestId},signal)).duplicate,false);assert.equal(keys.for(command),requestId);assert.equal((await bookkeepingApi.saveExpense(workspace,{...command,requestId},signal)).duplicate,true);
 t.mock.method(globalThis,'fetch',async(path:string|URL|Request,init:RequestInit)=>{assert.equal(init.method,'PATCH');assert.equal(JSON.parse(String(init.body)).expectedVersion,0);return envelope({draft:{...expense,status:'rejected',version:1},duplicate:false});});
 assert.equal((await bookkeepingApi.reviewExpense(workspace,id(3),{requestId:id(9),expectedVersion:0,action:'reject',reason:'Synthetic missing evidence'},signal)).draft.status,'rejected');
 t.mock.method(globalThis,'fetch',async()=>envelope({draft:{...expense,id:id(6),status:'rejected'},duplicate:false}));await assert.rejects(bookkeepingApi.reviewExpense(workspace,id(3),{requestId:id(9),expectedVersion:0,action:'reject'},signal));
});
test('saved bill client independently verifies line multiplication, totals and owner',async t=>{
 t.mock.method(globalThis,'fetch',async()=>envelope({items:[bill]}));assert.equal((await bookkeepingApi.bills(workspace,signal))[0]!.totalMinor,'51');
 for(const bad of [{...bill,workspaceId:foreign},{...bill,totalMinor:'50'},{...bill,lines:[{...line,rateMinor:'100'}]},{...bill,totalMinor:51}]){t.mock.method(globalThis,'fetch',async()=>envelope({items:[bad]}));await assert.rejects(bookkeepingApi.bills(workspace,signal));}
});
test('bill commands carry exact lines and approval requires explicit received date and account',async t=>{
 const {workspaceId:_workspace,totalMinor:_total,status:_status,version:_version,journalId:_journal,createdAt:_created,updatedAt:_updated,...fields}=bill;
 t.mock.method(globalThis,'fetch',async(path:string|URL|Request,init:RequestInit)=>{assert.equal(JSON.parse(String(init.body)).lines[0].amountMinor,'51');return envelope({bill,duplicate:false});});
 assert.equal((await bookkeepingApi.saveBill(workspace,{...fields,id:null,expectedVersion:null,requestId:id(9)},signal)).bill.id,id(5));
 await assert.rejects(bookkeepingApi.reviewBill(workspace,id(5),{requestId:id(9),expectedVersion:0,action:'accept'},signal));
 t.mock.method(globalThis,'fetch',async()=>envelope({bill,duplicate:false}));await assert.rejects(bookkeepingApi.reviewBill(workspace,id(5),{requestId:id(9),expectedVersion:0,action:'reject'},signal));
});
test('ledger snapshots reject foreign coverage and reports reject wrong dates and numerical totals',async t=>{
 t.mock.method(globalThis,'fetch',async()=>envelope({accounts:[],journals:[],coverage}));assert.equal((await bookkeepingApi.ledger(workspace,signal)).coverage.isComplete,false);
 t.mock.method(globalThis,'fetch',async()=>envelope({accounts:[],journals:[],coverage:{...coverage,workspaceId:foreign}}));await assert.rejects(bookkeepingApi.ledger(workspace,signal));
 const report={workspaceId:workspace,asOf:'2026-10-10',currency:'PKR',rows:[],debitTotalMinor:'0',creditTotalMinor:'0',coverage};
 t.mock.method(globalThis,'fetch',async(path:string|URL|Request)=>{assert.match(String(path),/kind=trial_balance/);return envelope(report);});assert.equal((await bookkeepingApi.report(workspace,{kind:'trial_balance',asOf:'2026-10-10'},signal)).coverage.isComplete,false);
 for(const bad of [{...report,asOf:'2026-10-09'},{...report,workspaceId:foreign},{...report,debitTotalMinor:'1'},{...report,debitTotalMinor:0}]){t.mock.method(globalThis,'fetch',async()=>envelope(bad));await assert.rejects(bookkeepingApi.report(workspace,{kind:'trial_balance',asOf:'2026-10-10'},signal));}
});
test('conflicts and unavailable storage preserve actionable errors instead of empty success',async t=>{
 for(const [status,code]of [[409,'CONFLICT'],[503,'UNAVAILABLE'],[401,'UNAUTHENTICATED']] as const){t.mock.method(globalThis,'fetch',async()=>Response.json({data:null,error:{code,message:'Synthetic failure; reload saved state.'}},{status}));await assert.rejects(bookkeepingApi.expenses(workspace,signal),/reload saved state/);await assert.rejects(bookkeepingApi.ledger(workspace,signal),/reload saved state/);}
});
test('editor money uses exact arithmetic and retry identity changes only with the command',()=>{
 assert.equal(exactMoney(''),null);assert.equal(exactMoney('1.01'),'101');assert.throws(()=>exactMoney('1.001'));assert.equal(line.amountMinor,'51');assert.throws(()=>billLine(id(4),'Synthetic','1.001','1'));
 assert.equal(displayMinor('-9007199254740993'),'-90,071,992,547,409.93');
 const keys=new RetryKey();const key=keys.for({id:id(3),version:0,action:'accept'});assert.equal(keys.for({id:id(3),version:0,action:'accept'}),key);assert.notEqual(keys.for({id:id(3),version:1,action:'accept'}),key);
});
