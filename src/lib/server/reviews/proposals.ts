import 'server-only';
import { z } from 'zod';
import type { RequestSession } from '../auth.ts';
import type { Workspace } from '../../contracts/index.ts';
import { proposalReviewSchema, proposalReviewResultSchema, proposalReviewHistoryItemSchema } from '../../contracts/proposals.ts';
import { BackendError } from '../errors.ts';

export async function reviewProposal(session: RequestSession, workspace: Workspace, body: unknown) {
  const input = proposalReviewSchema.safeParse(body);
  if (!input.success) throw new BackendError('INVALID_INPUT', 'Provide an explicit proposal decision, request ID and current versions.');
  const { requestId, proposalId, expectedVersion, ...decision } = input.data;
  const result = await session.database.rpc('review_ai_proposal', {
    p_proposal_id: proposalId, p_request_id: requestId, p_expected_version: expectedVersion, p_decision: decision,
  });
  if (result.error) {
    const code = result.error.code;
    if (code === 'P0002') throw new BackendError('NOT_FOUND', 'Proposal or reviewed record not found.');
    if (['PT409', '23505', '40001'].includes(code)) throw new BackendError('CONFLICT', 'The proposal, source records or allocation changed. Reload before reviewing.');
    if (['22023', '23514', '22P02', '22003'].includes(code)) throw new BackendError('INVALID_INPUT', 'Provide a valid compatible category or match decision.');
    throw new BackendError('UNAVAILABLE', 'Proposal review is unavailable. Please retry.');
  }
  const parsed = proposalReviewResultSchema.safeParse(result.data);
  if (!parsed.success) throw new BackendError('UNAVAILABLE', 'Proposal review result could not be verified.');
  if (parsed.data.proposal.workspaceId !== workspace.id) throw new BackendError('NOT_FOUND', 'Proposal not found.');
  return parsed.data;
}

export async function readProposalReviews(session: RequestSession, workspace: Workspace, request: Request) {
  const input = z.strictObject({
    proposalId: z.uuid(), limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.coerce.number().int().min(0).max(2147483647).default(0),
  }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) throw new BackendError('INVALID_INPUT', 'Provide proposalId and a bounded limit/version cursor.');
  const { proposalId, limit, cursor } = input.data;
  const proposal = await session.database.from('ai_proposals').select('id').eq('workspace_id', workspace.id).eq('id', proposalId).maybeSingle();
  if (proposal.error) throw new BackendError('UNAVAILABLE', 'Proposal history is unavailable.');
  if (!proposal.data) throw new BackendError('NOT_FOUND', 'Proposal not found.');
  const result = await session.database.from('proposal_reviews')
    .select('id,workspace_id,proposal_id,actor_subject,decision,previous_value,current_value,version,created_at')
    .eq('workspace_id', workspace.id).eq('proposal_id', proposalId).gt('version', cursor).order('version').limit(limit + 1);
  if (result.error || !Array.isArray(result.data)) throw new BackendError('UNAVAILABLE', 'Proposal history is unavailable.');
  const items = result.data.slice(0, limit).map(row => proposalReviewHistoryItemSchema.parse({
    id: row.id, workspaceId: row.workspace_id, targetId: row.proposal_id, actorSubject: row.actor_subject,
    decision: row.decision, previous: row.previous_value, current: row.current_value, reviewVersion: row.version, createdAt: row.created_at,
  }));
  if (items.some(item => item.workspaceId !== workspace.id || item.targetId !== proposalId ||
      item.previous.workspaceId !== workspace.id || item.current.workspaceId !== workspace.id ||
      item.previous.id !== proposalId || item.current.id !== proposalId)) {
    throw new BackendError('UNAVAILABLE', 'Proposal history scope could not be verified.');
  }
  return { items, nextCursor: result.data.length > limit ? String(items.at(-1)!.reviewVersion) : null };
}
