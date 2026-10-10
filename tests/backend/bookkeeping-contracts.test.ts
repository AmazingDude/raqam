import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseDraftInputSchema,supplierBillDraftInputSchema,supplierBillReviewSchema } from '../../src/lib/contracts/bookkeeping.ts';

const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const expense={requestId:id(1),id:null,expectedVersion:null,originalText:'Paid 25 to a supplier',description:null,counterparty:null,occurredOn:null,amountMinor:null,currency:null};
const bill={requestId:id(2),id:null,expectedVersion:null,supplierName:'Supplier',supplierReference:null,issueDate:'2026-10-10',dueDate:null,goodsReceivedDate:null,
 sourceDocumentId:null,expenseAccountId:null,lines:[{id:id(3),description:'Service received',quantity:1,rateMinor:'2500',amountMinor:'2500'}]};

test('expense draft keeps unknowns unresolved and requires paired amount/currency',()=>{
 assert.equal(expenseDraftInputSchema.safeParse(expense).success,true);
 assert.equal(expenseDraftInputSchema.safeParse({...expense,amountMinor:'2500'}).success,false);
 assert.equal(expenseDraftInputSchema.safeParse({...expense,amountMinor:'0',currency:'PKR'}).success,false);
 assert.equal(expenseDraftInputSchema.safeParse({...expense,workspaceId:id(9)}).success,false);
});
test('supplier bill lines require exact positive arithmetic and explicit goods-received acceptance',()=>{
 assert.equal(supplierBillDraftInputSchema.safeParse(bill).success,true);
 assert.equal(supplierBillDraftInputSchema.safeParse({...bill,lines:[{...bill.lines[0],amountMinor:'2499'}]}).success,false);
 assert.equal(supplierBillDraftInputSchema.safeParse({...bill,lines:[{...bill.lines[0],rateMinor:'0',amountMinor:'0'}]}).success,false);
 assert.equal(supplierBillReviewSchema.safeParse({requestId:id(4),expectedVersion:0,action:'accept'}).success,false);
 assert.equal(supplierBillReviewSchema.safeParse({requestId:id(4),expectedVersion:0,action:'accept',goodsReceivedDate:'2026-10-10',expenseAccountId:id(5)}).success,true);
});
