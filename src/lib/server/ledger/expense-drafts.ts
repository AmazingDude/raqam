import 'server-only';
import { z } from 'zod';
import type { RequestSession } from '../auth.ts';
import type { Workspace } from '../../contracts/index.ts';
import { expenseDraftInputSchema, expenseDraftReviewSchema, expenseDraftSchema } from '../../contracts/bookkeeping.ts';
import { BackendError } from '../errors.ts';

function dbError(code?:string):BackendError{
 if(code==='P0002')return new BackendError('NOT_FOUND','Expense draft not found in this workspace.');
 if(['PT409','23505','40001'].includes(code??''))return new BackendError('CONFLICT','This expense draft changed or the request ID was reused. Reload before retrying.');
 if(['22023','23514','22P02','22003'].includes(code??''))return new BackendError('INVALID_INPUT','Check the expense note and leave missing or unclear fields unresolved.');
 return new BackendError('UNAVAILABLE','Expense drafts are unavailable. Please retry.');
}
async function rpc(session:RequestSession,name:string,args:Record<string,unknown>){
 const result=await session.database.rpc(name,args);
 if(result.error){console.error('[expense-drafts] RPC failed',{operation:name,code:/^[A-Z0-9]{5,12}$/.test(result.error.code??'')?result.error.code:'UNKNOWN'});throw dbError(result.error.code);}
 return result.data as unknown;
}
export async function listExpenseDrafts(session:RequestSession,workspace:Workspace){
 const raw=await rpc(session,'read_workspace_expense_drafts',{p_workspace_id:workspace.id});
 if(!Array.isArray(raw)||raw.length>2000)throw dbError();
 const items=raw.map(item=>expenseDraftSchema.parse(item));
 if(items.some(item=>item.workspaceId!==workspace.id)||new Set(items.map(item=>item.id)).size!==items.length)throw dbError();
 return {items};
}
export async function saveExpenseDraft(session:RequestSession,workspace:Workspace,body:unknown){
 const parsed=expenseDraftInputSchema.safeParse(body);
 if(!parsed.success)throw new BackendError('INVALID_INPUT','Provide the original expense note and only explicit fields; keep unknown values blank.');
 const raw=await rpc(session,'save_workspace_expense_draft',{p_workspace_id:workspace.id,p_draft:parsed.data});
 const response=z.strictObject({draft:z.unknown(),duplicate:z.boolean()}).safeParse(raw);
 if(!response.success)throw dbError();
 const draft=expenseDraftSchema.safeParse(response.data.draft);
 if(!draft.success||draft.data.workspaceId!==workspace.id)throw dbError();
 return {draft:draft.data,duplicate:response.data.duplicate};
}
export async function reviewExpenseDraft(session:RequestSession,workspace:Workspace,id:string,body:unknown){
 const parsed=expenseDraftReviewSchema.safeParse(body);if(!parsed.success)throw new BackendError('INVALID_INPUT','Use a current draft version and explicitly accept or reject it.');
 const {requestId,expectedVersion,...decision}=parsed.data;
 const raw=await rpc(session,'review_workspace_expense_draft',{p_workspace_id:workspace.id,p_draft_id:id,p_request_id:requestId,p_expected_version:expectedVersion,p_decision:decision});
 const response=z.strictObject({draft:z.unknown(),duplicate:z.boolean()}).safeParse(raw);if(!response.success)throw dbError();
 const draft=expenseDraftSchema.safeParse(response.data.draft);if(!draft.success||draft.data.workspaceId!==workspace.id)throw dbError();
 return {draft:draft.data,duplicate:response.data.duplicate};
}
