import 'server-only';
import type { Workspace } from '../../contracts/index.ts';
import type { RequestSession } from '../auth.ts';
import { readCashbook } from '../cashbook.ts';
import { BackendError } from '../errors.ts';
import { createCashbookTools } from './cashbook-tools.ts';
import { createAssistantTools } from './full-tools.ts';
import { z } from 'zod';
import { documentFieldsSchema } from '../../contracts/schemas.ts';

// Call after requireSession/requireWorkspace. C receives only these read closures.
export function createScopedCashbookTools(
  session: RequestSession,
  workspace: Workspace,
  budget: { deadlineAt: number; signal?: AbortSignal },
) {
  if (!session.subject || workspace.ownerSubject !== session.subject) {
    throw new BackendError('NOT_FOUND', 'Workspace not found.');
  }
  return createCashbookTools({
    workspaceId: workspace.id,
    readSnapshot: () => readCashbook(session, workspace),
    deadlineAt: budget.deadlineAt,
    ...(budget.signal ? { signal: budget.signal } : {}),
  });
}

export function createScopedAssistantTools(session: RequestSession, workspace: Workspace, budget: { deadlineAt: number; signal?: AbortSignal }) {
  if (!session.subject || workspace.ownerSubject !== session.subject) throw new BackendError('NOT_FOUND', 'Workspace not found.');
  const signal = budget.signal ?? AbortSignal.timeout(Math.max(1, budget.deadlineAt - Date.now()));
  const documentRow = z.object({
    id: z.uuid(), workspace_id: z.uuid(), source_id: z.uuid(), extracted_fields: documentFieldsSchema,
    corrected_fields: documentFieldsSchema.nullable(), extraction_status: z.enum(['pending', 'complete', 'failed']),
    review_status: z.enum(['proposed', 'accepted', 'rejected', 'needs_review']),
    provenance: z.object({ modelVersion: z.string(), promptVersion: z.string() }).nullable(),
  });
  return createAssistantTools({ workspaceId: workspace.id, ...budget,
    readSnapshot: () => readCashbook(session, workspace),
    readDocuments: async () => {
      const result = await session.database.from('supporting_documents')
        .select('id,workspace_id,source_id,extracted_fields,corrected_fields,extraction_status,review_status,provenance')
        .eq('workspace_id', workspace.id).order('id').limit(201).abortSignal(signal);
      if (result.error) throw new BackendError('UNAVAILABLE', 'Supporting evidence could not load. Please retry.');
      return z.array(documentRow).max(200).parse(result.data).map(row => ({
        id: row.id, workspaceId: row.workspace_id, source: { sourceId: row.source_id, rowNumber: null },
        extractedFields: row.extracted_fields, correctedFields: row.corrected_fields,
        extractionStatus: row.extraction_status, reviewStatus: row.review_status,
        modelVersion: row.provenance?.modelVersion ?? null, promptVersion: row.provenance?.promptVersion ?? null,
      }));
    },
    readHistory: async (transactionIds, documentIds) => {
      const history = [];
      const historyRow = z.object({ version: z.number().int().positive(), created_at: z.string() });
      for (const [table, column, kind, ids] of [
        ['transaction_reviews', 'transaction_id', 'transaction', transactionIds],
        ['document_history', 'document_id', 'document', documentIds],
      ] as const) {
        for (const id of ids) {
          const result = await session.database.from(table).select('version,created_at')
            .eq('workspace_id', workspace.id).eq(column, id).order('version', { ascending: false }).limit(21).abortSignal(signal);
          if (result.error) throw new BackendError('UNAVAILABLE', 'Review history could not load. Please retry.');
          const decisions = z.array(historyRow).max(21).parse(result.data);
          history.push({ kind, id, decisions: decisions.slice(0, 20), partial: decisions.length > 20 });
        }
      }
      return { items: history, partial: history.some(item => item.partial) };
    },
  });
}
