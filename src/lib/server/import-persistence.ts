import 'server-only';
import { z } from 'zod';
import type { RequestSession } from './auth.ts';
import type { Workspace } from '../contracts/index.ts';
import { csvPreviewSchema, importConfirmationResultSchema, importResolutionSchema, importResolutionResultSchema, importResolutionStateSchema } from '../contracts/imports.ts';
import { BackendError } from './errors.ts';
import { buildImportPlan, readCsvUpload } from './imports.ts';
import { uploadStored } from './storage-retry.ts';
import { recoverStatement } from './statement-rows.ts';

const registrationSchema = z.strictObject({ importId: z.uuid(), duplicate: z.boolean() });
const batchSchema = z.object({
  source_id: z.uuid(), preview: csvPreviewSchema, status: z.enum(['pending', 'confirmed']),
  confirmation_result: importConfirmationResultSchema.omit({ duplicate: true }).nullable(),
});
export function importDatabaseError(error: { code?: string }): BackendError {
  if (error.code === 'P0002') return new BackendError('NOT_FOUND', 'Import not found.');
  if (error.code === 'PT409' || error.code === '40001') return new BackendError('CONFLICT', 'This row was already reviewed or the request ID was reused. Reload the import before deciding again.');
  if (error.code === 'P0001') return new BackendError('CONFLICT', 'This import exceeds the workspace limit of 50,000 transactions. Review or reject rows before confirming.');
  if (['22023', '22007', '22008', '22003', '23514', '23505'].includes(error.code ?? '')) return new BackendError('INVALID_INPUT', 'Import rows are invalid or changed. Reload the preview.');
  return new BackendError('UNAVAILABLE', 'Import could not complete. Existing records are unchanged; retry.');
}

export async function getImport(session: RequestSession, workspace: Workspace, importId: string) {
  const result = await session.database.from('imports').select('source_id,preview,status,confirmation_result').eq('workspace_id', workspace.id).eq('source_id', importId).maybeSingle();
  if (result.error) throw importDatabaseError(result.error);
  if (!result.data) throw new BackendError('NOT_FOUND', 'Import not found.');
  const batch = batchSchema.parse(result.data);
  return { importId: batch.source_id, preview: batch.preview, status: batch.status, confirmation: batch.confirmation_result,
    recovery: recoverStatement(batch.preview) };
}

export async function registerImport(session: RequestSession, workspace: Workspace, request: Request) {
  const upload = await readCsvUpload(request);
  const path = `${workspace.id}/${upload.preview.contentHash}.csv`;
  const contentType = upload.extension === 'csv' ? 'text/csv' : upload.extension === 'tsv' ? 'text/tab-separated-values'
    : upload.extension === 'xls' ? 'application/vnd.ms-excel' : upload.extension === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';
  const stored = await session.database.storage.from('raqam-sources').upload(path, upload.bytes, { contentType, upsert: false });
  if (!await uploadStored(stored.error, () => session.database.storage.from('raqam-sources').info(path))) throw new BackendError('UNAVAILABLE', 'Original transaction file could not be stored. Retry the upload.');
  const result = await session.database.rpc('register_csv_import', {
    p_workspace_id: workspace.id, p_hash: upload.preview.contentHash, p_name: upload.originalName, p_preview: upload.preview,
  });
  if (result.error) throw importDatabaseError(result.error);
  const registration = registrationSchema.parse(result.data);
  return { ...await getImport(session, workspace, registration.importId), duplicate: registration.duplicate };
}

export async function confirmImport(session: RequestSession, workspace: Workspace, importId: string, body: unknown) {
  const batch = await getImport(session, workspace, importId);
  // Retry after a completed request returns the original receipt; never reapplies new corrections.
  if (batch.confirmation) return { ...batch.confirmation, duplicate: true };
  const plan = buildImportPlan(batch.preview, body);
  const result = await session.database.rpc('confirm_csv_import', { p_import_id: importId, p_rows: plan });
  if (result.error) throw importDatabaseError(result.error);
  return importConfirmationResultSchema.parse(result.data);
}

export async function readImportResolutions(session: RequestSession, workspace: Workspace, importId: string) {
  const batch = await getImport(session, workspace, importId);
  if (batch.status !== 'confirmed') throw new BackendError('CONFLICT', 'Confirm the import preview before resolving remaining rows.');
  const result = await session.database.rpc('read_import_resolution_state', { p_import_id: importId });
  if (result.error) throw importDatabaseError(result.error);
  if (!result.data) throw new BackendError('NOT_FOUND', 'Import not found.');
  return importResolutionStateSchema.parse(result.data);
}

export async function resolveImport(session: RequestSession, workspace: Workspace, importId: string, body: unknown) {
  const input = importResolutionSchema.safeParse(body);
  if (!input.success) throw new BackendError('INVALID_INPUT', 'Provide a requestId and 1-20,000 distinct row corrections or rejections.');
  const batch = await getImport(session, workspace, importId);
  if (batch.status !== 'confirmed') throw new BackendError('CONFLICT', 'Confirm the import preview before resolving remaining rows.');
  const result = await session.database.rpc('resolve_csv_import_rows', {
    p_import_id: importId, p_request_id: input.data.requestId, p_rows: input.data.rows,
  });
  if (result.error) throw importDatabaseError(result.error);
  return importResolutionResultSchema.parse(result.data);
}
