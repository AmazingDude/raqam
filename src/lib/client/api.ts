import { z } from 'zod';
import { categorySchema, transactionSchema } from '../contracts/schemas.ts';
import { csvPreviewSchema, importConfirmationSchema, importConfirmationResultSchema, importResolutionSchema, importResolutionResultSchema, importResolutionStateSchema } from '../contracts/imports.ts';
import { transactionReviewSchema } from '../contracts/cashbook.ts';
import type { ImportConfirmation } from '../contracts/imports.ts';
import type { TransactionReview } from '../contracts/cashbook.ts';
import { assistantRequestSchema, assistantResponseSchema } from '../contracts/assistant.ts';

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
}).refine(batch => (batch.status === 'confirmed') === (batch.confirmation !== null) &&
  (!batch.confirmation || batch.confirmation.importId === batch.importId), 'Import receipt does not match the batch');
export type ImportBatch = z.infer<typeof importBatchSchema>;
const transactionDetailSchema = z.object({ transaction: transactionSchema, reviewVersion: z.number().int().nonnegative() });
const reviewHistorySchema = z.object({ items: z.array(z.object({
  id: z.string(), workspaceId: z.string(), targetId: z.string(), actorSubject: z.string(),
  action: z.literal('correct'), previous: z.unknown(), current: z.unknown(),
  reviewVersion: z.number().int().positive(), createdAt: z.iso.datetime({ offset: true }),
})), nextCursor: z.string().nullable() });
const signedMinor = z.string().regex(/^-?(0|[1-9][0-9]*)$/);
const positiveMinor = z.string().regex(/^(0|[1-9][0-9]*)$/);
const bucketSchema = z.object({ inflowMinor: positiveMinor, outflowMinor: positiveMinor, netMovementMinor: signedMinor });
export const cashSummarySchema = bucketSchema.extend({
  currency: z.literal('PKR'), transactionCount: z.number().int().min(0).max(50), transactionIds: z.array(z.string()).max(50),
  unresolvedImportRowCount: z.number().int().nonnegative(), categories: z.partialRecord(categorySchema, bucketSchema), unreviewed: bucketSchema,
}).refine(summary => {
  const buckets = [...Object.values(summary.categories), summary.unreviewed];
  // Zod can continue object refinements after a string-format failure. Check
  // those formats before BigInt so malformed responses fail validation cleanly.
  if (![summary, ...buckets].every(bucket => bucketSchema.safeParse(bucket).success)) return false;
  return summary.transactionCount === summary.transactionIds.length && new Set(summary.transactionIds).size === summary.transactionCount &&
    [summary, ...buckets].every(bucket => BigInt(bucket.inflowMinor) - BigInt(bucket.outflowMinor) === BigInt(bucket.netMovementMinor)) &&
    buckets.reduce((sum, bucket) => sum + BigInt(bucket.inflowMinor), 0n) === BigInt(summary.inflowMinor) &&
    buckets.reduce((sum, bucket) => sum + BigInt(bucket.outflowMinor), 0n) === BigInt(summary.outflowMinor);
}, 'Cash summary amounts and scope must agree');

export async function exportResponse(response: Response): Promise<{ csv: string; unresolved: number }> {
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = z.object({ error: z.object({ code: z.string(), message: z.string() }) }).safeParse(body);
    throw new ClientError(error.success ? error.data.error.code : 'UNAVAILABLE', error.success ? error.data.error.message : 'Export could not complete. Retry.');
  }
  const unresolved = response.headers.get('X-Raqam-Unresolved-Import-Rows');
  if (!response.headers.get('Content-Type')?.toLowerCase().startsWith('text/csv') || unresolved === null || !/^(0|[1-9][0-9]*)$/.test(unresolved) || !Number.isSafeInteger(Number(unresolved))) {
    throw new ClientError('UNAVAILABLE', 'The export response could not be verified. Retry.');
  }
  return { csv: await response.text(), unresolved: Number(unresolved) };
}

async function request<T>(path: string, schema: z.ZodType<T>, signal: AbortSignal, init?: RequestInit): Promise<T> {
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
  summary: (signal: AbortSignal) => request('/api/summary', cashSummarySchema, signal),
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
  export: async (signal: AbortSignal) => exportResponse(await fetch('/api/export', { signal, cache: 'no-store', credentials: 'same-origin' })),
};
