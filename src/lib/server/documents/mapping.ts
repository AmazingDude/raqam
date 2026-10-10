import { z } from 'zod';
import {
  documentRecordSchema, documentRegistrationSchema, documentRegistrationResultSchema,
  documentReviewSchema, documentMutationResultSchema, modelProvenanceSchema,
} from '../../contracts/documents.ts';
import { documentFieldsSchema, reviewStatusSchema } from '../../contracts/schemas.ts';
import { BackendError } from '../errors.ts';

export const DOCUMENT_COLUMNS = 'id,workspace_id,source_id,source_type,extracted_fields,corrected_fields,extraction_status,extraction_failure,provenance,review_status,review_version';
const rowSchema = z.strictObject({
  id: z.uuid(), workspace_id: z.uuid(), source_id: z.uuid(), source_type: z.literal('receipt_image'),
  extracted_fields: documentFieldsSchema, corrected_fields: documentFieldsSchema.nullable(),
  extraction_status: z.enum(['pending', 'complete', 'failed']),
  extraction_failure: z.string().nullable(), provenance: modelProvenanceSchema.nullable(),
  review_status: reviewStatusSchema, review_version: z.number().int().min(0).max(2147483647),
});
const sourceSchema = z.strictObject({ id: z.uuid(), workspace_id: z.uuid(), source_type: z.enum(['receipt_image', 'transaction_csv']), status: z.enum(['pending', 'complete', 'failed']) });
const querySchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.uuid().optional() });
type Result = { data: unknown; error: unknown };
type Persistence = {
  source: (id: string) => Promise<Result>;
  register: (sourceId: string) => Promise<Result>;
  detail: (id: string) => Promise<Result>;
  list: (limit: number, cursor?: string) => Promise<Result>;
  review: (id: string, requestId: string, expectedVersion: number, decision: { action: 'reject' } | { action: 'accept' | 'correct'; fields: z.infer<typeof documentFieldsSchema> }) => Promise<Result>;
};
const unavailable = () => new BackendError('UNAVAILABLE', 'Documents could not be verified. Please retry.');
const missing = () => new BackendError('NOT_FOUND', 'Document not found.');
function identifier(value: unknown): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw missing();
  return parsed.data.toLowerCase();
}
function checkScope(record: z.infer<typeof documentRecordSchema>, workspaceId: string, id?: string) {
  if (record.document.workspaceId !== workspaceId || (id !== undefined && record.document.id !== id)) throw unavailable();
  return record;
}
export function mapDocumentRow(raw: unknown) {
  const row = rowSchema.safeParse(raw);
  if (!row.success) throw unavailable();
  const value = row.data;
  const mapped = documentRecordSchema.safeParse({
    document: { id: value.id, workspaceId: value.workspace_id, source: { sourceId: value.source_id, rowNumber: null },
      extractedFields: value.extracted_fields, correctedFields: value.corrected_fields,
      extractionStatus: value.extraction_status, reviewStatus: value.review_status,
      modelVersion: value.provenance?.modelVersion ?? null, promptVersion: value.provenance?.promptVersion ?? null },
    reviewVersion: value.review_version, schemaVersion: value.provenance?.schemaVersion ?? null, extractionFailure: value.extraction_failure,
  });
  if (!mapped.success) throw unavailable();
  return mapped.data;
}
// The server-only factory supplies session-bound, workspace-filtered readers.
export function createDocumentService(options: { workspaceId: string; persistence: Persistence }) {
  const workspaceId = identifier(options.workspaceId);
  const { source, register, detail, list, review } = options.persistence;
  async function run(operation: () => Promise<Result>): Promise<unknown> {
    let result: Result;
    try { result = await operation(); }
    catch { throw unavailable(); }
    if (!result || typeof result !== 'object' || !('error' in result) || !('data' in result)) throw unavailable();
    if (result.error) {
      const code = typeof result.error === 'object' && result.error !== null && 'code' in result.error ? result.error.code : null;
      if (code === 'P0002') throw missing();
      if (code === '22023') throw new BackendError('INVALID_INPUT', 'Document command is invalid.');
      if (code === 'PT409') throw new BackendError('CONFLICT', 'Document changed or request was reused. Reload and retry.');
      throw unavailable();
    }
    return result.data;
  }
  return {
    async register(body: unknown) {
      const input = documentRegistrationSchema.safeParse(body);
      if (!input.success) throw new BackendError('INVALID_INPUT', 'Provide an existing receipt sourceId.');
      const sourceId = input.data.sourceId.toLowerCase();
      const rawSource = await run(() => source(sourceId));
      if (rawSource === null) throw new BackendError('NOT_FOUND', 'Receipt source not found.');
      const parsedSource = sourceSchema.safeParse(rawSource);
      if (!parsedSource.success) throw unavailable();
      if (parsedSource.data.id !== sourceId || parsedSource.data.workspace_id !== workspaceId || parsedSource.data.source_type !== 'receipt_image') {
        throw new BackendError('NOT_FOUND', 'Receipt source not found.');
      }
      if (parsedSource.data.status !== 'complete') throw new BackendError('UNAVAILABLE', 'Receipt upload is incomplete. Retry the upload.');
      const parsed = documentRegistrationResultSchema.safeParse(await run(() => register(sourceId)));
      if (!parsed.success) throw unavailable();
      checkScope(parsed.data.record, workspaceId);
      if (parsed.data.record.document.source.sourceId !== sourceId) throw unavailable();
      return parsed.data;
    },
    async detail(value: unknown) {
      const id = identifier(value);
      const raw = await run(() => detail(id));
      if (raw === null) throw missing();
      return checkScope(mapDocumentRow(raw), workspaceId, id);
    },
    async list(params: URLSearchParams) {
      const entries = [...params.entries()];
      if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new BackendError('INVALID_INPUT', 'Use each document query parameter once.');
      const input = querySchema.safeParse(Object.fromEntries(entries));
      if (!input.success) throw new BackendError('INVALID_INPUT', 'Use a limit of 1–50 and optional UUID document cursor.');
      const cursor = input.data.cursor?.toLowerCase();
      const raw = await run(() => list(input.data.limit + 1, cursor));
      if (!Array.isArray(raw) || raw.length > input.data.limit + 1) throw unavailable();
      const records = raw.map(row => checkScope(mapDocumentRow(row), workspaceId));
      let previous = cursor;
      for (const record of records) {
        if (previous !== undefined && record.document.id <= previous) throw unavailable();
        previous = record.document.id;
      }
      const items = records.slice(0, input.data.limit);
      return { items, nextCursor: records.length > input.data.limit ? items.at(-1)!.document.id : null };
    },
    async review(value: unknown, body: unknown) {
      const id = identifier(value);
      const input = documentReviewSchema.safeParse(body);
      if (!input.success) throw new BackendError('INVALID_INPUT', 'Provide a requestId, expectedVersion and explicit document review.');
      const command = input.data;
      const requestId = command.requestId.toLowerCase();
      const decision = command.action === 'reject' ? { action: command.action } : { action: command.action, fields: command.fields };
      const parsed = documentMutationResultSchema.safeParse(await run(() => review(id, requestId, command.expectedVersion, decision)));
      if (!parsed.success || parsed.data.requestId !== requestId || parsed.data.record.reviewVersion !== command.expectedVersion + 1) throw unavailable();
      checkScope(parsed.data.record, workspaceId, id);
      const expectedStatus = command.action === 'accept' ? 'accepted' : command.action === 'reject' ? 'rejected' : 'needs_review';
      if (parsed.data.record.document.reviewStatus !== expectedStatus) throw unavailable();
      if (command.action !== 'reject' && JSON.stringify(parsed.data.record.document.correctedFields) !== JSON.stringify(command.fields)) throw unavailable();
      return parsed.data;
    },
  };
}
