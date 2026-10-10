import { z } from 'zod';
import { request, ClientError } from './api.ts';
import { invoiceLineAmount } from '../invoice-money.ts';
import { expenseDraftInputSchema, expenseDraftSchema, expenseDraftReviewSchema, supplierBillDraftInputSchema, supplierBillSchema, supplierBillReviewSchema } from '../contracts/bookkeeping.ts';
import { ledgerAccountSchema, ledgerAccountCommandSchema, ledgerJournalSchema, ledgerHistoryCoverageSchema, ledgerHistoryRangeInputSchema,
  ledgerReportRequestSchema, ledgerTrialBalanceSchema, ledgerIncomeStatementSchema, ledgerBalanceSheetSchema, ledgerCashFlowStatementSchema,
  type LedgerReportRequest } from '../contracts/ledger.ts';

export const ledgerSnapshotSchema = z.strictObject({accounts:z.array(ledgerAccountSchema).max(1000),journals:z.array(ledgerJournalSchema).max(10000),coverage:ledgerHistoryCoverageSchema});
export type LedgerSnapshot=z.infer<typeof ledgerSnapshotSchema>;
export type LedgerReport=z.infer<typeof ledgerTrialBalanceSchema>|z.infer<typeof ledgerIncomeStatementSchema>|z.infer<typeof ledgerBalanceSheetSchema>|z.infer<typeof ledgerCashFlowStatementSchema>;
function owner(workspaceId:string,records:{workspaceId:string}[]) {
 if(records.some(item=>item.workspaceId!==workspaceId))throw new ClientError('UNAVAILABLE','The returned records do not belong to this workspace. Reload.');
}
function unique(records:{id:string|null}[]){if(new Set(records.map(item=>item.id)).size!==records.length||records.some(item=>item.id===null))throw new ClientError('UNAVAILABLE','The returned records could not be verified. Reload.');}
const mutation=(body:unknown,method='POST'):RequestInit=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const bookkeepingApi={
 async proposeExpense(workspaceId:string,note:string,signal:AbortSignal){
  const result=await request('/api/expense-drafts/ai-propose',z.strictObject({workspaceId:z.uuid(),fields:z.strictObject({description:z.string().max(500).nullable(),counterparty:z.string().max(200).nullable(),occurredOn:z.iso.date().nullable(),amountMinor:z.string().regex(/^(0|[1-9]\d*)$/).nullable(),currency:z.literal('PKR').nullable()}),evidenceText:z.string(),provider:z.enum(['gemini','groq','openai','claude'])}),signal,mutation({note}));
  if(result.evidenceText!==note)throw new ClientError('UNAVAILABLE','The suggestion evidence does not match this note. Keep the original and retry.');
  if(result.workspaceId!==workspaceId)throw new ClientError('UNAVAILABLE','The suggestion belongs to another workspace. Keep your note and reload.');
  return result;
 },
 async ledger(workspaceId:string,signal:AbortSignal){
  const result=await request('/api/ledger',ledgerSnapshotSchema,signal);
  owner(workspaceId,[...result.accounts,...result.journals,result.coverage]);unique(result.accounts);unique(result.journals);
  const ids=new Set(result.accounts.map(item=>item.id));
  if(result.journals.some(j=>j.lines.some(line=>!ids.has(line.accountId))))throw new ClientError('UNAVAILABLE','Journal accounts could not be verified. Reload.');
  return result;
 },
 async expenses(workspaceId:string,signal:AbortSignal){
  const result=await request('/api/expense-drafts',z.strictObject({items:z.array(expenseDraftSchema).max(2000)}),signal);
  owner(workspaceId,result.items);unique(result.items);return result.items;
 },
 async saveExpense(workspaceId:string,input:z.infer<typeof expenseDraftInputSchema>,signal:AbortSignal){
  const command=expenseDraftInputSchema.parse(input);
  const result=await request('/api/expense-drafts',z.strictObject({draft:expenseDraftSchema,duplicate:z.boolean()}),signal,mutation(command));
  owner(workspaceId,[result.draft]);if(!result.draft.id||(command.id&&result.draft.id!==command.id))throw new ClientError('UNAVAILABLE','Expense save could not be verified. Reload drafts before retrying.');return result;
 },
 async reviewExpense(workspaceId:string,id:string,input:z.infer<typeof expenseDraftReviewSchema>,signal:AbortSignal){
  z.uuid().parse(id);const command=expenseDraftReviewSchema.parse(input);
  const result=await request(`/api/expense-drafts/${encodeURIComponent(id)}`,z.strictObject({draft:expenseDraftSchema,duplicate:z.boolean()}),signal,mutation(command,'PATCH'));
  owner(workspaceId,[result.draft]);if(result.draft.id!==id||result.draft.status!==(command.action==='accept'?'accepted':'rejected'))throw new ClientError('UNAVAILABLE','Expense review could not be verified. Reload.');return result;
 },
 async bills(workspaceId:string,signal:AbortSignal){
  const result=await request('/api/supplier-bills',z.strictObject({items:z.array(supplierBillSchema).max(2000)}),signal);
  owner(workspaceId,result.items);unique(result.items);
  if(result.items.some(bill=>bill.lines.some(line=>invoiceLineAmount(line.quantity,line.rateMinor)!==line.amountMinor)))throw new ClientError('UNAVAILABLE','Saved bill line arithmetic could not be verified. Reload.');return result.items;
 },
 async saveBill(workspaceId:string,input:z.infer<typeof supplierBillDraftInputSchema>,signal:AbortSignal){
  const command=supplierBillDraftInputSchema.parse(input);
  const result=await request('/api/supplier-bills',z.strictObject({bill:supplierBillSchema,duplicate:z.boolean()}),signal,mutation(command));
  owner(workspaceId,[result.bill]);if(!result.bill.id||(command.id&&command.id!==result.bill.id)||result.bill.lines.some(line=>invoiceLineAmount(line.quantity,line.rateMinor)!==line.amountMinor))throw new ClientError('UNAVAILABLE','Bill save could not be verified. Reload before retrying.');return result;
 },
 async reviewBill(workspaceId:string,id:string,input:z.infer<typeof supplierBillReviewSchema>,signal:AbortSignal){
  z.uuid().parse(id);const command=supplierBillReviewSchema.parse(input);
  const result=await request(`/api/supplier-bills/${encodeURIComponent(id)}`,z.strictObject({bill:supplierBillSchema,journal:ledgerJournalSchema.optional(),duplicate:z.boolean()}),signal,mutation(command,'PATCH'));
  owner(workspaceId,[result.bill,...(result.journal?[result.journal]:[])]);
  if(result.bill.id!==id||result.bill.status!==(command.action==='accept'?'posted':'rejected')||result.bill.lines.some(line=>invoiceLineAmount(line.quantity,line.rateMinor)!==line.amountMinor)||result.journal&&(result.bill.journalId!==result.journal.id||!result.journal.sources.some(source=>source.kind==='supplier_bill'&&source.billId===id)))throw new ClientError('UNAVAILABLE','Bill posting could not be verified. Reload before retrying.');return result;
 },
 async saveAccount(workspaceId:string,input:z.infer<typeof ledgerAccountCommandSchema>,signal:AbortSignal){
  const command=ledgerAccountCommandSchema.parse(input);
  const result=await request('/api/ledger/accounts',z.strictObject({account:ledgerAccountSchema,duplicate:z.boolean()}),signal,mutation(command));
  owner(workspaceId,[result.account]);if(command.id&&result.account.id!==command.id)throw new ClientError('UNAVAILABLE','Account save could not be verified. Reload.');return result;
 },
 async historyRange(workspaceId:string,input:z.infer<typeof ledgerHistoryRangeInputSchema>,signal:AbortSignal){
  const command=ledgerHistoryRangeInputSchema.parse(input);const result=await request('/api/ledger',ledgerHistoryCoverageSchema,signal,mutation(command,'PUT'));
  owner(workspaceId,[result]);if(result.selectedFrom!==command.selectedFrom||result.selectedThrough!==command.selectedThrough)throw new ClientError('UNAVAILABLE','History range could not be verified. Reload.');return result;
 },
 async report(workspaceId:string,input:LedgerReportRequest,signal:AbortSignal):Promise<LedgerReport>{
  const command=ledgerReportRequestSchema.parse(input);const params=new URLSearchParams(command);
  const schemas={trial_balance:ledgerTrialBalanceSchema,income_statement:ledgerIncomeStatementSchema,balance_sheet:ledgerBalanceSheetSchema,cash_flow:ledgerCashFlowStatementSchema};
  const result=await request<LedgerReport>(`/api/ledger/reports?${params}`,schemas[command.kind] as z.ZodType<LedgerReport>,signal);
  owner(workspaceId,[result,result.coverage]);
  if('asOf'in command?(!('asOf'in result)||result.asOf!==command.asOf):(!('from'in result)||result.from!==command.from||result.to!==command.to))
   throw new ClientError('UNAVAILABLE','The report period does not match your request. Retry.');return result;
 }
};
