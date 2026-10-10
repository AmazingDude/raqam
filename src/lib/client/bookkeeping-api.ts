import { z } from 'zod';
import { request, ClientError, api } from './api.ts';
import { invoiceLineAmount } from '../invoice-money.ts';
import { expenseDraftInputSchema, expenseDraftSchema, expenseDraftReviewSchema, supplierBillDraftInputSchema, supplierBillSchema, supplierBillReviewSchema } from '../contracts/bookkeeping.ts';
import { ledgerAccountSchema, ledgerAccountCommandSchema, ledgerJournalSchema, ledgerJournalDraftSchema, ledgerHistoryCoverageSchema, ledgerHistoryRangeInputSchema,
  ledgerReportRequestSchema, ledgerTrialBalanceSchema, ledgerIncomeStatementSchema, ledgerBalanceSheetSchema, ledgerCashFlowStatementSchema,
  type LedgerReportRequest } from '../contracts/ledger.ts';
import { expensePostingInputSchema, expensePostingResultSchema, invoiceRecognitionInputSchema, invoiceRecognitionResultSchema, paymentLinkInputSchema, paymentListSchema, paymentOperationResultSchema } from '../contracts/payments.ts';
import { invoicesListSchema } from '../contracts/invoices.ts';

export const ledgerSnapshotSchema = z.strictObject({accounts:z.array(ledgerAccountSchema).max(1000),journals:z.array(ledgerJournalSchema).max(10000),coverage:ledgerHistoryCoverageSchema});
const ledgerPostResultSchema=z.strictObject({journal:ledgerJournalSchema,duplicate:z.boolean()});
export type LedgerSnapshot=z.infer<typeof ledgerSnapshotSchema>;
export type LedgerReport=z.infer<typeof ledgerTrialBalanceSchema>|z.infer<typeof ledgerIncomeStatementSchema>|z.infer<typeof ledgerBalanceSheetSchema>|z.infer<typeof ledgerCashFlowStatementSchema>;
function owner(workspaceId:string,records:{workspaceId:string}[]) {
 if(records.some(item=>item.workspaceId!==workspaceId))throw new ClientError('UNAVAILABLE','The returned records do not belong to this workspace. Reload.');
}
function unique(records:{id:string|null}[]){if(new Set(records.map(item=>item.id)).size!==records.length||records.some(item=>item.id===null))throw new ClientError('UNAVAILABLE','The returned records could not be verified. Reload.');}
const mutation=(body:unknown,method='POST'):RequestInit=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const bookkeepingApi={
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
 async postJournal(workspaceId:string,input:z.infer<typeof ledgerJournalDraftSchema>,signal:AbortSignal){
  const command=ledgerJournalDraftSchema.parse(input);const result=await request('/api/ledger',ledgerPostResultSchema,signal,mutation(command));
  owner(workspaceId,[result.journal]);if(result.journal.id!==command.id||result.journal.status!=='posted'||result.journal.workspaceId!==workspaceId)throw new ClientError('UNAVAILABLE','The ledger posting could not be verified. Reload the books.');return result;
 },
 async report(workspaceId:string,input:LedgerReportRequest,signal:AbortSignal):Promise<LedgerReport>{
  const command=ledgerReportRequestSchema.parse(input);const params=new URLSearchParams(command);
  const schemas={trial_balance:ledgerTrialBalanceSchema,income_statement:ledgerIncomeStatementSchema,balance_sheet:ledgerBalanceSheetSchema,cash_flow:ledgerCashFlowStatementSchema};
  const result=await request<LedgerReport>(`/api/ledger/reports?${params}`,schemas[command.kind] as z.ZodType<LedgerReport>,signal);
  owner(workspaceId,[result,result.coverage]);
  if('asOf'in command?(!('asOf'in result)||result.asOf!==command.asOf):(!('from'in result)||result.from!==command.from||result.to!==command.to))
   throw new ClientError('UNAVAILABLE','The report period does not match your request. Retry.');return result;
 },
 async invoices(workspaceId:string,signal:AbortSignal){
  const result=await request('/api/invoices',invoicesListSchema,signal);owner(workspaceId,result.items);unique(result.items);return result.items;
 },
 async recognizeInvoice(workspaceId:string,invoiceId:string,input:z.infer<typeof invoiceRecognitionInputSchema>,signal:AbortSignal){
  z.uuid().parse(invoiceId);const command=invoiceRecognitionInputSchema.parse(input);
  const result=await request(`/api/invoices/${encodeURIComponent(invoiceId)}/recognition`,invoiceRecognitionResultSchema,signal,mutation(command));
  owner(workspaceId,[result.journal,result.posting]);if(result.posting.invoiceId!==invoiceId||!result.journal.sources.some(source=>source.kind==='invoice'&&source.invoiceId===invoiceId)||result.journal.recognitionEvidence?.date!==command.serviceDate)throw new ClientError('UNAVAILABLE','Invoice recognition could not be verified. Reload the invoice and ledger.');return result;
 },
 async postExpense(workspaceId:string,expenseId:string,input:z.infer<typeof expensePostingInputSchema>,signal:AbortSignal){
  z.uuid().parse(expenseId);const command=expensePostingInputSchema.parse(input);
  const result=await request(`/api/expense-drafts/${encodeURIComponent(expenseId)}/posting`,expensePostingResultSchema,signal,mutation(command));
  owner(workspaceId,[result.journal,result.posting]);if(result.posting.expenseId!==expenseId||!result.journal.sources.some(source=>source.kind==='manual_note'&&source.noteId===expenseId)||result.journal.recognitionEvidence?.basis!=='expense_incurred')throw new ClientError('UNAVAILABLE','Expense accrual could not be verified. Reload expense drafts and books.');return result;
 },
 async payments(workspaceId:string,signal:AbortSignal){
  const result=await request('/api/payments',paymentListSchema,signal);owner(workspaceId,result.items);unique(result.items);return result.items;
 },
 async cashTransaction(workspaceId:string,transactionId:string,signal:AbortSignal){
  z.uuid().parse(transactionId);const result=await api.transaction(transactionId,signal);owner(workspaceId,[result.transaction]);
  return result;
 },
 async linkPayment(workspaceId:string,input:z.infer<typeof paymentLinkInputSchema>,signal:AbortSignal){
  const command=paymentLinkInputSchema.parse(input);const result=await request('/api/payments',paymentOperationResultSchema,signal,mutation(command));
  owner(workspaceId,[result.payment,result.journal]);if(result.payment.targetId!==command.targetId||result.payment.transactionId!==command.transactionId||
    result.payment.amountMinor!==result.journal.lines.reduce((sum,line)=>sum+BigInt(line.debitMinor),0n).toString()||
    !result.journal.sources.some(source=>source.kind==='bank_transaction'&&source.transactionId===command.transactionId))
    throw new ClientError('UNAVAILABLE','The payment link could not be verified. Reload the books and cashbook.');return result;
 }
};
