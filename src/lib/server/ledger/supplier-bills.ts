import 'server-only';
import { z } from 'zod';
import type { RequestSession } from '../auth.ts';
import type { Workspace } from '../../contracts/index.ts';
import { supplierBillDraftInputSchema,supplierBillReviewSchema,supplierBillSchema } from '../../contracts/bookkeeping.ts';
import { ledgerJournalSchema } from '../../contracts/ledger.ts';
import { BackendError } from '../errors.ts';

function dbError(code?:string):BackendError{
 if(code==='P0002')return new BackendError('NOT_FOUND','Supplier bill not found in this workspace.');
 if(['PT409','23505','40001'].includes(code??''))return new BackendError('CONFLICT','The supplier bill changed or this request was already used. Reload and review.');
 if(['22023','23514','22P02','22003'].includes(code??''))return new BackendError('INVALID_INPUT','Check bill lines, dates, source evidence and review fields.');
 if(['42P01','42883','PGRST202','PGRST205'].includes(code??''))return new BackendError('UNAVAILABLE','Supplier bill storage is not ready. Apply the reviewed bookkeeping migration before retrying.');
 return new BackendError('UNAVAILABLE','Supplier bills are unavailable. Please retry.');
}
async function rpc(session:RequestSession,name:string,args:Record<string,unknown>){
 const result=await session.database.rpc(name,args);
 if(result.error){console.error('[supplier-bills] RPC failed',{operation:name,code:/^[A-Z0-9]{5,12}$/.test(result.error.code??'')?result.error.code:'UNKNOWN'});throw dbError(result.error.code);}
 return result.data as unknown;
}
export async function listSupplierBills(session:RequestSession,workspace:Workspace){
 const raw=await rpc(session,'read_workspace_supplier_bills',{p_workspace_id:workspace.id});
 if(!Array.isArray(raw)||raw.length>2000)throw dbError();
 const items=raw.map(value=>supplierBillSchema.parse(value));
 if(items.some(item=>item.workspaceId!==workspace.id)||new Set(items.map(item=>item.id)).size!==items.length)throw dbError();
 return {items};
}
export async function saveSupplierBill(session:RequestSession,workspace:Workspace,body:unknown){
 const parsed=supplierBillDraftInputSchema.safeParse(body);
 if(!parsed.success)throw new BackendError('INVALID_INPUT','Provide a supplier, exact lines and known dates; leave unknown dates unresolved.');
 const result=await rpc(session,'save_workspace_supplier_bill',{p_workspace_id:workspace.id,p_bill:parsed.data});
 const envelope=z.strictObject({bill:z.unknown(),duplicate:z.boolean()}).safeParse(result);if(!envelope.success)throw dbError();
 const bill=supplierBillSchema.safeParse(envelope.data.bill);if(!bill.success||bill.data.workspaceId!==workspace.id)throw dbError();
 return {bill:bill.data,duplicate:envelope.data.duplicate};
}
export async function reviewSupplierBill(session:RequestSession,workspace:Workspace,billId:string,body:unknown){
 const parsed=supplierBillReviewSchema.safeParse(body);
 if(!parsed.success)throw new BackendError('INVALID_INPUT','Confirm the goods-received date and expense/asset account, or reject the bill with a reason.');
 const {requestId,expectedVersion,...decision}=parsed.data;
 const result=await rpc(session,'review_workspace_supplier_bill',{p_workspace_id:workspace.id,p_bill_id:billId,p_request_id:requestId,p_expected_version:expectedVersion,p_decision:decision});
 const envelope=z.strictObject({bill:z.unknown(),journal:z.unknown().optional(),duplicate:z.boolean()}).safeParse(result);if(!envelope.success)throw dbError();
 const bill=supplierBillSchema.safeParse(envelope.data.bill);if(!bill.success||bill.data.workspaceId!==workspace.id)throw dbError();
 const journal=envelope.data.journal===undefined?undefined:ledgerJournalSchema.safeParse(envelope.data.journal);
 if(journal&&(!journal.success||journal.data.workspaceId!==workspace.id))throw dbError();
 return {bill:bill.data,...(journal?.success?{journal:journal.data}:{}),duplicate:envelope.data.duplicate};
}
