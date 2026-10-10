import 'server-only';
import { z } from 'zod';
import type { RequestSession } from './auth.ts';
import type { Workspace } from '../contracts/index.ts';
import { BackendError } from './errors.ts';
import { expensePostingInputSchema, expensePostingResultSchema, invoiceRecognitionInputSchema, invoiceRecognitionResultSchema, paymentLinkInputSchema, paymentListSchema, paymentOperationResultSchema } from '../contracts/payments.ts';

function databaseError(code?: string): BackendError {
  if (code === 'P0002') return new BackendError('NOT_FOUND', 'This payment or invoice was not found in your workspace.');
  if (['PT409', '23505', '40001'].includes(code ?? '')) return new BackendError('CONFLICT', 'The invoice, statement row or payment changed. Reload and review before retrying.');
  if (['22023', '23514', '22P02', '22003', '23502'].includes(code ?? '')) return new BackendError('INVALID_INPUT', 'Check the reviewed service date, account, exact full payment and current record versions.');
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code ?? '')) return new BackendError('UNAVAILABLE', 'Connected invoice and ledger storage is not ready. Apply the reviewed migration after checking hosted history.');
  return new BackendError('UNAVAILABLE', 'The accounting operation could not complete. Your existing records are preserved.');
}

async function rpc(session: RequestSession, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await session.database.rpc(name, args);
  if (result.error) {
    console.error('[payments] RPC failed', { operation: name, code: /^[A-Z0-9]{5,12}$/.test(result.error.code ?? '') ? result.error.code : 'UNKNOWN' });
    throw databaseError(result.error.code);
  }
  return result.data;
}

export async function listWorkspacePayments(session: RequestSession, workspace: Workspace) {
  const parsed = paymentListSchema.safeParse({ items: await rpc(session, 'read_workspace_payments', { p_workspace_id: workspace.id }) });
  if (!parsed.success || parsed.data.items.some(payment => payment.workspaceId !== workspace.id) || new Set(parsed.data.items.map(payment => payment.id)).size !== parsed.data.items.length) {
    throw databaseError();
  }
  return parsed.data;
}

export async function recognizeInvoice(session: RequestSession, workspace: Workspace, invoiceId: string, input: unknown) {
  const parsed = invoiceRecognitionInputSchema.safeParse(input);
  if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Confirm the service-delivery date and select a reviewed revenue account.');
  const response = invoiceRecognitionResultSchema.safeParse(await rpc(session, 'recognize_workspace_invoice', {
    p_workspace_id: workspace.id, p_request_id: parsed.data.requestId, p_invoice_id: invoiceId,
    p_expected_version: parsed.data.expectedVersion, p_service_date: parsed.data.serviceDate, p_revenue_account_id: parsed.data.revenueAccountId,
  }));
  if (!response.success || response.data.posting.workspaceId !== workspace.id || response.data.posting.invoiceId !== invoiceId || response.data.journal.workspaceId !== workspace.id) {
    throw databaseError();
  }
  return response.data;
}

export async function postExpenseAccrual(session: RequestSession, workspace: Workspace, expenseId: string, input: unknown) {
  const parsed = expensePostingInputSchema.safeParse(input);
  if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Confirm the accepted expense date and select a reviewed expense or asset account.');
  const response = expensePostingResultSchema.safeParse(await rpc(session, 'post_workspace_expense_accrual', {
    p_workspace_id: workspace.id, p_request_id: parsed.data.requestId, p_expense_id: expenseId,
    p_expected_version: parsed.data.expectedVersion, p_expense_account_id: parsed.data.expenseAccountId,
  }));
  if (!response.success || response.data.posting.workspaceId !== workspace.id || response.data.posting.expenseId !== expenseId || response.data.journal.workspaceId !== workspace.id) throw databaseError();
  return response.data;
}

export async function linkWorkspacePayment(session: RequestSession, workspace: Workspace, input: unknown) {
  const parsed = paymentLinkInputSchema.safeParse(input);
  if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Choose one complete imported payment, its matching issued invoice or approved bill, and an active cash account.');
  const response = paymentOperationResultSchema.safeParse(await rpc(session, 'link_workspace_payment', {
    p_workspace_id: workspace.id, p_request_id: parsed.data.requestId, p_target_kind: parsed.data.targetKind,
    p_target_id: parsed.data.targetId, p_expected_version: parsed.data.expectedVersion,
    p_transaction_id: parsed.data.transactionId, p_expected_transaction_version: parsed.data.expectedTransactionVersion,
    p_cash_account_id: parsed.data.cashAccountId,
  }));
  if (!response.success || response.data.payment.workspaceId !== workspace.id || response.data.payment.targetId !== parsed.data.targetId ||
      response.data.payment.transactionId !== parsed.data.transactionId || response.data.journal.workspaceId !== workspace.id) throw databaseError();
  return response.data;
}
