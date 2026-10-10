import { z } from 'zod';
import { dateSchema, minorUnitsSchema } from './schemas.ts';
import { invoiceQuantitySchema } from './invoices.ts';
import { invoiceTotals } from '../invoice-money.ts';

const expenseDraftFields=z.strictObject({
 requestId:z.uuid(),id:z.uuid().nullable(),expectedVersion:z.number().int().min(0).max(2147483647).nullable(),
 originalText:z.string().trim().min(1).max(3000),description:z.string().trim().min(1).max(500).nullable(),
 counterparty:z.string().trim().min(1).max(200).nullable(),occurredOn:dateSchema.nullable(),amountMinor:minorUnitsSchema.nullable(),currency:z.literal('PKR').nullable(),
});
export const expenseDraftInputSchema=expenseDraftFields.superRefine((draft,ctx)=>{
 if((draft.id===null)!==(draft.expectedVersion===null))ctx.addIssue({code:'custom',path:['expectedVersion'],message:'Create has no ID/version; update requires both.'});
 if((draft.amountMinor===null)!==(draft.currency===null))ctx.addIssue({code:'custom',path:['currency'],message:'Amount and currency must both be known or both remain unresolved.'});
 if(draft.amountMinor!==null&&BigInt(draft.amountMinor)===0n)ctx.addIssue({code:'custom',path:['amountMinor'],message:'Expense amount must be positive.'});
});
export const expenseDraftSchema=expenseDraftFields.omit({requestId:true,expectedVersion:true}).extend({
 workspaceId:z.uuid(),status:z.enum(['draft','needs_review','accepted','rejected']),version:z.number().int().min(0).max(2147483647),createdAt:z.iso.datetime({offset:true}),updatedAt:z.iso.datetime({offset:true}),
});
export type ExpenseDraftInput=z.infer<typeof expenseDraftInputSchema>;
export type ExpenseDraft=z.infer<typeof expenseDraftSchema>;
export const expenseDraftReviewSchema=z.strictObject({requestId:z.uuid(),expectedVersion:z.number().int().min(0).max(2147483647),action:z.enum(['accept','reject']),reason:z.string().trim().min(1).max(1000).optional()});

export const supplierBillLineSchema=z.strictObject({
 id:z.uuid(),description:z.string().trim().min(1).max(1000),quantity:invoiceQuantitySchema,rateMinor:minorUnitsSchema,amountMinor:minorUnitsSchema,
}).superRefine((line,ctx)=>{if(line.quantity<=0||BigInt(line.rateMinor)===0n||BigInt(line.amountMinor)===0n)ctx.addIssue({code:'custom',path:['amountMinor'],message:'Supplier bill lines must be positive.'});});
const supplierBillDraftFields=z.strictObject({
 requestId:z.uuid(),id:z.uuid().nullable(),expectedVersion:z.number().int().min(0).max(2147483647).nullable(),supplierName:z.string().trim().min(1).max(200),
 supplierReference:z.string().trim().max(128).nullable(),issueDate:dateSchema,dueDate:dateSchema.nullable(),goodsReceivedDate:dateSchema.nullable(),
 sourceDocumentId:z.uuid().nullable(),expenseAccountId:z.uuid().nullable(),lines:z.array(supplierBillLineSchema).min(1).max(100),
});
export const supplierBillDraftInputSchema=supplierBillDraftFields.superRefine((bill,ctx)=>{
 if((bill.id===null)!==(bill.expectedVersion===null))ctx.addIssue({code:'custom',path:['expectedVersion'],message:'Create has no ID/version; update requires both.'});
 if(bill.dueDate&&bill.dueDate<bill.issueDate)ctx.addIssue({code:'custom',path:['dueDate'],message:'Due date cannot precede the bill date.'});
 try{const totals=invoiceTotals(bill.lines,'0','0','0');if(bill.lines.some((line,i)=>line.amountMinor!==totals.amounts[i]))ctx.addIssue({code:'custom',path:['lines'],message:'Line arithmetic does not match.'});}
 catch{ctx.addIssue({code:'custom',path:['lines'],message:'Line amounts must be exact PKR minor units.'});}
});
export const supplierBillSchema=supplierBillDraftFields.omit({requestId:true,expectedVersion:true}).extend({
 workspaceId:z.uuid(),status:z.enum(['draft','needs_review','posted','rejected']),version:z.number().int().min(0).max(2147483647),totalMinor:minorUnitsSchema,
 journalId:z.uuid().nullable(),createdAt:z.iso.datetime({offset:true}),updatedAt:z.iso.datetime({offset:true}),
}).superRefine((bill,ctx)=>{
 const total=bill.lines.reduce((sum,line)=>sum+BigInt(line.amountMinor),0n);
 if(total!==BigInt(bill.totalMinor))ctx.addIssue({code:'custom',path:['totalMinor'],message:'Supplier bill total must equal exact lines.'});
 if(bill.status==='posted'&&(!bill.goodsReceivedDate||!bill.expenseAccountId||!bill.journalId))ctx.addIssue({code:'custom',path:['status'],message:'Posted bills require reviewed receipt date, expense account and journal.'});
});
export type SupplierBillDraftInput=z.infer<typeof supplierBillDraftInputSchema>;
export type SupplierBill=z.infer<typeof supplierBillSchema>;
export const supplierBillReviewSchema=z.strictObject({requestId:z.uuid(),expectedVersion:z.number().int().min(0).max(2147483647),action:z.enum(['accept','reject']),
 goodsReceivedDate:dateSchema.nullable().optional(),expenseAccountId:z.uuid().nullable().optional(),reason:z.string().trim().min(1).max(1000).optional()})
 .superRefine((input,ctx)=>{if(input.action==='accept'&&(!input.goodsReceivedDate||!input.expenseAccountId))ctx.addIssue({code:'custom',path:['goodsReceivedDate'],message:'Acceptance requires a confirmed goods-received date and account.'});});
