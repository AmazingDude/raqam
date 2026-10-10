import 'server-only';
import type { Workspace } from '../../contracts/index.ts';
import type { RequestSession } from '../auth.ts';
import { BackendError } from '../errors.ts';
import { readReceiptInput } from './receipt-input.ts';

export function readScopedReceiptInput(
  session: RequestSession,
  workspace: Workspace,
  sourceId: unknown,
  budget: { deadlineAt: number; signal?: AbortSignal },
) {
  const { subject, database } = session;
  const { id: workspaceId, ownerSubject } = workspace;
  const { deadlineAt, signal: callerSignal } = budget;
  if (!subject || ownerSubject !== subject) {
    throw new BackendError('NOT_FOUND', 'Receipt source not found.');
  }
  return readReceiptInput({
    workspaceId, sourceId, deadlineAt,
    ...(callerSignal ? { signal: callerSignal } : {}),
    async readMetadata(id, signal) {
      const query = database.from('sources')
        .select('id,workspace_id,source_type,content_hash,storage_path,status')
        .eq('id', id).eq('workspace_id', workspaceId).eq('source_type', 'receipt_image')
        .abortSignal(signal);
      const result = await query.maybeSingle();
      if (result.error) throw new BackendError('UNAVAILABLE', 'Receipt source could not be loaded. Please retry.');
      return result.data;
    },
    async download(path, signal) {
      const result = await database.storage.from('raqam-sources').download(path, {}, { signal, cache: 'no-store' });
      if (result.error || !result.data) throw new BackendError('UNAVAILABLE', 'Receipt image could not be loaded. Please retry.');
      return result.data;
    },
  });
}
