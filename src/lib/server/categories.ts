import 'server-only';
import { z } from 'zod';
import type { RequestSession } from './auth.ts';
import type { Workspace } from '../contracts/index.ts';
import {
  categoryGenerationRequestSchema, categoryPersistenceSchema, proposalBatchResultSchema, proposalRecordSchema,
} from '../contracts/proposals.ts';
import { proposeCategories } from '../ai/categories.ts';
import type { CategoryBatchResult } from '../ai/categories.ts';
import { CATEGORY_GUIDE_VERSION } from '../ai/prompts/categories.ts';
import { createAIProvider } from '../ai/factory.ts';
import { BackendError } from './errors.ts';
import { readCashbook, readTransaction } from './cashbook.ts';

const rowSchema = z.object({
  id: z.uuid(), workspace_id: z.uuid(), transaction_id: z.uuid(), transaction_version: z.number().int().min(0),
  review_version: z.number().int().min(0), rationale: z.string().min(1).max(2000), status: z.enum(['proposed','needs_review','accepted','rejected']),
  provenance: z.unknown(), category: z.string(), kind: z.literal('category'),
});
const listQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(50), cursor: z.uuid().optional(), status: z.enum(['all','pending']).default('all'),
});

export function categoryPersistenceCommand(requestId: string, generated: Extract<CategoryBatchResult,{ok:true}>) {
  const proposals = generated.items.filter(item => item.status !== 'skipped').map(item => ({
    transactionId: item.transactionId, transactionVersion: item.transactionVersion,
    category: item.category, rationale: item.rationale, status: item.status,
  }));
  if (!proposals.length) return null;
  if (!generated.provenance) throw new BackendError('UNAVAILABLE', 'Category provenance could not be verified.');
  // Migration 006 stores the canonical three-field provenance object. Bind the
  // guide version into promptVersion so persisted records remain auditable
  // without a new migration or a parallel provenance field.
  const provenance = {
    modelVersion: `${generated.provenance.providerVersion}/${generated.provenance.modelVersion}`,
    promptVersion: `${generated.provenance.promptVersion}+${CATEGORY_GUIDE_VERSION}`,
    schemaVersion: generated.provenance.schemaVersion,
  };
  const parsed = categoryPersistenceSchema.safeParse({ requestId, provenance, proposals });
  if (!parsed.success) throw new BackendError('UNAVAILABLE', 'Category output could not be safely prepared for persistence.');
  return parsed.data;
}

function databaseError(code: string | undefined): BackendError {
  if (code === 'P0002') return new BackendError('NOT_FOUND', 'Transaction or category proposal not found.');
  if (['PT409','23505','40001'].includes(code ?? '')) return new BackendError('CONFLICT', 'The category snapshot changed. Reload before preparing or reviewing categories.');
  if (['22023','23514','22P02','22003'].includes(code ?? '')) return new BackendError('INVALID_INPUT', 'The category request or saved proposal could not be validated.');
  return new BackendError('UNAVAILABLE', 'Category proposals are unavailable. Please retry.');
}

function toProposal(row: unknown, workspaceId: string) {
  const parsed = rowSchema.safeParse(row);
  if (!parsed.success || parsed.data.workspace_id !== workspaceId) throw new BackendError('UNAVAILABLE', 'A category proposal could not be verified.');
  const proposal = proposalRecordSchema.safeParse({
    id: parsed.data.id, workspaceId: parsed.data.workspace_id, transactionId: parsed.data.transaction_id,
    transactionVersion: parsed.data.transaction_version, reviewVersion: parsed.data.review_version,
    rationale: parsed.data.rationale, status: parsed.data.status, provenance: parsed.data.provenance,
    suggestion: { kind: 'category', category: parsed.data.category },
  });
  if (!proposal.success) throw new BackendError('UNAVAILABLE', 'A category proposal could not be verified.');
  return proposal.data;
}

export async function listCategoryProposals(session: RequestSession, workspace: Workspace, request: Request) {
  const entries = [...new URL(request.url).searchParams.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new BackendError('INVALID_INPUT', 'Use each category list parameter once.');
  const input = listQuerySchema.safeParse(Object.fromEntries(entries));
  if (!input.success) throw new BackendError('INVALID_INPUT', 'Use a limit of 1–50, an optional UUID cursor, and status=all or pending.');
  let query = session.database.from('ai_proposals').select('id,workspace_id,transaction_id,transaction_version,review_version,rationale,status,provenance,category,kind')
    .eq('workspace_id', workspace.id).eq('kind', 'category').order('id').limit(input.data.limit + 1);
  if (input.data.cursor) query = query.gt('id', input.data.cursor);
  if (input.data.status === 'pending') query = query.in('status', ['proposed','needs_review']);
  const result = await query.abortSignal(request.signal);
  if (result.error || !Array.isArray(result.data) || result.data.length > input.data.limit + 1) throw databaseError(result.error?.code);
  const records = result.data.map(row => toProposal(row, workspace.id));
  let previous = input.data.cursor?.toLowerCase();
  for (const proposal of records) {
    if (previous && proposal.id <= previous) throw new BackendError('UNAVAILABLE', 'Category list ordering could not be verified.');
    previous = proposal.id;
  }
  const items = records.slice(0, input.data.limit);
  return { items, nextCursor: records.length > input.data.limit ? items.at(-1)!.id : null };
}

export async function generateCategoryProposals(session: RequestSession, workspace: Workspace, request: Request, body: unknown, environment?:Record<string,string|undefined>) {
  if (workspace.ownerSubject !== session.subject) throw new BackendError('NOT_FOUND', 'Workspace not found.');
  const input = categoryGenerationRequestSchema.safeParse(body);
  if (!input.success) throw new BackendError('INVALID_INPUT', 'Provide a request ID and 1–50 unique transaction IDs.');

  const cashbook = await readCashbook(session, workspace);
  const byId = new Map(cashbook.records.map(transaction => [transaction.id, transaction]));
  const selected = input.data.transactionIds.map(id => {
    const transaction = byId.get(id);
    if (!transaction) throw new BackendError('NOT_FOUND', 'One or more transactions are not available in this workspace.');
    return transaction;
  });
  const selectedIds = selected.map(transaction => transaction.id);
  const pending = await session.database.from('ai_proposals').select('transaction_id')
    .eq('workspace_id', workspace.id).eq('kind', 'category').in('status', ['proposed','needs_review'])
    .in('transaction_id', selectedIds).abortSignal(request.signal);
  if (pending.error || !Array.isArray(pending.data)) throw databaseError(pending.error?.code);
  const pendingIds = new Set(pending.data.map(row => row.transaction_id));
  const eligible = selected.filter(transaction => transaction.categoryStatus !== 'accepted' && !pendingIds.has(transaction.id));
  if (!eligible.length) return proposalBatchResultSchema.parse({ requestId: input.data.requestId, items: [], duplicate: true });

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (request.signal.aborted) controller.abort();
  else request.signal.addEventListener('abort', onAbort, { once: true });
  const deadlineAtMs = Date.now() + 50_000;
  const timer = setTimeout(() => controller.abort(), 50_000);
  try {
    const snapshots = await Promise.all(eligible.map(transaction => readTransaction(session, workspace, transaction.id, controller.signal)));
    const generated = await proposeCategories({ workspaceId: workspace.id, records: snapshots }, createAIProvider(environment?{environment:()=>environment}:{}), {
      requestId: input.data.requestId, deadlineAtMs, signal: controller.signal,
    });
    if (!generated.ok) {
      if (generated.error.reason === 'invalid_input') throw new BackendError('INVALID_INPUT', 'The selected transaction snapshots could not be prepared. Reload and retry.');
      if (generated.error.reason === 'cancelled' || generated.error.reason === 'deadline_exceeded') throw new BackendError('UNAVAILABLE', 'Category preparation timed out or was cancelled. Existing books are unchanged.');
      throw new BackendError('UNAVAILABLE', 'Category preparation is unavailable. Existing books are unchanged; retry when ready.');
    }
    const command = categoryPersistenceCommand(input.data.requestId, generated);
    if (!command) return proposalBatchResultSchema.parse({ requestId: input.data.requestId, items: [], duplicate: false });
    const saved = await session.database.rpc('register_category_proposals', {
      p_request_id: command.requestId, p_provenance: command.provenance, p_proposals: command.proposals,
    }).abortSignal(controller.signal);
    if (saved.error) throw databaseError(saved.error.code);
    const result = proposalBatchResultSchema.safeParse(saved.data);
    if (!result.success || result.data.requestId !== input.data.requestId || result.data.items.some(item =>
      item.workspaceId !== workspace.id || item.suggestion.kind !== 'category' || !selectedIds.includes(item.transactionId))) {
      throw new BackendError('UNAVAILABLE', 'Saved category proposals could not be verified.');
    }
    return result.data;
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', onAbort);
    controller.abort();
  }
}
