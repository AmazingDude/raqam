import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AcceptedMatch, SupportingDocument, Transaction } from '../contracts/index.ts';
import { documentFieldsSchema, reviewStatusSchema, sourceReferenceSchema, transactionSchema } from '../contracts/schemas.ts';
import { MATCHING_PROMPT_VERSION, matchingPrompt, matchingResponseSchema } from './prompts/matching.ts';
import type { SemanticMatchResponse } from './prompts/matching.ts';

export const MATCHING_POLICY_VERSION = 'c2-matching-v1';
export const MATCHING_POOL_LIMIT = 50;
const versionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const idSchema = z.string().min(1).max(200);

// Operation-local validation of A's existing record, not a new shared document contract.
const documentSchema = z.strictObject({
  id: idSchema, workspaceId: idSchema, source: sourceReferenceSchema,
  extractedFields: documentFieldsSchema, correctedFields: documentFieldsSchema.nullable(),
  extractionStatus: z.enum(['pending', 'complete', 'failed']), reviewStatus: reviewStatusSchema,
  modelVersion: z.string().nullable(), promptVersion: z.string().nullable(),
}) satisfies z.ZodType<SupportingDocument>;
const allocationSchema = z.strictObject({
  id: idSchema, workspaceId: idSchema, transactionId: idSchema, documentId: idSchema, reviewDecisionId: idSchema,
}) satisfies z.ZodType<AcceptedMatch>;

// Provisional C-local capability envelope. A must adopt/map versions and completeness
// before production wiring; these flags never establish authorization themselves.
const inputSchema = z.strictObject({
  workspaceId: idSchema,
  document: z.strictObject({ record: documentSchema, version: versionSchema }),
  transactions: z.array(z.strictObject({ record: transactionSchema, version: versionSchema })).max(MATCHING_POOL_LIMIT),
  pool: z.strictObject({ complete: z.literal(true), revision: idSchema }),
  allocations: z.strictObject({ complete: z.literal(true), version: versionSchema, items: z.array(allocationSchema).max(2000) }),
});
export type ReviewedMatchInput = z.infer<typeof inputSchema>;
export type MatchReason = 'compatible_candidates' | 'invalid_input' | 'unreviewed_document' | 'missing_financial_fields'
  | 'document_allocated' | 'empty_pool' | 'all_allocated' | 'no_compatible_candidates' | 'insufficient_evidence'
  | 'multiple_candidates' | 'conflicting_evidence' | 'supported_recommendation' | 'invalid_model_output'
  | 'stale_input' | 'snapshot_unavailable' | 'provider_unavailable' | 'deadline_exceeded' | 'cancelled';
type Exclusion = { transactionId: string; reason: 'allocated' | 'currency_mismatch' | 'amount_mismatch' };
type DocumentField = keyof SupportingDocument['extractedFields'];
type TransactionField = 'description' | 'date' | 'amountMinor' | 'currency' | 'reference';
export type MatchEvidenceReference = {
  id: string; recordId: string; sourceId: string; rowNumber: number | null;
  kind: 'document' | 'csv'; field: string; value: string | null;
};
export type MatchCandidate = {
  transaction: Transaction; version: number;
  features: { amountEqual: true; currencyEqual: true; dateGapDays: number; reference: 'equal' | 'conflict' | 'missing' };
  refs: Record<TransactionField, string>;
};
export type MatchSnapshot = {
  fingerprint: string; documentVersion: number; poolRevision: string; allocationVersion: number;
  transactionVersions: { transactionId: string; version: number }[];
};
export type PreparedMatch = {
  status: 'ready' | 'blocked' | 'needs_review'; reason: MatchReason;
  snapshot: MatchSnapshot | null; document: SupportingDocument | null;
  documentRefs: Partial<Record<DocumentField, string>>;
  candidates: MatchCandidate[]; excluded: Exclusion[]; evidence: MatchEvidenceReference[];
  counts: { supplied: number; compatible: number; excluded: number };
};

function emptyPreparation(reason: MatchReason): PreparedMatch {
  return { status: 'blocked', reason, snapshot: null, document: null, documentRefs: {}, candidates: [], excluded: [], evidence: [], counts: { supplied: 0, compatible: 0, excluded: 0 } };
}

function validScope(input: ReviewedMatchInput): boolean {
  if (input.document.record.workspaceId !== input.workspaceId || input.document.record.source.rowNumber !== null) return false;
  const ids = new Set<string>(), rows = new Set<string>();
  const allocatedTransactions = new Set<string>(), allocatedDocuments = new Set<string>(), allocationIds = new Set<string>();
  for (const match of input.allocations.items) {
    if (match.workspaceId !== input.workspaceId || allocationIds.has(match.id)
      || allocatedTransactions.has(match.transactionId) || allocatedDocuments.has(match.documentId)) return false;
    allocationIds.add(match.id); allocatedTransactions.add(match.transactionId); allocatedDocuments.add(match.documentId);
  }
  for (const { record } of input.transactions) {
    const rowKey = JSON.stringify([record.source.sourceId, record.source.rowNumber]);
    if (record.workspaceId !== input.workspaceId || record.source.rowNumber === null || ids.has(record.id) || rows.has(rowKey)
      || record.id.length > 200 || record.source.sourceId.length > 200
      || (record.matchStatus === 'accepted') !== allocatedTransactions.has(record.id)) return false;
    ids.add(record.id); rows.add(rowKey);
  }
  return input.document.record.source.sourceId.length <= 200;
}

export function prepareMatchCandidates(raw: unknown): PreparedMatch {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success || !validScope(parsed.data)) return emptyPreparation('invalid_input');
  const input = parsed.data, document = input.document.record;
  // Canonical schemas validate exact nonnegative integer money via A's assertMinorUnits.
  // Fingerprint includes record values as well as versions; no C cache or reservation.
  const snapshot: MatchSnapshot = {
    fingerprint: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
    documentVersion: input.document.version, poolRevision: input.pool.revision, allocationVersion: input.allocations.version,
    transactionVersions: input.transactions.map(({ record, version }) => ({ transactionId: record.id, version })),
  };
  const result = { ...emptyPreparation('compatible_candidates'), snapshot, document, counts: { supplied: input.transactions.length, compatible: 0, excluded: 0 } };
  if (document.reviewStatus !== 'accepted' || document.extractionStatus !== 'complete') return { ...result, reason: 'unreviewed_document' };
  const fields = document.correctedFields ?? document.extractedFields;
  if (fields.date === null || fields.totalMinor === null || fields.currency === null || !/^[A-Z]{3}$/.test(fields.currency)) {
    return { ...result, reason: 'missing_financial_fields' };
  }
  if (input.allocations.items.some(match => match.documentId === document.id)) {
    return { ...result, status: 'needs_review', reason: 'document_allocated' };
  }
  const basis = document.correctedFields === null ? 'extractedFields' : 'correctedFields';
  for (const field of ['counterparty', 'date', 'totalMinor', 'currency', 'reference'] as const) {
    const id = `document.${field}`;
    result.documentRefs[field] = id;
    result.evidence.push({ id, recordId: document.id, sourceId: document.source.sourceId, rowNumber: null, kind: 'document', field: `${basis}.${field}`, value: fields[field] });
  }
  const allocated = new Set(input.allocations.items.map(match => match.transactionId));
  for (const [index, { record, version }] of input.transactions.entries()) {
    const reason = allocated.has(record.id) ? 'allocated' : record.currency !== fields.currency ? 'currency_mismatch'
      : record.amountMinor !== fields.totalMinor ? 'amount_mismatch' : null;
    if (reason !== null) { result.excluded.push({ transactionId: record.id, reason }); continue; }
    const refs = {} as Record<TransactionField, string>;
    for (const field of ['description', 'date', 'amountMinor', 'currency', 'reference'] as const) {
      const id = `transaction.${index}.${field}`;
      refs[field] = id;
      result.evidence.push({ id, recordId: record.id, sourceId: record.source.sourceId, rowNumber: record.source.rowNumber, kind: 'csv', field, value: record[field] });
    }
    const hasReferences = Boolean(fields.reference?.trim() && record.reference?.trim());
    result.candidates.push({ transaction: record, version, refs, features: {
      amountEqual: true, currencyEqual: true,
      dateGapDays: Math.abs(Date.parse(`${record.date}T00:00:00Z`) - Date.parse(`${fields.date}T00:00:00Z`)) / 86_400_000,
      // Whitespace-only is missing. Otherwise compare verbatim: no fuzzy/reference normalization.
      reference: !hasReferences ? 'missing' : record.reference === fields.reference ? 'equal' : 'conflict',
    } });
  }
  result.counts.compatible = result.candidates.length;
  result.counts.excluded = result.excluded.length;
  if (result.candidates.length > 0) return { ...result, status: 'ready' };
  return { ...result, status: 'needs_review', reason: input.transactions.length === 0 ? 'empty_pool'
    : result.excluded.every(item => item.reason === 'allocated') ? 'all_allocated' : 'no_compatible_candidates' };
}

type SemanticCandidate = SemanticMatchResponse['candidates'][number];
type EvidenceClaim = SemanticCandidate['supportingEvidence'][number] | SemanticCandidate['conflictingEvidence'][number];
export type RankedMatchCandidate = MatchCandidate & {
  evaluated: boolean; relation: SemanticCandidate['relation'];
  strength: 'corroborated' | 'plausible' | 'weak' | 'conflicting';
  supportingEvidence: EvidenceClaim[]; conflictingEvidence: EvidenceClaim[];
  rationale: string; concerns: string[];
};
export type MatchOutcome = {
  status: 'proposed' | 'needs_review' | 'blocked' | 'stale' | 'unavailable'; reason: MatchReason;
  recommendedTransactionId: string | null; preparation: PreparedMatch;
  candidates: RankedMatchCandidate[]; displayCandidates: RankedMatchCandidate[];
  counts: PreparedMatch['counts'] & { evaluated: number; displayed: number; omitted: number };
  snapshot: MatchSnapshot | null; policyVersion: string; promptVersion: string;
};
export type MatchingRequest = ReturnType<typeof matchingPrompt> & { deadline: number; signal: AbortSignal };
export type MatchingDependencies = {
  // C1 maps this narrow feature seam to its sole provider/budget implementation.
  rank: (request: MatchingRequest) => Promise<unknown>;
  // A binds scope, reloads authoritative versions/allocations and checks again atomically
  // at persistence/approval. Never use the model to supply this capability or context.
  readCurrentInput: (context: { signal: AbortSignal; deadline: number }) => Promise<unknown>;
  deadline: number; signal: AbortSignal;
};

function baseRanking(candidate: MatchCandidate, prepared: PreparedMatch): RankedMatchCandidate {
  const conflict = candidate.features.reference === 'conflict';
  return {
    ...candidate, evaluated: false, relation: 'uncertain', strength: conflict ? 'conflicting' : 'weak',
    supportingEvidence: [], conflictingEvidence: conflict ? [{ kind: 'reference_conflict', refs: [prepared.documentRefs.reference!, candidate.refs.reference] }] : [],
    rationale: 'Not semantically evaluated; exact amount and currency alone do not establish a relationship.',
    concerns: conflict ? ['References conflict.'] : ['Merchant relationship has not been established.'],
  };
}

function outcome(preparation: PreparedMatch, status: MatchOutcome['status'], reason: MatchReason,
  candidates = preparation.candidates.map(candidate => baseRanking(candidate, preparation)), recommendedTransactionId: string | null = null): MatchOutcome {
  return {
    status, reason, recommendedTransactionId, preparation, candidates, displayCandidates: candidates.slice(0, 3),
    counts: { ...preparation.counts, evaluated: candidates.filter(candidate => candidate.evaluated).length, displayed: Math.min(3, candidates.length), omitted: Math.max(0, candidates.length - 3) },
    snapshot: preparation.snapshot, policyVersion: MATCHING_POLICY_VERSION, promptVersion: MATCHING_PROMPT_VERSION,
  };
}

function validClaims(candidate: MatchCandidate, model: SemanticCandidate, prepared: PreparedMatch): boolean {
  const fields = prepared.document!.correctedFields ?? prepared.document!.extractedFields;
  const expected: Record<EvidenceClaim['kind'], [string | undefined, string]> = {
    merchant_relation: [prepared.documentRefs.counterparty, candidate.refs.description],
    merchant_conflict: [prepared.documentRefs.counterparty, candidate.refs.description],
    reference_agreement: [prepared.documentRefs.reference, candidate.refs.reference],
    reference_conflict: [prepared.documentRefs.reference, candidate.refs.reference],
    date_context: [prepared.documentRefs.date, candidate.refs.date],
    amount_agreement: [prepared.documentRefs.totalMinor, candidate.refs.amountMinor],
    currency_agreement: [prepared.documentRefs.currency, candidate.refs.currency],
  };
  const kinds = new Set<string>();
  for (const claim of [...model.supportingEvidence, ...model.conflictingEvidence]) {
    const pair = expected[claim.kind];
    if (kinds.has(claim.kind) || claim.refs[0] !== pair[0] || claim.refs[1] !== pair[1]) return false;
    kinds.add(claim.kind);
    if (claim.kind === 'reference_agreement' && candidate.features.reference !== 'equal') return false;
    if (claim.kind === 'reference_conflict' && candidate.features.reference !== 'conflict') return false;
    if ((claim.kind === 'merchant_relation' || claim.kind === 'merchant_conflict') && !fields.counterparty?.trim()) return false;
  }
  const related = model.relation === 'alias' || model.relation === 'related';
  if (related !== kinds.has('merchant_relation')) return false;
  if (related && kinds.has('merchant_conflict')) return false;
  if (model.relation === 'unrelated' && !kinds.has('merchant_conflict')) return false;
  return true;
}

function validatedRanking(raw: unknown, prepared: PreparedMatch): { candidates: RankedMatchCandidate[]; recommendation: string | null } | null {
  const parsed = matchingResponseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.candidates.length !== prepared.candidates.length) return null;
  const model = parsed.data, ids = new Set<string>();
  for (const entry of model.candidates) {
    if (ids.has(entry.transactionId) || !prepared.candidates.some(candidate => candidate.transaction.id === entry.transactionId)) return null;
    ids.add(entry.transactionId);
  }
  if (model.recommendedTransactionId !== null && !ids.has(model.recommendedTransactionId)) return null;
  const ranked: RankedMatchCandidate[] = [];
  for (const candidate of prepared.candidates) {
    const entry = model.candidates.find(item => item.transactionId === candidate.transaction.id)!;
    if (!validClaims(candidate, entry, prepared)) return null;
    const base = baseRanking(candidate, prepared);
    const conflictingEvidence = [...base.conflictingEvidence, ...entry.conflictingEvidence.filter(claim => claim.kind !== 'reference_conflict')];
    const related = entry.relation === 'alias' || entry.relation === 'related';
    const strength = conflictingEvidence.length > 0 ? 'conflicting' : related && candidate.features.reference === 'equal' ? 'corroborated'
      : related || candidate.features.reference === 'equal' ? 'plausible' : 'weak';
    ranked.push({
      ...candidate, evaluated: true, relation: entry.relation, strength,
      supportingEvidence: entry.supportingEvidence, conflictingEvidence,
      rationale: related ? `Model suggests ${entry.relation === 'alias' ? 'a merchant alias' : 'a merchant relationship'} between the reviewed counterparty and CSV description.`
        : entry.relation === 'unrelated' ? 'Model identifies conflicting merchant context.' : 'Merchant relationship remains uncertain.',
      concerns: [
        ...(candidate.features.reference === 'conflict' ? ['References conflict.'] : candidate.features.reference === 'missing' ? ['Reference corroboration is missing.'] : []),
        ...(strength !== 'corroborated' ? ['Insufficient unambiguous corroboration for a recommendation.'] : []),
        'A user must compare the sources; a proposal does not establish settlement.',
      ],
    });
  }
  const priority = { corroborated: 0, plausible: 1, weak: 2, conflicting: 3 };
  // Stable display order only; date or array order never breaks an evidence tie.
  ranked.sort((a, b) => priority[a.strength] - priority[b.strength] || a.features.dateGapDays - b.features.dateGapDays);
  const strongest = ranked.filter(candidate => candidate.strength === 'corroborated');
  const recommendation = strongest.length === 1 ? strongest[0]!.transaction.id : null;
  // A supported ID is still insufficient if it is tied, weak, conflicting or not strongest.
  if (model.recommendedTransactionId !== null && model.recommendedTransactionId !== recommendation) return null;
  return { candidates: ranked, recommendation: model.recommendedTransactionId };
}

class MatchStopped extends Error {
  reason: 'cancelled' | 'deadline_exceeded';
  constructor(reason: 'cancelled' | 'deadline_exceeded') { super(reason); this.reason = reason; }
}

// Bound the entire feature call, including a hung read capability. Provider retries and
// shared quota remain C1's responsibility; C never retries or resets the outer deadline.
async function bounded<T>(operation: () => Promise<T>, signal: AbortSignal, deadline: number, reason: () => MatchStopped['reason']): Promise<T> {
  if (signal.aborted || Date.now() >= deadline) throw new MatchStopped(reason());
  let onAbort: () => void = () => {};
  const stopped = new Promise<never>((_, reject) => { onAbort = () => reject(new MatchStopped(reason())); signal.addEventListener('abort', onAbort, { once: true }); });
  try {
    const result = await Promise.race([Promise.resolve().then(operation), stopped]);
    if (signal.aborted || Date.now() >= deadline) throw new MatchStopped(reason());
    return result;
  }
  finally { signal.removeEventListener('abort', onAbort); }
}

export async function proposeMatches(raw: unknown, deps: MatchingDependencies): Promise<MatchOutcome> {
  const prepared = prepareMatchCandidates(raw);
  if (prepared.status !== 'ready') return outcome(prepared, prepared.status, prepared.reason);
  if (!Number.isSafeInteger(deps.deadline) || deps.deadline <= Date.now()) return outcome(prepared, 'unavailable', 'deadline_exceeded');
  if (deps.signal.aborted) return outcome(prepared, 'unavailable', 'cancelled');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(deps.deadline - Date.now(), 2_147_483_647));
  const signal = AbortSignal.any([deps.signal, controller.signal]);
  const stoppedReason = () => deps.signal.aborted ? 'cancelled' as const : 'deadline_exceeded' as const;
  let stage: 'snapshot' | 'provider' = 'snapshot';
  try {
    const readCurrent = () => deps.readCurrentInput({ signal, deadline: deps.deadline });
    const current = prepareMatchCandidates(await bounded(readCurrent, signal, deps.deadline, stoppedReason));
    if (!current.snapshot) return outcome(prepared, 'unavailable', 'snapshot_unavailable');
    if (current.status !== 'ready' || current.snapshot.fingerprint !== prepared.snapshot!.fingerprint) return outcome(prepared, 'stale', 'stale_input');
    stage = 'provider';
    const response = await bounded(() => deps.rank({ ...matchingPrompt(prepared), deadline: deps.deadline, signal }), signal, deps.deadline, stoppedReason);
    stage = 'snapshot';
    const refreshed = prepareMatchCandidates(await bounded(readCurrent, signal, deps.deadline, stoppedReason));
    // Reapply all compatibility/allocation/version validation after the external call.
    if (!refreshed.snapshot) return outcome(prepared, 'unavailable', 'snapshot_unavailable');
    if (refreshed.status !== 'ready' || refreshed.snapshot.fingerprint !== prepared.snapshot!.fingerprint) return outcome(prepared, 'stale', 'stale_input');
    const ranking = validatedRanking(response, refreshed);
    if (!ranking) return outcome(prepared, 'needs_review', 'invalid_model_output');
    if (signal.aborted || Date.now() >= deps.deadline) return outcome(prepared, 'unavailable', stoppedReason());
    if (ranking.recommendation !== null) return outcome(prepared, 'proposed', 'supported_recommendation', ranking.candidates, ranking.recommendation);
    const plausible = ranking.candidates.filter(candidate => candidate.strength === 'plausible' || candidate.strength === 'corroborated');
    const reason = plausible.length > 1 ? 'multiple_candidates' : ranking.candidates.some(candidate => candidate.strength === 'conflicting') ? 'conflicting_evidence' : 'insufficient_evidence';
    return outcome(prepared, 'needs_review', reason, ranking.candidates);
  } catch (error: unknown) {
    return outcome(prepared, 'unavailable', error instanceof MatchStopped ? error.reason : stage === 'snapshot' ? 'snapshot_unavailable' : 'provider_unavailable');
  } finally { clearTimeout(timer); }
}
