import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatPlan } from '../../src/lib/server/assistant/chat.ts';
import { mapCashbookRow } from '../../src/lib/server/cashbook-mapping.ts';
import type { Transaction } from '../../src/lib/contracts/index.ts';
const workspace='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000001';
const record:Transaction={id,workspaceId:workspace,source:{sourceId:'source',rowNumber:2},date:'2026-09-01',originalDescription:'Original rent',description:'Rent',direction:'out',amountMinor:'3000000',currency:'PKR',reference:null,category:null,categoryStatus:'needs_review',matchStatus:'unmatched'};
const ledger:Parameters<typeof buildChatPlan>[2]={accounts:[],journals:[],coverage:{workspaceId:workspace,selectedFrom:'2026-01-01',selectedThrough:'2026-12-31',availableFrom:null,availableThrough:null,isComplete:false,missingSourceKinds:[],unsupportedOpeningBalanceAccountIds:[]}};
const values={date:'2026-09-01',description:'Rent',direction:'out',amount:'30,000.01',reference:null,category:null,counterAccountId:null,clearCategory:false,clearReference:false};
const draft=(actions:unknown[])=>({kind:'changes',text:'Review changes',actions});
test('chat planner converts typed rupees exactly and leaves unspecified accounting for review',()=>{
 const result=buildChatPlan(draft([{kind:'create_cash',values}]),new Map(),ledger);
 const action=result.plan!.actions[0]!;assert.equal(action.kind,'create_cash');if(action.kind!=='create_cash')return;
 assert.equal(action.values.amountMinor,'3000001');assert.equal(action.values.date,'2026-09-01');assert.equal(action.counterAccountId,null);assert.equal(action.values.category,null);
});
test('chat planner asks for missing or invalid history facts rather than assigning zero or current year',()=>{
 for(const patch of [{date:null},{date:'2026-02-30'},{amount:null},{amount:'92233720368547758.08'},{direction:null},{description:null}]){
 const result=buildChatPlan(draft([{kind:'create_cash',values:{...values,...patch}}]),new Map(),ledger);assert.equal(result.plan,null);assert.ok(result.clarification);
 }
});
test('chat corrections bind current versions, preserve original evidence and permit explicit clearing',()=>{
 const rows=new Map([[id,{transaction:{...record,reference:'R',category:'travel' as const,categoryStatus:'accepted' as const},reviewVersion:4}]]);
 const result=buildChatPlan(draft([{kind:'edit_cash',transactionId:id,values:{...values,date:null,description:null,direction:null,reference:null,clearCategory:true,clearReference:true}}]),rows,ledger);
 const a=result.plan!.actions[0]!;assert.equal(a.kind,'edit_cash');if(a.kind!=='edit_cash')return;
 assert.equal(a.expectedVersion,4);assert.equal(a.before.originalDescription,'Original rent');assert.equal(a.values.date,record.date);assert.equal(a.values.category,null);assert.equal(a.values.reference,null);
});
test('chat corrections reject unknown targets, accepted-match money edits and foreign accounts',()=>{
 assert.equal(buildChatPlan(draft([{kind:'edit_cash',transactionId:id,values}]),new Map(),ledger).plan,null);
 assert.equal(buildChatPlan(draft([{kind:'edit_cash',transactionId:id,values}]),new Map([[id,{transaction:{...record,matchStatus:'accepted'},reviewVersion:1}]]),ledger).plan,null);
 assert.equal(buildChatPlan(draft([{kind:'create_cash',values:{...values,counterAccountId:id}}]),new Map(),ledger).plan,null);
});
test('manual provenance does not fabricate an uploaded file or a CSV row',()=>{
 const row=mapCashbookRow({id,workspace_id:workspace,source_id:id,source_row:2,source_type:'manual_chat',date:record.date,original_description:'Owner chat',description:record.description,direction:'out',amount_minor:'3000000',currency:'PKR',reference:null,category:null,category_status:'needs_review',match_status:'unmatched'});
 assert.deepEqual(row.source,{sourceId:id,rowNumber:null,kind:'manual_chat'});
});


test('human history must explicitly supply the year and amount even if a provider invents complete fields',()=>{
 const model=draft([{kind:'create_cash',values}]);
 assert.equal(buildChatPlan(model,new Map(),ledger,'I paid rent 30,000.01 on September 1.').plan,null);
 assert.equal(buildChatPlan(model,new Map(),ledger,'I paid rent on 2026-09-01.').plan,null);
 assert.ok(buildChatPlan(model,new Map(),ledger,'I paid rent 30,000.01 on 2026-09-01.').plan);
});
