import 'server-only';
import { z } from 'zod';
import type { RequestSession } from './auth.ts';
import type { DocumentFields, Transaction, Workspace } from '../contracts/index.ts';
import { acceptedDocumentFieldsSchema } from '../contracts/documents.ts';
import { matchGenerationRequestSchema, matchGenerationResultSchema, matchPersistenceSchema,
  proposalBatchResultSchema, proposalRecordSchema } from '../contracts/proposals.ts';
import { MAX_WORKSPACE_TRANSACTIONS } from '../contracts/limits.ts';
import { BackendError } from './errors.ts';
import { readCashbook } from './cashbook.ts';
import { readDocument, documentDatabaseError } from './documents/persistence.ts';

const provenance = { modelVersion: 'deterministic-exact-match-v1', promptVersion: 'exact-match-candidate-v1', schemaVersion: 'match-snapshot-v1' };
const proposalRowSchema = z.object({
  id: z.uuid(), workspace_id: z.uuid(), transaction_id: z.uuid(), transaction_version: z.number().int().min(0),
  review_version: z.number().int().min(0), rationale: z.string().min(1).max(2000),
  status: z.enum(['proposed', 'needs_review', 'accepted', 'rejected']), provenance: z.unknown(),
  document_id: z.uuid(), document_version: z.number().int().min(0), kind: z.literal('match'),
});
const listSchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(50).default(50), cursor: z.uuid().optional(), status: z.enum(['all', 'pending']).default('all') });
const unavailable = () => new BackendError('UNAVAILABLE', 'Match proposals could not be verified. Please retry.');
const versionRow = z.object({ id: z.uuid(), review_version: z.number().int().min(0) });

async function readVersions(session: RequestSession, workspace: Workspace, ids: string[], signal: AbortSignal) {
  const versions = new Map<string, number>();
  for (let start = 0; start < ids.length; start += 250) {
    const batch = ids.slice(start, start + 250);
    const result = await session.database.from('transactions').select('id,review_version').eq('workspace_id', workspace.id).in('id', batch).abortSignal(signal);
    if (result.error || !Array.isArray(result.data)) throw databaseError(result.error ?? {});
    for (const raw of result.data) {
      const row = versionRow.safeParse(raw);
      if (!row.success || versions.has(row.data.id) || !batch.includes(row.data.id)) throw unavailable();
      versions.set(row.data.id, row.data.review_version);
    }
    if (versions.size < start + batch.length) throw unavailable();
  }
  return versions;
}

export function exactMatchCandidateSnapshot(records: readonly Transaction[], fields: DocumentFields) {
  const eligible = records.filter(record => record.direction === 'out' && record.matchStatus !== 'accepted');
  const candidates = fields.currency === 'PKR' && fields.totalMinor !== null && fields.date !== null
    ? eligible.filter(record => record.currency === fields.currency && record.amountMinor === fields.totalMinor)
      .sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(fields.date!)) - Math.abs(Date.parse(b.date) - Date.parse(fields.date!)) || a.id.localeCompare(b.id))
    : [];
  return { eligible, candidates };
}

function mapProposal(raw: unknown, workspaceId: string) {
  const row = proposalRowSchema.safeParse(raw);
  if (!row.success || row.data.workspace_id !== workspaceId) throw unavailable();
  const parsed = proposalRecordSchema.safeParse({
    id: row.data.id, workspaceId: row.data.workspace_id, transactionId: row.data.transaction_id,
    transactionVersion: row.data.transaction_version, reviewVersion: row.data.review_version,
    rationale: row.data.rationale, status: row.data.status, provenance: row.data.provenance,
    suggestion: { kind: 'match', documentId: row.data.document_id, documentVersion: row.data.document_version },
  });
  if (!parsed.success) throw unavailable();
  return parsed.data;
}

function databaseError(error: { code?: string }) {
  if (error.code === 'P0002') return new BackendError('NOT_FOUND', 'Document or transaction not found.');
  if (['PT409', '23505', '40001'].includes(error.code ?? '')) return new BackendError('CONFLICT', 'The matching snapshot changed. Reload candidates and retry.');
  if (['22023', '23514', '22P02', '22003'].includes(error.code ?? '')) return new BackendError('INVALID_INPUT', 'The match candidate set could not be validated.');
  return unavailable();
}

export async function listMatchProposals(session: RequestSession, workspace: Workspace, request: Request) {
  const entries = [...new URL(request.url).searchParams.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new BackendError('INVALID_INPUT', 'Use each match list parameter once.');
  const input = listSchema.safeParse(Object.fromEntries(entries));
  if (!input.success) throw new BackendError('INVALID_INPUT', 'Use a limit of 1–50, an optional UUID cursor, and status=all or pending.');
  let query = session.database.from('ai_proposals').select('id,workspace_id,transaction_id,transaction_version,review_version,rationale,status,provenance,document_id,document_version,kind')
    .eq('workspace_id', workspace.id).eq('kind', 'match').order('id').limit(input.data.limit + 1);
  if (input.data.cursor) query = query.gt('id', input.data.cursor);
  if (input.data.status === 'pending') query = query.in('status', ['proposed', 'needs_review']);
  if (request.signal) query = query.abortSignal(request.signal);
  const result = await query;
  if (result.error || !Array.isArray(result.data) || result.data.length > input.data.limit + 1) throw databaseError(result.error ?? {});
  const all = result.data.map(row => mapProposal(row, workspace.id));
  const items = all.slice(0, input.data.limit);
  return { items, nextCursor: all.length > input.data.limit ? items.at(-1)!.id : null };
}

export async function generateMatchProposals(session: RequestSession, workspace: Workspace, request: Request, body: unknown) {
  if (!session.subject || workspace.ownerSubject !== session.subject) throw new BackendError('NOT_FOUND', 'Workspace not found.');
  const parsed = matchGenerationRequestSchema.safeParse(body);
  if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Provide a request ID and reviewed document ID.');
  const requestId = parsed.data.requestId.toLowerCase(), documentId = parsed.data.documentId.toLowerCase();
  const document = await readDocument(session, workspace, documentId, request.signal);
  if (document.document.reviewStatus !== 'accepted') throw new BackendError('CONFLICT', 'Review the document fields before preparing match candidates.');
  const fields = acceptedDocumentFieldsSchema.safeParse(document.document.correctedFields ?? document.document.extractedFields);
  if (!fields.success) throw new BackendError('CONFLICT', 'The document needs valid reviewed date, PKR total and currency before matching.');

  // One authoritative, capped cashbook snapshot supplies the whole search pool. It
  // fails closed on overflow, so "complete" never describes a truncated page.
  const cashbook = await readCashbook(session, workspace);
  if (cashbook.records.length > MAX_WORKSPACE_TRANSACTIONS) throw new BackendError('UNAVAILABLE', 'This workspace exceeds the complete matching snapshot limit. Narrow the data before retrying.');
  const { eligible, candidates } = exactMatchCandidateSnapshot(cashbook.records, fields.data);

  const open = await session.database.from('ai_proposals').select('transaction_id,transaction_version,document_version')
    .eq('workspace_id', workspace.id).eq('kind', 'match').eq('document_id', documentId)
    .in('status', ['proposed', 'needs_review']).abortSignal(request.signal);
  if (open.error || !Array.isArray(open.data)) throw databaseError(open.error ?? {});
  const openRows = z.array(z.object({ transaction_id: z.uuid(), transaction_version: z.number().int().min(0), document_version: z.number().int().min(0) })).parse(open.data);
  const currentPendingIds = [...new Set(openRows.filter(row => row.document_version === document.reviewVersion).map(row => row.transaction_id))];
  const pendingVersions = await readVersions(session, workspace, currentPendingIds, request.signal);
  const candidateIds = new Set(candidates.map(record => record.id));
  const pendingIds = new Set(openRows.filter(row => row.document_version === document.reviewVersion && candidateIds.has(row.transaction_id) &&
    pendingVersions.get(row.transaction_id) === row.transaction_version).map(row => row.transaction_id));
  const prior = await session.database.from('proposal_batches').select('request_payload').eq('workspace_id', workspace.id)
    .eq('request_id', requestId).abortSignal(request.signal).maybeSingle();
  if (prior.error) throw databaseError(prior.error);
  if (prior.data) {
    const payload = z.object({ kind: z.enum(['category', 'match']) }).passthrough().safeParse(prior.data.request_payload);
    if (!payload.success || payload.data.kind !== 'match') throw new BackendError('CONFLICT', 'This request ID was already used for a different proposal operation. Use a new request ID.');
    const alreadyPendingCount = pendingIds.size;
    const omittedCount = candidates.length - alreadyPendingCount;
    return matchGenerationResultSchema.parse({ requestId, items: [], duplicate: true, snapshot: {
      documentId, documentVersion: document.reviewVersion, transactionCount: cashbook.records.length,
      eligibleCount: eligible.length, candidateCount: candidates.length, alreadyPendingCount, createdCount: 0,
      omittedCount, complete: omittedCount === 0, capturedAt: new Date().toISOString(),
    } });
  }
  const newCandidates = candidates.filter(record => !pendingIds.has(record.id));
  const selected = newCandidates.slice(0, 50);
  const versionById = await readVersions(session, workspace, selected.map(record => record.id), request.signal);
  if (versionById.size !== selected.length || selected.some(record => !versionById.has(record.id))) throw unavailable();

  let batch = proposalBatchResultSchema.parse({ requestId, items: [], duplicate: false });
  if (selected.length) {
    const persistence = matchPersistenceSchema.safeParse({ requestId, provenance,
      proposals: selected.map(transaction => ({ transactionId: transaction.id, transactionVersion: versionById.get(transaction.id),
        documentId, documentVersion: document.reviewVersion, rationale: 'Exact PKR amount candidate. Compare the receipt date, counterparty, reference and original source before deciding.', status: 'needs_review' })) });
    if (!persistence.success) throw unavailable();
    const saved = await session.database.rpc('register_match_proposals', {
      p_request_id: requestId, p_provenance: persistence.data.provenance, p_proposals: persistence.data.proposals,
    }).abortSignal(request.signal);
    if (saved.error) throw databaseError(saved.error);
    const checked = proposalBatchResultSchema.safeParse(saved.data);
    if (!checked.success || checked.data.requestId !== requestId || checked.data.items.some(item =>
      item.workspaceId !== workspace.id || item.suggestion.kind !== 'match' || item.suggestion.documentId !== documentId)) throw unavailable();
    batch = checked.data;
  }
  const returnedIds = new Set(batch.items.map(item => item.transactionId));
  const otherPendingCount = [...pendingIds].filter(id => !returnedIds.has(id)).length;
  const createdCount = batch.items.length;
  const omittedCount = Math.max(0, candidates.length - otherPendingCount - createdCount);
  return matchGenerationResultSchema.parse({ ...batch, snapshot: {
    documentId, documentVersion: batch.items[0]?.suggestion.kind === 'match' ? batch.items[0].suggestion.documentVersion : document.reviewVersion,
    transactionCount: cashbook.records.length, eligibleCount: eligible.length, candidateCount: candidates.length,
    alreadyPendingCount: otherPendingCount, createdCount, omittedCount, complete: omittedCount === 0,
    capturedAt: new Date().toISOString(),
  } });
}
