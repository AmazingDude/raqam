import 'server-only';
import { z } from 'zod';
import type { RequestSession } from '../auth.ts';
import type { Workspace } from '../../contracts/index.ts';
import { ledgerAccountCommandSchema,ledgerAccountSchema } from '../../contracts/ledger.ts';
import { BackendError } from '../errors.ts';
import { readLedger } from './persistence.ts';

export async function saveLedgerAccount(session:RequestSession,workspace:Workspace,body:unknown,forcedId?:string){
 const parsed=ledgerAccountCommandSchema.safeParse(forcedId?{...(typeof body==='object'&&body!==null?body:{}),id:forcedId}:body);
 if(!parsed.success)throw new BackendError('INVALID_INPUT','Provide a valid account type, reporting role, code and current version.');
 const current=await readLedger(session,workspace);
 if(parsed.data.id){const existing=current.accounts.find(item=>item.id===parsed.data.id);if(!existing)throw new BackendError('NOT_FOUND','Ledger account not found in this workspace.');}
 const raw=await session.database.rpc('save_workspace_ledger_account',{p_workspace_id:workspace.id,p_account:parsed.data});
 if(raw.error){console.error('[ledger-accounts] RPC failed',{code:/^[A-Z0-9]{5,12}$/.test(raw.error.code??'')?raw.error.code:'UNKNOWN'});
  if(raw.error.code==='P0002')throw new BackendError('NOT_FOUND','Ledger account not found in this workspace.');
  if(['PT409','23505','40001'].includes(raw.error.code??''))throw new BackendError('CONFLICT','Ledger account changed or its code is already used. Reload before retrying.');
  if(['22023','23514','22P02'].includes(raw.error.code??''))throw new BackendError('INVALID_INPUT','The account is incompatible with existing postings or role rules.');
  throw new BackendError('UNAVAILABLE','Ledger account could not be saved. Please retry.');
 }
 const envelope=z.strictObject({account:z.unknown(),duplicate:z.boolean()}).safeParse(raw.data);if(!envelope.success)throw new BackendError('UNAVAILABLE','Ledger account response could not be verified.');
 const account=ledgerAccountSchema.safeParse(envelope.data.account);if(!account.success||account.data.workspaceId!==workspace.id)throw new BackendError('UNAVAILABLE','Ledger account response could not be verified.');
 return {account:account.data,duplicate:envelope.data.duplicate};
}
