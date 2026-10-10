import { MAX_WORKSPACE_TRANSACTIONS } from '../contracts/limits.ts';
import { z } from 'zod';
import { verifiedInvoiceSchema as invoiceSchema, invoicesListSchema, invoiceUpsertInputSchema, invoiceStatusUpdateSchema, invoiceDeleteSchema, generateInvoiceAIRequestSchema, generateInvoiceAIResponseSchema } from '../contracts/invoices.ts';
import { categorySchema, transactionSchema } from '../contracts/schemas.ts';
import { csvPreviewSchema, importRecoverySchema, importConfirmationSchema, importConfirmationResultSchema, importResolutionSchema, importResolutionResultSchema, importResolutionStateSchema } from '../contracts/imports.ts';
import { cashSummaryRangeSchema, transactionReviewSchema } from '../contracts/cashbook.ts';
import type { ImportConfirmation } from '../contracts/imports.ts';
import type { CashSummaryRange, TransactionReview } from '../contracts/cashbook.ts';
import { assistantRequestSchema, assistantResponseSchema } from '../contracts/assistant.ts';
import {
  documentExtractionRequestSchema, documentMutationResultSchema, documentRecordSchema, documentRegistrationResultSchema,
  receiptExtractionResponseSchema, documentReviewSchema, documentHistoryItemSchema,
} from '../contracts/documents.ts';
import {
  categoryGenerationRequestSchema, matchGenerationRequestSchema, matchGenerationResultSchema,
  proposalBatchResultSchema, proposalRecordSchema, proposalReviewHistoryItemSchema, proposalReviewSchema, proposalReviewResultSchema,
} from '../contracts/proposals.ts';

export class ClientError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
const workspaceSchema = z.object({ id: z.string(), ownerSubject: z.string(), businessName: z.string(), currency: z.literal('PKR') });
const transactionsSchema = z.object({ items: z.array(transactionSchema), nextCursor: z.string().nullable() });
const sourceSchema = z.object({ sourceId: z.string(), duplicate: z.boolean() });
const sourceLinkSchema = z.object({ sourceId: z.string(), signedUrl: z.url(), expiresInSeconds: z.number().positive() });
export const importBatchSchema = z.object({
  importId: z.uuid(), preview: csvPreviewSchema, status: z.enum(['pending', 'confirmed']),
  confirmation: importConfirmationResultSchema.omit({ duplicate: true }).nullable(),
  recovery: importRecoverySchema.optional(),
}).refine(batch => {
  if ((batch.status === 'confirmed') !== (batch.confirmation !== null) ||
    (batch.confirmation && batch.confirmation.importId !== batch.importId)) return false;
  if (!batch.recovery) return true;
  const original = new Map(batch.preview.rows.map(row => [row.rowNumber, row]));
  const recovered = new Map(batch.recovery.preview.rows.map(row => [row.rowNumber, row]));
  return batch.recovery.preview.contentHash === batch.preview.contentHash &&
    batch.recovery.preview.rows.every(row => original.has(row.rowNumber)) && batch.recovery.decisions.every(decision => {
      const prior = original.get(decision.rowNumber);
      return !!prior && (decision.action === 'reject' ? prior.transaction === null :
        JSON.stringify(decision.transaction) === JSON.stringify(recovered.get(decision.rowNumber)?.transaction));
    });
}, 'Import receipt or recovery does not match the batch');
export type ImportBatch = z.infer<typeof importBatchSchema>;
const transactionDetailSchema = z.object({ transaction: transactionSchema, reviewVersion: z.number().int().nonnegative() });
const documentPageSchema = z.strictObject({ items: z.array(documentRecordSchema).max(50), nextCursor: z.uuid().nullable() });
const proposalPageSchema = z.strictObject({ items: z.array(proposalRecordSchema).max(50), nextCursor: z.uuid().nullable() });
const reviewHistorySchema = z.object({ items: z.array(z.object({
  id: z.string(), workspaceId: z.string(), targetId: z.string(), actorSubject: z.string(),
  action: z.literal('correct'), previous: z.unknown(), current: z.unknown(),
  reviewVersion: z.number().int().positive(), createdAt: z.iso.datetime({ offset: true }),
})), nextCursor: z.string().nullable() });
const proposalReviewHistorySchema = z.strictObject({ items: z.array(proposalReviewHistoryItemSchema).max(20), nextCursor: z.string().nullable() });
const signedMinor = z.string().regex(/^-?(0|[1-9][0-9]*)$/);
const positiveMinor = z.string().regex(/^(0|[1-9][0-9]*)$/);
const bucketSchema = z.object({ inflowMinor: positiveMinor, outflowMinor: positiveMinor, netMovementMinor: signedMinor });
export const cashSummarySchema = bucketSchema.extend({
  currency: z.literal('PKR'), transactionCount: z.number().int().min(0).max(MAX_WORKSPACE_TRANSACTIONS), transactionIds: z.array(z.string()).max(MAX_WORKSPACE_TRANSACTIONS),
  unresolvedImportRowCount: z.number().int().nonnegative(),
  categoryCoverage: z.strictObject({ acceptedCount: z.number().int().nonnegative().max(MAX_WORKSPACE_TRANSACTIONS), notAcceptedCount: z.number().int().nonnegative().max(MAX_WORKSPACE_TRANSACTIONS) }),
  matchCoverage: z.strictObject({ matchedCount: z.number().int().nonnegative().max(MAX_WORKSPACE_TRANSACTIONS), notMatchedCount: z.number().int().nonnegative().max(MAX_WORKSPACE_TRANSACTIONS) }),
  categories: z.partialRecord(categorySchema, bucketSchema), unreviewed: bucketSchema,
}).refine(summary => {
  const buckets = [...Object.values(summary.categories), summary.unreviewed];
  // Zod can continue object refinements after a string-format failure. Check
  // those formats before BigInt so malformed responses fail validation cleanly.
  if (![summary, ...buckets].every(bucket => bucketSchema.safeParse(bucket).success)) return false;
  return summary.transactionCount === summary.transactionIds.length && new Set(summary.transactionIds).size === summary.transactionCount &&
    summary.categoryCoverage.acceptedCount + summary.categoryCoverage.notAcceptedCount === summary.transactionCount &&
    summary.matchCoverage.matchedCount + summary.matchCoverage.notMatchedCount === summary.transactionCount &&
    [summary, ...buckets].every(bucket => BigInt(bucket.inflowMinor) - BigInt(bucket.outflowMinor) === BigInt(bucket.netMovementMinor)) &&
    buckets.reduce((sum, bucket) => sum + BigInt(bucket.inflowMinor), 0n) === BigInt(summary.inflowMinor) &&
    buckets.reduce((sum, bucket) => sum + BigInt(bucket.outflowMinor), 0n) === BigInt(summary.outflowMinor);
}, 'Cash summary amounts and scope must agree');

export async function exportResponse(response: Response): Promise<{ csv: string; unresolved: number; transactionCount: number }> {
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = z.object({ error: z.object({ code: z.string(), message: z.string() }) }).safeParse(body);
    throw new ClientError(error.success ? error.data.error.code : 'UNAVAILABLE', error.success ? error.data.error.message : 'Export could not complete. Retry.');
  }
  const unresolved = response.headers.get('X-Raqam-Unresolved-Import-Rows');
  const transactionCount = response.headers.get('X-Raqam-Transaction-Count');
  if (!response.headers.get('Content-Type')?.toLowerCase().startsWith('text/csv') || unresolved === null || transactionCount === null ||
    !/^(0|[1-9][0-9]*)$/.test(unresolved) || !Number.isSafeInteger(Number(unresolved)) ||
    !/^(0|[1-9][0-9]*)$/.test(transactionCount) || !Number.isSafeInteger(Number(transactionCount)) || Number(transactionCount) > MAX_WORKSPACE_TRANSACTIONS) {
    throw new ClientError('UNAVAILABLE', 'The export response could not be verified. Retry.');
  }
  return { csv: await response.text(), unresolved: Number(unresolved), transactionCount: Number(transactionCount) };
}

export async function request<T>(path: string, schema: z.ZodType<T>, signal: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, signal, cache: 'no-store', credentials: 'same-origin' });
  const body: unknown = await response.json().catch(() => null);
  const envelope = z.object({ data: z.unknown(), error: z.object({ code: z.string(), message: z.string() }).nullable() }).safeParse(body);
  if (!envelope.success) throw new ClientError('UNAVAILABLE', 'The workspace returned an unreadable response. Retry in a moment.');
  if (envelope.data.error) throw new ClientError(envelope.data.error.code, envelope.data.error.message);
  if (!response.ok) throw new ClientError('UNAVAILABLE', 'This request could not be completed. Please retry.');
  const data = schema.safeParse(envelope.data.data);
  if (!data.success) throw new ClientError('UNAVAILABLE', 'The workspace returned unexpected records. Please reload.');
  return data.data;
}
export const api = {
  assistant: (question: string, signal: AbortSignal) => request('/api/assistant', assistantResponseSchema, signal, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assistantRequestSchema.parse({ question })),
  }),
  workspace: (signal: AbortSignal) => request('/api/workspace', workspaceSchema.nullable(), signal),
  createWorkspace: (businessName: string, signal: AbortSignal) => request('/api/workspace', workspaceSchema, signal, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessName }),
  }),
  transactions: (signal: AbortSignal, cursor: string | null = null) => request(`/api/transactions?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, transactionsSchema, signal),
  uploadSource: (file: File, signal: AbortSignal) => {
    const body = new FormData(); body.set('file', file);
    return request('/api/sources', sourceSchema, signal, { method: 'POST', body });
  },
  sourceLink: (id: string, signal: AbortSignal) => request(`/api/sources/${encodeURIComponent(id)}`, sourceLinkSchema, signal),
  summary: (signal: AbortSignal, range: CashSummaryRange = {}) => {
    const parsed = cashSummaryRangeSchema.safeParse(range);
    if (!parsed.success) throw new ClientError('INVALID_INPUT', 'Choose a valid, non-reversed summary date range.');
    const params = new URLSearchParams();
    if (parsed.data.dateFrom) params.set('dateFrom', parsed.data.dateFrom);
    if (parsed.data.dateTo) params.set('dateTo', parsed.data.dateTo);
    const query = params.size ? `?${params.toString()}` : '';
    return request(`/api/summary${query}`, cashSummarySchema, signal);
  },
  registerImport: (file: File, signal: AbortSignal) => {
    const body = new FormData(); body.set('file', file);
    return request('/api/imports', importBatchSchema.safeExtend({ duplicate: z.boolean() }), signal, { method: 'POST', body });
  },
  importBatch: (id: string, signal: AbortSignal) => request(`/api/imports/${encodeURIComponent(id)}`, importBatchSchema, signal),
  confirmImport: (id: string, input: ImportConfirmation, signal: AbortSignal) => request(`/api/imports/${encodeURIComponent(id)}/confirmation`, importConfirmationResultSchema, signal, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(importConfirmationSchema.parse(input)),
  }),
  importOutcomes: (id: string, signal: AbortSignal) => request(`/api/imports/${encodeURIComponent(id)}/resolutions`, importResolutionStateSchema, signal),
  resolveImport: (id: string, input: z.infer<typeof importResolutionSchema>, signal: AbortSignal) => request(`/api/imports/${encodeURIComponent(id)}/resolutions`, importResolutionResultSchema, signal, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(importResolutionSchema.parse(input)),
  }),
  transaction: (id: string, signal: AbortSignal) => request(`/api/transactions/${encodeURIComponent(id)}`, transactionDetailSchema, signal),
  reviewTransaction: (id: string, input: TransactionReview, signal: AbortSignal) => request(`/api/transactions/${encodeURIComponent(id)}`, transactionDetailSchema, signal, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(transactionReviewSchema.parse(input)),
  }),
  transactionReviews: (id: string, signal: AbortSignal, cursor: string | null = null) => request(`/api/transactions/${encodeURIComponent(id)}/reviews?limit=20&cursor=${encodeURIComponent(cursor ?? '0')}`, reviewHistorySchema, signal),
  documents: (signal: AbortSignal, cursor: string | null = null) => request(`/api/documents?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, documentPageSchema, signal),
  documentHistory: async (id: string, workspaceId: string, signal: AbortSignal, cursor: string | null = null) => {
    let previous=Number(cursor??'0');
    if(!Number.isSafeInteger(previous)||previous<0||previous>2147483647)throw new ClientError('INVALID_INPUT','Invalid document history cursor.');
    const page=await request(`/api/documents/${encodeURIComponent(id)}/history?limit=20&cursor=${encodeURIComponent(cursor??'0')}`,
      z.strictObject({items:z.array(documentHistoryItemSchema).max(20),nextCursor:z.string().nullable()}),signal);
    const ids=new Set<string>();
    for(const item of page.items){
      if(item.workspaceId!==workspaceId||item.targetId!==id||item.previous.document.workspaceId!==workspaceId||item.current.document.workspaceId!==workspaceId||item.previous.document.id!==id||item.current.document.id!==id||item.reviewVersion<=previous||ids.has(item.id))throw new ClientError('UNAVAILABLE','Document history could not be verified. Reload the document.');
      previous=item.reviewVersion;ids.add(item.id);
    }
    if(page.nextCursor!==null&&(!page.items.length||page.nextCursor!==String(previous)))throw new ClientError('UNAVAILABLE','Document history cursor could not be verified.');
    return page;
  },
  registerDocument: (sourceId: string, signal: AbortSignal) => request('/api/documents', documentRegistrationResultSchema, signal, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId }),
  }),
  extractDocument: (id: string, input: z.infer<typeof documentExtractionRequestSchema>, signal: AbortSignal) => request(`/api/documents/${encodeURIComponent(id)}/extraction`, receiptExtractionResponseSchema, signal, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(documentExtractionRequestSchema.parse(input)),
  }),
  reviewDocument: (id: string, input: z.infer<typeof documentReviewSchema>, signal: AbortSignal) => request(`/api/documents/${encodeURIComponent(id)}`, documentMutationResultSchema.extend({ currentRecord: documentRecordSchema }), signal, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(documentReviewSchema.parse(input)),
  }),
  categoryProposals: (signal: AbortSignal, status: 'all' | 'pending' = 'all', cursor: string | null = null) => request(`/api/category-proposals?limit=50&status=${status}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, proposalPageSchema, signal),
  generateCategoryProposals: (input: z.infer<typeof categoryGenerationRequestSchema>, signal: AbortSignal) => request('/api/category-proposals', proposalBatchResultSchema, signal, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(categoryGenerationRequestSchema.parse(input)),
  }),
  reviewProposal: (input: z.infer<typeof proposalReviewSchema>, signal: AbortSignal) => request('/api/reviews', proposalReviewResultSchema, signal, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proposalReviewSchema.parse(input)),
  }),
  proposalReviews: async (id: string, workspaceId: string, signal: AbortSignal, cursor: string | null = null) => {
    let previous = Number(cursor ?? '0');
    if (!Number.isSafeInteger(previous) || previous < 0 || previous > 2147483647) throw new ClientError('INVALID_INPUT', 'Invalid proposal history cursor.');
    const page = await request(`/api/reviews?proposalId=${encodeURIComponent(id)}&limit=20&cursor=${encodeURIComponent(cursor ?? '0')}`, proposalReviewHistorySchema, signal);
    const ids = new Set<string>();
    for (const item of page.items) {
      if (item.workspaceId !== workspaceId || item.targetId !== id || item.previous.workspaceId !== workspaceId || item.current.workspaceId !== workspaceId ||
          item.previous.id !== id || item.current.id !== id || item.reviewVersion <= previous || ids.has(item.id))
        throw new ClientError('UNAVAILABLE', 'Proposal history could not be verified. Reload the review queue.');
      previous = item.reviewVersion; ids.add(item.id);
    }
    if (page.nextCursor !== null && (!page.items.length || page.nextCursor !== String(previous)))
      throw new ClientError('UNAVAILABLE', 'Proposal history cursor could not be verified.');
    return page;
  },
  matchProposals: (signal: AbortSignal, status: 'all' | 'pending' = 'all', cursor: string | null = null) => request(
    `/api/match-proposals?limit=50&status=${status}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, proposalPageSchema, signal),
  generateMatchProposals: (input: z.infer<typeof matchGenerationRequestSchema>, signal: AbortSignal) => request(
    '/api/match-proposals', matchGenerationResultSchema, signal, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(matchGenerationRequestSchema.parse(input)),
    }),
  export: async (signal: AbortSignal) => exportResponse(await fetch('/api/export', { signal, cache: 'no-store', credentials: 'same-origin' })),
  invoices: (signal = new AbortController().signal) => request('/api/invoices', invoicesListSchema, signal),
  saveInvoice: (input: import('../contracts/invoices.ts').InvoiceUpsertInput, signal = new AbortController().signal) => request('/api/invoices', invoiceSchema, signal, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoiceUpsertInputSchema.parse(input)),
  }),
  updateInvoiceStatus: (id: string, status: import('../contracts/invoices.ts').InvoiceStatus, expectedVersion: number, signal = new AbortController().signal) => request(`/api/invoices/${encodeURIComponent(id)}`, invoiceSchema, signal, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoiceStatusUpdateSchema.parse({ status, expectedVersion })),
  }),
  deleteInvoice: (id: string, expectedVersion: number, signal = new AbortController().signal) => request(`/api/invoices/${encodeURIComponent(id)}`, z.strictObject({ ok: z.literal(true), deleted: z.uuid() }), signal, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoiceDeleteSchema.parse({ expectedVersion })),
  }),
  generateInvoiceWithAI: (prompt: string, currentDraft: unknown, signal = new AbortController().signal) => request('/api/invoices/ai-generate', generateInvoiceAIResponseSchema, signal, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(generateInvoiceAIRequestSchema.parse({ prompt, currentDraft })),
  }),
};
