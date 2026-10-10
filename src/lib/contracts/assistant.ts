import { z } from 'zod';
import { CATEGORIES } from './index.ts';
import { MAX_WORKSPACE_TRANSACTIONS } from './limits.ts';
import { dateSchema, minorUnitsSchema, sourceReferenceSchema, transactionSchema } from './schemas.ts';
import { documentRecordSchema } from './documents.ts';

export const assistantToolNames = [
  'list_transactions', 'get_cash_summary', 'get_review_queue', 'get_record_evidence',
] as const;
export const assistantRequestSchema = z.strictObject({ question: z.string().trim().min(1).max(1000) });
export const assistantCitationSchema = z.strictObject({
  kind: z.enum(['transaction', 'document']), id: z.string().min(1), source: sourceReferenceSchema,
});
export const assistantResponseSchema = z.strictObject({
  workspaceId: z.string().min(1), question: z.string().min(1).max(1000), text: z.string().max(12000),
  records: z.array(transactionSchema).max(50), citations: z.array(assistantCitationSchema).max(200),
  actionTrail: z.array(z.strictObject({
    tool: z.enum(assistantToolNames),
    recordsConsulted: z.number().int().nonnegative(), partial: z.boolean(),
  })).max(4), partial: z.boolean(),
});

export const assistantSnapshotSchema = z.strictObject({
  workspaceId: z.string().min(1),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  sources: z.array(z.enum(['cashbook', 'documents', 'history'])).min(1).max(3),
});
const countSchema = z.number().int().nonnegative().max(MAX_WORKSPACE_TRANSACTIONS);
const completenessFields = {
  returnedCount: countSchema,
  totalCount: countSchema,
  complete: z.boolean(),
  nextCursor: z.string().min(1).max(200).nullable(),
  snapshot: assistantSnapshotSchema,
};

const cashBucketSchema = z.strictObject({
  inflowMinor: minorUnitsSchema, outflowMinor: minorUnitsSchema,
  netMovementMinor: z.string().regex(/^-?(0|[1-9]\d*)$/),
});
export const assistantCashSummarySchema = z.strictObject({
  inflowMinor: minorUnitsSchema, outflowMinor: minorUnitsSchema,
  netMovementMinor: z.string().regex(/^-?(0|[1-9]\d*)$/),
  currency: z.literal('PKR'),
  transactionCount: countSchema,
  transactionIds: z.array(z.string().min(1)).max(MAX_WORKSPACE_TRANSACTIONS),
  unresolvedImportRowCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  categories: z.partialRecord(z.enum(CATEGORIES), cashBucketSchema),
  unreviewed: cashBucketSchema,
}).refine(summary => summary.transactionCount === summary.transactionIds.length &&
  new Set(summary.transactionIds).size === summary.transactionCount, 'Cash summary scope must list each contributing record once');

export const supportingDocumentToolSchema = documentRecordSchema.shape.document;
export const assistantHistorySchema = z.strictObject({
  items: z.array(z.strictObject({
    kind: z.enum(['transaction', 'document']), id: z.string().min(1), partial: z.boolean(),
    decisions: z.array(z.strictObject({ version: z.number().int().positive(), created_at: z.string() })).max(20),
  })).max(20),
  partial: z.boolean(),
});

export const listTransactionsResultSchema = z.strictObject({
  ...completenessFields,
  items: z.array(transactionSchema).max(50),
}).refine(result => result.returnedCount === result.items.length && result.returnedCount <= result.totalCount &&
  (!result.complete || result.nextCursor === null), 'A complete list page covers the full filter set and has no further cursor');
export const cashSummaryResultSchema = z.strictObject({
  ...completenessFields,
  complete: z.literal(true),
  nextCursor: z.null(),
  summary: assistantCashSummarySchema,
  dateFrom: dateSchema.nullable(),
  dateTo: dateSchema.nullable(),
  unresolvedImportRowScope: z.literal('workspace'),
}).refine(result => result.returnedCount === result.totalCount && result.returnedCount === result.summary.transactionCount,
  'Cash summary completeness covers every matching imported record, never a list page');
export const reviewQueueResultSchema = z.strictObject({
  ...completenessFields,
  kind: z.enum(['unreviewed_categories', 'unmatched_records', 'unresolved_document_fields']),
  items: z.array(transactionSchema).max(50),
  documents: z.array(supportingDocumentToolSchema).max(50),
});
export const recordEvidenceResultSchema = z.strictObject({
  ...completenessFields,
  nextCursor: z.null(),
  transactions: z.array(transactionSchema).max(20),
  documents: z.array(supportingDocumentToolSchema).max(20),
  history: assistantHistorySchema,
}).refine(result => result.returnedCount === result.transactions.length + result.documents.length,
  'Evidence returnedCount is the number of accessible records actually returned');

export const assistantToolResultSchemas = {
  list_transactions: listTransactionsResultSchema,
  get_cash_summary: cashSummaryResultSchema,
  get_review_queue: reviewQueueResultSchema,
  get_record_evidence: recordEvidenceResultSchema,
} as const;

export type AssistantResponse = z.infer<typeof assistantResponseSchema>;
export type AssistantSnapshot = z.infer<typeof assistantSnapshotSchema>;
export type ListTransactionsResult = z.infer<typeof listTransactionsResultSchema>;
export type CashSummaryResult = z.infer<typeof cashSummaryResultSchema>;
export type ReviewQueueResult = z.infer<typeof reviewQueueResultSchema>;
export type RecordEvidenceResult = z.infer<typeof recordEvidenceResultSchema>;
export type AssistantToolName = typeof assistantToolNames[number];
export type AssistantToolResult = {
  list_transactions: ListTransactionsResult;
  get_cash_summary: CashSummaryResult;
  get_review_queue: ReviewQueueResult;
  get_record_evidence: RecordEvidenceResult;
};
