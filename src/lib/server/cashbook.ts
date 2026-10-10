import { MAX_WORKSPACE_TRANSACTIONS } from '../contracts/limits.ts';
import 'server-only';
import { z } from 'zod';
import type { RequestSession } from './auth.ts';
import type { Workspace } from '../contracts/index.ts';
import { transactionReviewSchema } from '../contracts/cashbook.ts';
import { BackendError } from './errors.ts';
import { mapCashbookRow } from './cashbook-mapping.ts';

const rowSchema = z.record(z.string(), z.unknown());
const recordSchema = z.object({ transaction: rowSchema, reviewVersion: z.number().int().min(0) });
const snapshotSchema = z.strictObject({ records: z.array(rowSchema).max(MAX_WORKSPACE_TRANSACTIONS), unresolvedImportRowCount: z.number().int().min(0) });
function databaseError(error: { code?: string }): BackendError {
  if (error.code === 'P0002') return new BackendError('NOT_FOUND', 'Transaction not found.');
  if (error.code === 'PT409' || error.code === '40001') return new BackendError('CONFLICT', 'This transaction changed. Reload it before saving your review.');
  if (['22023', '23514', '22001'].includes(error.code ?? '')) return new BackendError('INVALID_INPUT', 'Provide a valid reviewed description or category.');
  return new BackendError('UNAVAILABLE', 'Cashbook operation could not complete. Please retry.');
}
export async function readCashbook(session: RequestSession, workspace: Workspace) {
  const result = await session.database.rpc('read_cashbook_snapshot', { p_workspace_id: workspace.id });
  if (result.error) throw databaseError(result.error);
  const snapshot = snapshotSchema.parse(result.data);
  const records = snapshot.records.map(mapCashbookRow);
  if (records.some(record => record.workspaceId !== workspace.id)) throw new BackendError('UNAVAILABLE', 'Cashbook scope could not be verified.');
  return { records, unresolvedImportRowCount: snapshot.unresolvedImportRowCount };
}
export async function readTransaction(session: RequestSession, workspace: Workspace, id: string) {
  const result = await session.database.from('cashbook_records').select('*').eq('workspace_id', workspace.id).eq('id', id).maybeSingle();
  if (result.error) throw databaseError(result.error);
  if (!result.data) throw new BackendError('NOT_FOUND', 'Transaction not found.');
  const record = recordSchema.parse({ transaction: result.data, reviewVersion: result.data.review_version });
  return { transaction: mapCashbookRow(record.transaction), reviewVersion: record.reviewVersion };
}
export async function reviewTransaction(session: RequestSession, workspace: Workspace, id: string, body: unknown) {
  const input = transactionReviewSchema.safeParse(body);
  if (!input.success) throw new BackendError('INVALID_INPUT', 'Provide expectedVersion and a reviewed description or category.');
  const { expectedVersion, ...patch } = input.data;
  const result = await session.database.rpc('review_cashbook_transaction', { p_transaction_id: id, p_expected_version: expectedVersion, p_patch: patch });
  if (result.error) throw databaseError(result.error);
  const record = recordSchema.parse(result.data);
  const transaction = mapCashbookRow(record.transaction);
  if (transaction.workspaceId !== workspace.id) throw new BackendError('NOT_FOUND', 'Transaction not found.');
  return { transaction, reviewVersion: record.reviewVersion };
}

export async function readTransactionReviews(session: RequestSession, workspace: Workspace, id: string, request: Request) {
  await readTransaction(session, workspace, id);
  const params = z.strictObject({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.coerce.number().int().min(0).max(2147483647).default(0),
  }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!params.success) throw new BackendError('INVALID_INPUT', 'Use a limit of 1–50 and optional review version cursor.');
  const result = await session.database.from('transaction_reviews')
    .select('id,workspace_id,transaction_id,actor_subject,previous_value,current_value,version,created_at')
    .eq('workspace_id', workspace.id).eq('transaction_id', id).gt('version', params.data.cursor)
    .order('version').limit(params.data.limit + 1);
  if (result.error) throw databaseError(result.error);
  const rows = z.array(z.object({
    id: z.uuid(), workspace_id: z.uuid(), transaction_id: z.uuid(), actor_subject: z.string().min(1),
    previous_value: rowSchema, current_value: rowSchema, version: z.number().int().min(1), created_at: z.string(),
  })).parse(result.data);
  const items = rows.slice(0, params.data.limit).map(row => ({
    id: row.id, workspaceId: row.workspace_id, targetId: row.transaction_id, actorSubject: row.actor_subject,
    action: 'correct' as const, previous: row.previous_value, current: row.current_value, reviewVersion: row.version, createdAt: row.created_at,
  }));
  return { items, nextCursor: rows.length > params.data.limit ? String(items.at(-1)!.reviewVersion) : null };
}
