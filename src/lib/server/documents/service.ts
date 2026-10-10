import 'server-only';
import type { Workspace } from '../../contracts/index.ts';
import type { RequestSession } from '../auth.ts';
import { BackendError } from '../errors.ts';
import { createDocumentService, DOCUMENT_COLUMNS } from './mapping.ts';

export function scopedDocumentService(session: RequestSession, workspace: Workspace, signal?: AbortSignal) {
  const { subject, database } = session;
  const { id: workspaceId, ownerSubject } = workspace;
  if (!subject || ownerSubject !== subject) throw new BackendError('NOT_FOUND', 'Workspace not found.');
  return createDocumentService({ workspaceId, persistence: {
    async source(id) {
      let query = database.from('sources').select('id,workspace_id,source_type,status').eq('id', id).eq('workspace_id', workspaceId);
      if (signal) query = query.abortSignal(signal);
      return query.maybeSingle();
    },
    async register(sourceId) {
      let query = database.rpc('register_supporting_document', { p_source_id: sourceId });
      if (signal) query = query.abortSignal(signal);
      return query;
    },
    async detail(id) {
      let query = database.from('supporting_documents').select(DOCUMENT_COLUMNS).eq('id', id).eq('workspace_id', workspaceId);
      if (signal) query = query.abortSignal(signal);
      return query.maybeSingle();
    },
    async list(limit, cursor) {
      let query = database.from('supporting_documents').select(DOCUMENT_COLUMNS).eq('workspace_id', workspaceId).order('id').limit(limit);
      if (cursor) query = query.gt('id', cursor);
      if (signal) query = query.abortSignal(signal);
      return query;
    },
    async review(id, requestId, expectedVersion, decision) {
      let query = database.rpc('review_supporting_document', { p_document_id: id, p_request_id: requestId,
        p_expected_version: expectedVersion, p_decision: decision });
      if (signal) query = query.abortSignal(signal);
      return query;
    },
  } });
}
