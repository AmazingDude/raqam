import 'server-only';
import { z } from 'zod';
import type { RequestSession } from '../auth.ts';
import type { Workspace } from '../../contracts/index.ts';
import { documentRegistrationSchema, documentRegistrationResultSchema, documentRecordSchema, documentReviewSchema,
  documentMutationResultSchema, documentHistoryItemSchema } from '../../contracts/documents.ts';
import { BackendError } from '../errors.ts';

export function documentDatabaseError(error: { code?: string }) {
  if (error.code === 'P0002') return new BackendError('NOT_FOUND','Supporting document not found.');
  if (['PT409','23505','40001'].includes(error.code ?? '')) return new BackendError('CONFLICT','The document or extraction changed. Reload before retrying.');
  if (['22023','23514','22P02','22003'].includes(error.code ?? '')) return new BackendError('INVALID_INPUT','Provide valid explicit document fields and current versions.');
  return new BackendError('UNAVAILABLE','Supporting documents are unavailable. Please retry.');
}
function scope(session: RequestSession, workspace: Workspace) {
  if (workspace.ownerSubject !== session.subject) throw new BackendError('NOT_FOUND','Workspace not found.');
}
export async function registerDocument(session: RequestSession, workspace: Workspace, body: unknown) {
  scope(session,workspace); const input = documentRegistrationSchema.safeParse(body);
  if (!input.success) throw new BackendError('INVALID_INPUT','Choose an uploaded receipt image.');
  const readiness = await session.database.from('receipt_extraction_contexts').select('document_id').limit(0);
  if (readiness.error) throw documentDatabaseError(readiness.error);
  const result = await session.database.rpc('register_supporting_document',{ p_source_id: input.data.sourceId });
  if (result.error) throw documentDatabaseError(result.error);
  const parsed = documentRegistrationResultSchema.parse(result.data);
  if (parsed.record.document.workspaceId !== workspace.id) throw new BackendError('NOT_FOUND','Document not found.');
  return parsed;
}
async function contextFor(session: RequestSession, workspace: Workspace, id: string, version: number) {
  const result = await session.database.from('receipt_extraction_contexts').select('identity,outcome')
    .eq('workspace_id',workspace.id).eq('document_id',id).lte('saved_version',version).not('outcome','is',null)
    .order('saved_version',{ ascending:false }).limit(1);
  if (result.error) throw documentDatabaseError(result.error);
  const context = result.data?.[0];
  return context ? { identity:context.identity, evidence:context.outcome.evidence ?? null, failure:context.outcome.failure ?? null } : null;
}
async function recordFor(session: RequestSession, workspace: Workspace, row: Record<string,unknown>) {
  const result = documentRecordSchema.parse({ document: { id:row.id, workspaceId:row.workspace_id,
    source:{ sourceId:row.source_id,rowNumber:null }, extractedFields:row.extracted_fields, correctedFields:row.corrected_fields,
    extractionStatus:row.extraction_status,reviewStatus:row.review_status,
    modelVersion:(row.provenance as Record<string,unknown> | null)?.modelVersion ?? null,
    promptVersion:(row.provenance as Record<string,unknown> | null)?.promptVersion ?? null,
  }, reviewVersion:row.review_version, schemaVersion:(row.provenance as Record<string,unknown> | null)?.schemaVersion ?? null,
  extractionFailure:row.extraction_failure, extractionContext:await contextFor(session,workspace,String(row.id),Number(row.review_version)) });
  if (result.document.workspaceId !== workspace.id || (result.extractionContext && result.extractionContext.identity.ownerId !== workspace.ownerSubject))
    throw new BackendError('NOT_FOUND','Document not found.');
  return result;
}
export async function readDocument(session: RequestSession, workspace: Workspace, id: string) {
  scope(session,workspace);
  const result = await session.database.from('supporting_documents').select('*').eq('workspace_id',workspace.id).eq('id',id).maybeSingle();
  if (result.error) throw documentDatabaseError(result.error);
  if (!result.data) throw new BackendError('NOT_FOUND','Document not found.');
  return recordFor(session,workspace,result.data);
}
export async function listDocuments(session: RequestSession, workspace: Workspace, request: Request) {
  scope(session,workspace);
  const input = z.strictObject({ limit:z.coerce.number().int().min(1).max(50).default(20), cursor:z.uuid().optional() })
    .safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) throw new BackendError('INVALID_INPUT','Use a bounded document limit and cursor.');
  let query = session.database.from('supporting_documents').select('*').eq('workspace_id',workspace.id).order('id').limit(input.data.limit+1);
  if (input.data.cursor) query = query.gt('id',input.data.cursor);
  const result = await query; if (result.error) throw documentDatabaseError(result.error);
  const rows = result.data ?? [], page = rows.slice(0,input.data.limit);
  const items = await Promise.all(page.map(row => recordFor(session,workspace,row)));
  return { items,nextCursor:rows.length>input.data.limit ? items.at(-1)!.document.id : null };
}
export async function reviewDocument(session: RequestSession, workspace: Workspace, id: string, body: unknown) {
  scope(session,workspace); const input = documentReviewSchema.safeParse(body);
  if (!input.success) throw new BackendError('INVALID_INPUT','Provide an explicit decision, current version and required financial fields.');
  const { requestId,expectedVersion,...decision } = input.data;
  const result = await session.database.rpc('review_supporting_document',{ p_document_id:id,p_request_id:requestId,p_expected_version:expectedVersion,p_decision:decision });
  if (result.error) throw documentDatabaseError(result.error);
  const parsed = documentMutationResultSchema.parse(result.data);
  if (parsed.record.document.workspaceId !== workspace.id || parsed.record.document.id !== id) throw new BackendError('NOT_FOUND','Document not found.');
  return { ...parsed,currentRecord:await readDocument(session,workspace,id) };
}
export async function documentHistory(session: RequestSession, workspace: Workspace, id: string, request: Request) {
  await readDocument(session,workspace,id);
  const input = z.strictObject({ limit:z.coerce.number().int().min(1).max(50).default(20), cursor:z.coerce.number().int().min(0).max(2147483647).default(0) })
    .safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) throw new BackendError('INVALID_INPUT','Use a bounded history limit and version cursor.');
  const result = await session.database.from('document_history').select('*').eq('workspace_id',workspace.id).eq('document_id',id)
    .gt('version',input.data.cursor).order('version').limit(input.data.limit+1);
  if (result.error) throw documentDatabaseError(result.error);
  const rows = result.data ?? [];
  const items = rows.slice(0,input.data.limit).map(row => documentHistoryItemSchema.parse({ id:row.id,workspaceId:row.workspace_id,targetId:row.document_id,
    actorSubject:row.actor_subject,operation:row.operation,previous:row.previous_value,current:row.current_value,reviewVersion:row.version,createdAt:row.created_at }));
  if (items.some(item => item.workspaceId !== workspace.id || item.previous.document.id !== id || item.current.document.id !== id ||
    item.previous.document.workspaceId !== workspace.id || item.current.document.workspaceId !== workspace.id)) throw new BackendError('UNAVAILABLE','Document history could not be verified.');
  return { items,nextCursor:rows.length>input.data.limit ? String(items.at(-1)!.reviewVersion) : null };
}
