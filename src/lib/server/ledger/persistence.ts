import 'server-only';
import { z } from 'zod';
import type { RequestSession } from '../auth.ts';
import type { Workspace } from '../../contracts/index.ts';
import {
  ledgerAccountSchema, ledgerJournalDraftSchema, ledgerJournalSchema, ledgerHistoryCoverageSchema, ledgerHistoryRangeInputSchema, validateLedgerJournalCommand,
  type LedgerAccount, type LedgerHistoryCoverage, type LedgerJournal,
} from '../../contracts/ledger.ts';
import { BackendError } from '../errors.ts';

function unavailable(code?: string): BackendError {
  if (code === 'P0002') return new BackendError('NOT_FOUND','Ledger resource not found in this workspace.');
  if (['PT409','23505','40001'].includes(code ?? '')) return new BackendError('CONFLICT','The ledger changed or this request was already used with different data. Reload and review.');
  if (['22023','23514','22P02','22003'].includes(code ?? '')) return new BackendError('INVALID_INPUT','Check the ledger date, source evidence, accounts and exact balanced amounts.');
  if (['42P01','42883','PGRST202','PGRST205'].includes(code ?? '')) return new BackendError('UNAVAILABLE','Ledger storage is not ready. Apply the reviewed ledger migration before retrying.');
  return new BackendError('UNAVAILABLE','Ledger data could not be loaded. Please retry.');
}
async function rpc(session: RequestSession, name: string, args: Record<string,unknown>) {
  const result=await session.database.rpc(name,args);
  if(result.error){console.error('[ledger] RPC failed',{operation:name,code:/^[A-Z0-9]{5,12}$/.test(result.error.code??'')?result.error.code:'UNKNOWN'});throw unavailable(result.error.code);}
  return result.data as unknown;
}
const snapshotSchema=z.strictObject({accounts:z.array(z.unknown()).max(1000),journals:z.array(z.unknown()).max(10000),coverage:z.unknown()});
export async function readLedger(session:RequestSession,workspace:Workspace):Promise<{accounts:LedgerAccount[];journals:LedgerJournal[];coverage:LedgerHistoryCoverage}> {
 const raw=await rpc(session,'read_workspace_ledger',{p_workspace_id:workspace.id});
 const parsed=snapshotSchema.safeParse(raw); if(!parsed.success)throw unavailable();
 const accounts=parsed.data.accounts.map(item=>ledgerAccountSchema.parse(item));
 const journals=parsed.data.journals.map(item=>ledgerJournalSchema.parse(item));
 const coverage=ledgerHistoryCoverageSchema.parse(parsed.data.coverage);
 if(accounts.some(a=>a.workspaceId!==workspace.id)||journals.some(j=>j.workspaceId!==workspace.id)||coverage.workspaceId!==workspace.id)throw unavailable();
 return {accounts,journals,coverage};
}
export async function setLedgerHistoryRange(session:RequestSession,workspace:Workspace,input:unknown){
 const parsed=ledgerHistoryRangeInputSchema.safeParse(input);if(!parsed.success)throw new BackendError('INVALID_INPUT','Choose a valid inclusive history range.');
 const raw=await rpc(session,'set_workspace_ledger_history_range',{p_workspace_id:workspace.id,p_from:parsed.data.selectedFrom,p_through:parsed.data.selectedThrough});
 const coverage=ledgerHistoryCoverageSchema.safeParse(raw);if(!coverage.success||coverage.data.workspaceId!==workspace.id)throw unavailable();
 return coverage.data;
}
function sourceRecordId(source:z.infer<typeof import('../../contracts/ledger.ts').ledgerSourceSchema>):string {
 if('transactionId'in source)return source.transactionId;
 if('documentId'in source)return source.documentId;
 if('billId'in source)return source.billId;
 if('invoiceId'in source)return source.invoiceId;
 if('paymentId'in source)return source.paymentId;
 if('noteId'in source)return source.noteId;
 return source.evidenceId;
}
export async function postLedgerJournal(session:RequestSession,workspace:Workspace,input:unknown) {
 const parsed=ledgerJournalDraftSchema.safeParse(input);
 if(!parsed.success)throw new BackendError('INVALID_INPUT','Provide a complete, balanced journal with current owner-reviewed source evidence.');
 const current=await readLedger(session,workspace);
 const reversedIds=new Set(current.journals.filter(item=>item.reversalOfId!==null).map(item=>item.reversalOfId!));
 const sourceKeys=new Set(parsed.data.sources.map(source=>`${source.kind}:${sourceRecordId(source)}`));
 validateLedgerJournalCommand(parsed.data,{workspaceId:workspace.id,accounts:new Map(current.accounts.map(account=>[account.id,account])),
  currentJournals:new Map(current.journals.map(journal=>[journal.id,journal])),reversedJournalIds:reversedIds,sourceKeys,
  currentVersions:new Map(current.journals.map(journal=>[journal.id,journal.version])),
  reviewedRecognitionDecisionIds:parsed.data.recognitionEvidence?new Set([parsed.data.recognitionEvidence.reviewDecisionId]):new Set()});
 const {sources,...journal}=parsed.data;
 const result=await rpc(session,'post_workspace_ledger_journal',{p_workspace_id:workspace.id,p_journal:journal,
  p_source_ids:sources.map(source=>({kind:source.kind,id:sourceRecordId(source),locator:source.locator??null,...(source.kind==='opening_balance'?{cutoverDate:source.cutoverDate}:{})}))});
 const response=z.strictObject({journal:z.unknown(),duplicate:z.boolean()}).safeParse(result);
 if(!response.success)throw unavailable();
 const saved=ledgerJournalSchema.safeParse(response.data.journal);
 if(!saved.success||saved.data.workspaceId!==workspace.id)throw unavailable();
 return {journal:saved.data,duplicate:response.data.duplicate};
}

export async function readCashMovements(session:RequestSession,workspace:Workspace,from:string,to:string) {
 const result=await session.database.from('cashbook_records').select('id,date,direction,amount_minor,category,category_status')
  .eq('workspace_id',workspace.id).gte('date',from).lte('date',to).order('date').limit(50001);
 if(result.error)throw unavailable(result.error.code);
 if((result.data??[]).length>50000)throw new BackendError('INVALID_INPUT','Choose a shorter cash-flow period; this range exceeds the safe report limit.');
 return (result.data??[]).map(row=>{
  const category=row.category_status==='accepted'?row.category:null;
  const classification:'operating'|'financing'|null=category==='transfers_owner_movements'?'financing':category===null?null:'operating';
  return {transactionId:row.id,date:row.date,amountMinor:row.amount_minor,direction:row.direction,classification,reviewRequired:classification===null};
 });
}
