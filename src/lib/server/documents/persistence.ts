import 'server-only';
import { z } from 'zod';
import type { RequestSession } from '../auth.ts';
import type { Workspace } from '../../contracts/index.ts';
import { documentRecordSchema, documentHistoryItemSchema } from '../../contracts/documents.ts';
import { receiptContextSchema } from '../../contracts/receipt-extraction.ts';
import { BackendError } from '../errors.ts';
import { scopedDocumentService } from './service.ts';

export function documentDatabaseError(error: { code?: string }) {
  if (error.code === 'P0002') return new BackendError('NOT_FOUND', 'Supporting document not found.');
  if (['PT409', '23505', '40001'].includes(error.code ?? '')) return new BackendError('CONFLICT', 'The document or extraction changed. Reload before retrying.');
  if (['22023', '23514', '22P02', '22003'].includes(error.code ?? '')) return new BackendError('INVALID_INPUT', 'Provide valid explicit document fields and current versions.');
  return new BackendError('UNAVAILABLE', 'Supporting documents are unavailable. Please retry.');
}

async function contextFor(session: RequestSession, workspace: Workspace, id: string, version: number, signal?: AbortSignal) {
  let query = session.database.from('receipt_extraction_contexts').select('identity,outcome')
    .eq('workspace_id', workspace.id).eq('document_id', id).lte('saved_version', version).not('outcome', 'is', null)
    .order('saved_version', { ascending: false }).limit(1);
  if (signal) query = query.abortSignal(signal);
  const result = await query;
  if (result.error) throw documentDatabaseError(result.error);
  const row = result.data?.[0];
  if (!row) return null;
  const context = receiptContextSchema.safeParse({ identity: row.identity, evidence: row.outcome?.evidence ?? null, failure: row.outcome?.failure ?? null });
  if (!context.success || context.data.identity.ownerId !== session.subject || context.data.identity.workspaceId !== workspace.id)
    throw new BackendError('UNAVAILABLE', 'Receipt extraction context could not be verified.');
  return context.data;
}

async function withContext(session: RequestSession, workspace: Workspace, value: unknown, signal?: AbortSignal) {
  const record = documentRecordSchema.safeParse(value);
  if (!record.success || record.data.document.workspaceId !== workspace.id)
    throw new BackendError('UNAVAILABLE', 'Supporting document could not be verified.');
  const context = await contextFor(session, workspace, record.data.document.id, record.data.reviewVersion, signal);
  return documentRecordSchema.parse({ ...record.data, extractionContext: context });
}

export async function registerDocument(session: RequestSession, workspace: Workspace, body: unknown, signal?: AbortSignal) {
  // Keep the document API unavailable until the durable evidence/cache table is installed.
  let readiness = session.database.from('receipt_extraction_contexts').select('document_id').limit(0);
  if (signal) readiness = readiness.abortSignal(signal);
  const ready = await readiness;
  if (ready.error) throw documentDatabaseError(ready.error);
  const service = scopedDocumentService(session, workspace, signal);
  const result = await service.register(body) as { record: unknown; duplicate: boolean };
  return { ...result, record: await withContext(session, workspace, result.record, signal) };
}

export async function readDocument(session: RequestSession, workspace: Workspace, id: string, signal?: AbortSignal) {
  const service = scopedDocumentService(session, workspace, signal);
  return withContext(session, workspace, await service.detail(id), signal);
}

export async function listDocuments(session: RequestSession, workspace: Workspace, request: Request) {
  const service = scopedDocumentService(session, workspace, request.signal);
  const page = await service.list(new URL(request.url).searchParams) as { items: unknown[]; nextCursor: string | null };
  return { ...page, items: await Promise.all(page.items.map(item => withContext(session, workspace, item, request.signal))) };
}

export async function reviewDocument(session: RequestSession, workspace: Workspace, id: string, body: unknown, signal?: AbortSignal) {
  const service = scopedDocumentService(session, workspace, signal);
  const result = await service.review(id, body) as { requestId: string; record: unknown; duplicate: boolean };
  return { ...result, record: await withContext(session, workspace, result.record, signal), currentRecord: await readDocument(session, workspace, id, signal) };
}

export async function documentHistory(session: RequestSession, workspace: Workspace, id: string, request: Request) {
  await readDocument(session, workspace, id, request.signal);
  const input = z.strictObject({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.coerce.number().int().min(0).max(2147483647).default(0) })
    .safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) throw new BackendError('INVALID_INPUT', 'Use a bounded history limit and version cursor.');
  let query = session.database.from('document_history').select('*').eq('workspace_id', workspace.id).eq('document_id', id)
    .gt('version', input.data.cursor).order('version').limit(input.data.limit + 1);
  if (request.signal) query = query.abortSignal(request.signal);
  const result = await query;
  if (result.error) throw documentDatabaseError(result.error);
  const rows = result.data ?? [];
  const items = rows.slice(0, input.data.limit).map(row => documentHistoryItemSchema.parse({ id: row.id, workspaceId: row.workspace_id,
    targetId: row.document_id, actorSubject: row.actor_subject, operation: row.operation, previous: row.previous_value,
    current: row.current_value, reviewVersion: row.version, createdAt: row.created_at }));
  if (items.some(item => item.workspaceId !== workspace.id || item.previous.document.id !== id || item.current.document.id !== id ||
    item.previous.document.workspaceId !== workspace.id || item.current.document.workspaceId !== workspace.id))
    throw new BackendError('UNAVAILABLE', 'Document history could not be verified.');
  return { items, nextCursor: rows.length > input.data.limit ? String(items.at(-1)!.reviewVersion) : null };
}
