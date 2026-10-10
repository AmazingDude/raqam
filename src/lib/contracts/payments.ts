import { z } from 'zod';
import { dateSchema, minorUnitsSchema } from './schemas.ts';
import { ledgerJournalSchema } from './ledger.ts';

export const invoiceRecognitionInputSchema = z.strictObject({
  requestId: z.uuid(),
  expectedVersion: z.number().int().min(0).max(2147483647),
  serviceDate: dateSchema,
  revenueAccountId: z.uuid(),
});
export const expensePostingInputSchema = z.strictObject({
  requestId: z.uuid(), expectedVersion: z.number().int().min(0).max(2147483647), expenseAccountId: z.uuid(),
});
export const expensePostingResultSchema = z.strictObject({
  posting: z.strictObject({workspaceId:z.uuid(),expenseId:z.uuid(),journalId:z.uuid(),incurredOn:dateSchema,reviewDecisionId:z.uuid()}),
  journal:ledgerJournalSchema,duplicate:z.boolean(),
});

export const paymentLinkInputSchema = z.strictObject({
  requestId: z.uuid(),
  targetKind: z.enum(['invoice', 'supplier_bill', 'expense_draft']),
  targetId: z.uuid(),
  expectedVersion: z.number().int().min(0).max(2147483647),
  transactionId: z.uuid(),
  expectedTransactionVersion: z.number().int().min(0).max(2147483647),
  cashAccountId: z.uuid(),
});

export const workspacePaymentSchema = z.strictObject({
  id: z.uuid(), workspaceId: z.uuid(), requestId: z.uuid(), targetKind: z.enum(['invoice', 'supplier_bill', 'expense_draft']), targetId: z.uuid(),
  transactionId: z.uuid(), transactionVersion: z.number().int().min(0).max(2147483647), cashAccountId: z.uuid(), journalId: z.uuid(),
  date: dateSchema, amountMinor: minorUnitsSchema.refine(value => BigInt(value) > 0n), currency: z.literal('PKR'), direction: z.enum(['in', 'out']),
  createdAt: z.iso.datetime({ offset: true }),
});
export const paymentListSchema = z.strictObject({ items: z.array(workspacePaymentSchema).max(5000) });
export const paymentOperationResultSchema = z.strictObject({ payment: workspacePaymentSchema, journal: ledgerJournalSchema, duplicate: z.boolean() });
export const invoiceRecognitionResultSchema = z.strictObject({
  posting: z.strictObject({ workspaceId: z.uuid(), invoiceId: z.uuid(), journalId: z.uuid(), serviceDate: dateSchema, reviewDecisionId: z.uuid() }),
  journal: ledgerJournalSchema,
  duplicate: z.boolean(),
});
export type WorkspacePayment = z.infer<typeof workspacePaymentSchema>;
