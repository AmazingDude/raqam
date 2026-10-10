import type { Invoice } from '../../src/lib/contracts/invoices.ts';
export const invoiceWorkspace='10000000-0000-4000-8000-000000000001';
export const invoiceId='20000000-0000-4000-8000-000000000001';
export function syntheticInvoice():Invoice {return {id:invoiceId,workspaceId:invoiceWorkspace,invoiceNumber:'SYNTHETIC-001',status:'draft',issueDate:'2026-10-10',dueDate:'2026-10-24',fromName:'Synthetic Studio',clientName:'Synthetic Client',currency:'PKR',subtotalMinor:'10000',discountMinor:'0',shippingMinor:'0',taxMinor:'0',totalMinor:'10000',remindersEnabled:false,viewsCount:0,reviewVersion:0,
 items:[{id:'30000000-0000-4000-8000-000000000001',invoiceId,position:0,description:'Synthetic service',quantity:1,rateMinor:'10000',amountMinor:'10000'}]};}
export function databaseInvoice(invoice=syntheticInvoice()) {
 const snake=(record:Record<string,unknown>)=>Object.fromEntries(Object.entries(record).map(([key,value])=>[key.replace(/[A-Z]/g,char=>`_${char.toLowerCase()}`),value]));
 return {...snake(invoice),items:invoice.items.map(item=>snake(item))};
}
