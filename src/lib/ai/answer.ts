import 'server-only';
import { z } from 'zod';
import { assistantToolSchemas } from '../contracts/schemas.ts';
import { parseAssistantToolResult, type AssistantToolName, type AssistantToolResult,
  type AssistantSnapshot } from '../contracts/assistant.ts';
import { acceptedDocumentFieldsSchema } from '../contracts/documents.ts';
import type { SupportingDocument, Transaction } from '../contracts/index.ts';
import { formatAmount } from '../server/money.ts';
import { AssistantFactRegistry, assistantFactSchema, type AssistantFact } from './fact-registry.ts';

const noticeText = {
  partial_results: 'The available evidence is incomplete. These results do not establish a complete answer.',
  execution_limit: 'The investigation reached its execution limit. Narrow the question to continue.',
  invalid_answer: 'The proposed answer could not be verified. Only verified observations are shown.',
  unavailable: 'Some requested evidence is unavailable. Please retry or narrow the question.',
  cancelled: 'The request ended before the investigation completed.',
  stale_results: 'The source snapshot changed during this request. Refresh and ask again.',
  clarification_required: 'Specify the records or an explicit reporting period to investigate.',
  unsupported_scope: 'I can explain recorded cash movement and review needs. I cannot change records, make payments, establish profit or bank balances, or provide tax, investment or fraud conclusions.',
  greeting: 'I can help investigate recorded cash movement, review needs and supporting evidence.',
} as const;
type Notice = keyof typeof noticeText;
const metricLabels: Record<AssistantFact['metric'], string> = {
  recorded_inflow_minor: 'Recorded cash in', recorded_outflow_minor: 'Recorded cash out', net_movement_minor: 'Net cash movement',
  transaction_count: 'Imported transactions in this reporting scope', workspace_unresolved_import_rows: 'Unresolved import rows across the workspace',
  review_queue_count: 'Records in the requested review queue', listed_transaction_count: 'Imported transactions on this returned page',
  evidence_transaction_count: 'Imported transactions consulted', evidence_document_count: 'Supporting documents consulted', review_history_count: 'Returned review history entries',
};
const proposalBlockSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('fact'), observationId: z.uuid(), factId: z.uuid(), template: assistantFactSchema.shape.metric }),
  z.strictObject({ type: z.literal('records'), observationId: z.uuid(), referenceIds: z.array(z.uuid()).min(1).max(20),
    heading: z.enum(['consulted_records', 'needs_category_review', 'needs_document_match', 'unresolved_documents']) }),
  z.strictObject({ type: z.literal('explanation'), observationId: z.uuid(),
    template: z.enum(['pending_is_not_accepted', 'missing_match_is_review_need', 'documents_do_not_prove_settlement']) }),
]);
export const answerProposalSchema = z.strictObject({
  kind: z.enum(['answer', 'clarify', 'scope', 'greeting', 'unavailable']),
  blocks: z.array(proposalBlockSchema).max(12),
}).refine(value => value.kind === 'answer' ? value.blocks.length > 0 : value.blocks.length === 0);
type ProposalBlock = z.infer<typeof proposalBlockSchema>;
export type AnswerReference = { referenceId: string; kind: 'transaction' | 'document'; id: string;
  source: Transaction['source']; snapshot: AssistantSnapshot };
export type AnswerScope = { observationId: string; tool: AssistantToolName; filters: Record<string, unknown>; snapshot: AssistantSnapshot };
export type GroundedBlock = { type: 'fact' | 'records' | 'explanation' | 'notice'; text: string;
  observationId?: string; factId?: string; referenceIds: string[]; scope?: AnswerScope; notice?: Notice };
export type GroundedAnswer = { status: 'answered' | 'partial' | 'needs_clarification' | 'unavailable';
  text: string; blocks: GroundedBlock[]; facts: AssistantFact[]; references: AnswerReference[];
  snapshots: AssistantSnapshot[]; scopes: AnswerScope[]; partial: boolean };
export type ModelObservation = { observationId: string; facts: Array<{ id: string; metric: AssistantFact['metric']; complete: boolean }>;
  references: Array<{ referenceId: string; id: string; kind: 'transaction' | 'document'; categoryStatus?: string; matchStatus?: string; reviewStatus?: string }>;
  complete: boolean };
type Observed = { id: string; tool: AssistantToolName; args: Record<string, unknown>; result: AssistantToolResult[AssistantToolName];
  facts: AssistantFact[]; references: AnswerReference[]; records: Transaction[]; documents: SupportingDocument[] };

export class AnswerEvidenceError extends Error {
  readonly reason: 'invalid_evidence' | 'stale_results';
  constructor(reason: 'invalid_evidence' | 'stale_results') { super('Assistant evidence could not be verified.'); this.reason = reason; }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function ensure(condition: unknown): asserts condition { if (!condition) throw new AnswerEvidenceError('invalid_evidence'); }

/** Request-local evidence boundary. Model prose and model numbers never enter the registry. */
export class AnswerSession {
  readonly #registry = new AssistantFactRegistry();
  readonly #observed = new Map<string, Observed>();
  readonly #sourceSnapshots = new Map<string, string>();
  readonly #known = new Set<string>();
  readonly #recordSnapshots = new Map<string, string>();
  #stale = false;
  readonly workspaceId: string;
  constructor(workspaceId: string) { this.workspaceId = workspaceId; }

  knows(kind: 'transaction' | 'document', id: string): boolean { return this.#known.has(`${kind}:${id}`); }

  register(tool: AssistantToolName, rawArgs: unknown, rawResult: unknown): ModelObservation {
    const args = assistantToolSchemas[tool].parse(rawArgs);
    const result = parseAssistantToolResult(tool, rawResult, this.workspaceId);
    const records = 'items' in result ? result.items : 'transactions' in result ? result.transactions : [];
    const documents = 'documents' in result ? result.documents : [];
    ensure(records.every(record => record.workspaceId === this.workspaceId) && documents.every(document => document.workspaceId === this.workspaceId));
    const safeId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
    ensure([...records, ...documents].every(record => safeId.test(record.id) && safeId.test(record.source.sourceId)));
    ensure(records.every(record => record.source.rowNumber !== null));
    ensure(new Set(records.map(record => record.id)).size === records.length && new Set(documents.map(document => document.id)).size === documents.length);
    ensure(documents.every(document => document.reviewStatus !== 'accepted' || acceptedDocumentFieldsSchema.safeParse(document.correctedFields ?? document.extractedFields).success));
    ensure(!result.complete || result.returnedCount === result.totalCount);
    if ('limit' in args) ensure(result.returnedCount <= args.limit);
    if ('cursor' in args && args.cursor !== undefined) ensure(!result.complete);
    if (result.nextCursor !== null) ensure(result.nextCursor === (records.at(-1)?.id ?? documents.at(-1)?.id));
    if (tool === 'get_cash_summary') {
      ensure('summary' in result && 'scope' in args);
      ensure(result.dateFrom === (args.dateFrom ?? null) && result.dateTo === (args.dateTo ?? null));
      const summary = result.summary;
      ensure(BigInt(summary.inflowMinor) - BigInt(summary.outflowMinor) === BigInt(summary.netMovementMinor));
      const buckets = [summary.unreviewed, ...Object.values(summary.categories)];
      ensure(buckets.every(bucket => BigInt(bucket.inflowMinor) - BigInt(bucket.outflowMinor) === BigInt(bucket.netMovementMinor)));
      ensure(buckets.reduce((total, bucket) => total + BigInt(bucket.inflowMinor), 0n) === BigInt(summary.inflowMinor));
      ensure(buckets.reduce((total, bucket) => total + BigInt(bucket.outflowMinor), 0n) === BigInt(summary.outflowMinor));
    }
    if (tool === 'list_transactions') {
      ensure('items' in result && 'limit' in args);
      ensure(records.every(record => (!('dateFrom' in args) || !args.dateFrom || record.date >= args.dateFrom) &&
        (!('dateTo' in args) || !args.dateTo || record.date <= args.dateTo) &&
        (!('category' in args) || !args.category || (record.category === args.category && record.categoryStatus === 'accepted')) &&
        (!('categoryStatus' in args) || !args.categoryStatus || record.categoryStatus === args.categoryStatus) &&
        (!('matchStatus' in args) || !args.matchStatus || record.matchStatus === args.matchStatus)));
    }
    if (tool === 'get_review_queue') {
      ensure('kind' in result && 'kind' in args && result.kind === args.kind);
      ensure(result.kind === 'unresolved_document_fields' ? documents.every(document => !['accepted', 'rejected'].includes(document.reviewStatus)) :
        records.every(record => result.kind === 'unreviewed_categories' ? record.categoryStatus !== 'accepted' : record.matchStatus !== 'accepted'));
    }
    if (tool === 'get_record_evidence') {
      ensure('history' in result && 'transactionIds' in args);
      ensure(canonical(records.map(record => record.id).sort()) === canonical([...new Set(args.transactionIds)].sort()));
      ensure(canonical(documents.map(document => document.id).sort()) === canonical([...new Set(args.documentIds)].sort()));
      const historyIds = result.history.items.map(item => `${item.kind}:${item.id}`);
      ensure(new Set(historyIds).size === historyIds.length && result.history.items.every(item =>
        item.kind === 'transaction' ? args.transactionIds.includes(item.id) : args.documentIds.includes(item.id)));
      ensure(historyIds.length === args.transactionIds.length + args.documentIds.length);
      ensure(result.history.items.every(item => new Set(item.decisions.map(decision => decision.version)).size === item.decisions.length &&
        item.decisions.every(decision => Number.isFinite(Date.parse(decision.created_at)))));
    }
    // Combined evidence tokens include selected history, so different selections
    // cannot be compared as if they represented the same complete source read.
    const sourceKey = result.snapshot.sources.length === 1 ? result.snapshot.sources[0]! : null;
    const old = sourceKey ? this.#sourceSnapshots.get(sourceKey) : undefined;
    if (old && old !== result.snapshot.token) { this.#stale = true; throw new AnswerEvidenceError('stale_results'); }
    const recordSnapshots = [...records.map(record => [`transaction:${record.id}`, canonical(record)] as const),
      ...documents.map(document => [`document:${document.id}`, canonical(document)] as const),
      ...('history' in result ? result.history.items.map(item => [`history:${item.kind}:${item.id}`, canonical(item)] as const) : [])];
    if (recordSnapshots.some(([key, value]) => this.#recordSnapshots.has(key) && this.#recordSnapshots.get(key) !== value)) {
      this.#stale = true; throw new AnswerEvidenceError('stale_results');
    }
    const references: AnswerReference[] = [...records.map(record => ({ referenceId: crypto.randomUUID(), kind: 'transaction' as const,
      id: record.id, source: record.source, snapshot: result.snapshot })), ...documents.map(document => ({ referenceId: crypto.randomUUID(),
      kind: 'document' as const, id: document.id, source: document.source, snapshot: result.snapshot }))];
    const facts = this.#registry.register(tool, { records, citations: references.map(({ kind, id, source }) => ({ kind, id, source })),
      partial: !result.complete, details: { result } }, args);
    const id = crypto.randomUUID();
    this.#observed.set(id, structuredClone({ id, tool, args, result, facts, references, records, documents }));
    if (sourceKey) this.#sourceSnapshots.set(sourceKey, result.snapshot.token);
    for (const [key, value] of recordSnapshots) this.#recordSnapshots.set(key, value);
    for (const reference of references) this.#known.add(`${reference.kind}:${reference.id}`);
    if ('summary' in result) for (const transactionId of result.summary.transactionIds) this.#known.add(`transaction:${transactionId}`);
    return { observationId: id, facts: facts.map(fact => ({ id: fact.id, metric: fact.metric, complete: fact.complete })),
      references: references.map(reference => { const record = records.find(record => reference.kind === 'transaction' && record.id === reference.id);
        const document = documents.find(document => reference.kind === 'document' && document.id === reference.id);
        return { referenceId: reference.referenceId, id: reference.id, kind: reference.kind, ...(record ? { categoryStatus: record.categoryStatus, matchStatus: record.matchStatus } : {}),
          ...(document ? { reviewStatus: document.reviewStatus } : {}) }; }), complete: result.complete };
  }

  #scope(observed: Observed): AnswerScope { return { observationId: observed.id, tool: observed.tool,
    filters: structuredClone(observed.args), snapshot: structuredClone(observed.result.snapshot) }; }

  #block(block: ProposalBlock): GroundedBlock {
    const observed = this.#observed.get(block.observationId); ensure(observed && !this.#stale);
    const scope = this.#scope(observed);
    if (block.type === 'fact') {
      const fact = observed.facts.find(fact => fact.id === block.factId); ensure(fact && this.#registry.has(fact.id));
      ensure(fact.metric === block.template && fact.snapshot.workspaceId === this.workspaceId && fact.snapshot.token === scope.snapshot.token);
      let label = metricLabels[fact.metric];
      if (fact.metric === 'review_queue_count' && 'kind' in observed.result) label = observed.result.kind === 'unreviewed_categories'
        ? 'Transactions without an accepted category' : observed.result.kind === 'unmatched_records' ? 'Transactions without an accepted document match' : 'Documents needing field review';
      const reporting = fact.scope.unresolvedImportRowScope === 'workspace' ? 'whole workspace' :
        fact.scope.dateFrom || fact.scope.dateTo ? `${fact.scope.dateFrom ?? 'earliest recorded date'} through ${fact.scope.dateTo ?? 'latest recorded date'}` :
        observed.tool === 'get_cash_summary' ? 'whole workspace' : 'requested filters';
      return { type: 'fact', observationId: observed.id, factId: fact.id, scope, referenceIds: [],
        text: `${label}: ${fact.currency ? `${fact.currency} ${formatAmount(fact.value)}` : fact.value} (${reporting}${fact.complete ? '' : '; incomplete evidence'}).` };
    }
    if (block.type === 'records') {
      ensure(new Set(block.referenceIds).size === block.referenceIds.length);
      const references = block.referenceIds.map(id => observed.references.find(reference => reference.referenceId === id));
      ensure(references.every(reference => reference !== undefined));
      if (block.heading === 'needs_category_review') ensure(references.every(reference => reference?.kind === 'transaction' &&
        observed.records.find(record => record.id === reference.id)?.categoryStatus !== 'accepted'));
      if (block.heading === 'needs_document_match') ensure(references.every(reference => reference?.kind === 'transaction' &&
        observed.records.find(record => record.id === reference.id)?.matchStatus !== 'accepted'));
      if (block.heading === 'unresolved_documents') ensure(references.every(reference => reference?.kind === 'document' &&
        !['accepted', 'rejected'].includes(observed.documents.find(document => document.id === reference.id)!.reviewStatus)));
      const headings = { consulted_records: 'Selected consulted records', needs_category_review: 'Selected transactions without accepted categories',
        needs_document_match: 'Selected transactions without accepted document matches', unresolved_documents: 'Selected documents needing field review' };
      return { type: 'records', observationId: observed.id, scope, referenceIds: block.referenceIds,
        text: `${headings[block.heading]}. Source references are attached; proposals remain separate from accepted decisions.` };
    }
    if (block.template === 'pending_is_not_accepted') ensure(observed.records.some(record => ['proposed', 'needs_review'].includes(record.categoryStatus) || record.matchStatus === 'proposed') ||
      observed.documents.some(document => ['proposed', 'needs_review'].includes(document.reviewStatus)));
    if (block.template === 'missing_match_is_review_need') ensure(observed.records.some(record => record.matchStatus !== 'accepted'));
    if (block.template === 'documents_do_not_prove_settlement') ensure(observed.documents.length > 0);
    const explanations = { pending_is_not_accepted: 'Pending suggestions are not accepted bookkeeping decisions.',
      missing_match_is_review_need: 'A missing accepted document match is a review need, not proof of nonpayment or fraud.',
      documents_do_not_prove_settlement: 'Supporting documents alone do not prove that a bank transaction settled.' };
    return { type: 'explanation', observationId: observed.id, scope, referenceIds: observed.references.map(reference => reference.referenceId), text: explanations[block.template] };
  }

  #result(blocks: GroundedBlock[], status: GroundedAnswer['status'], forcedPartial: boolean): GroundedAnswer {
    const partial = forcedPartial || blocks.some(block => block.observationId && !this.#observed.get(block.observationId)!.result.complete);
    if (partial && !blocks.some(block => block.notice === 'partial_results')) blocks.push({ type: 'notice', referenceIds: [], notice: 'partial_results', text: noticeText.partial_results });
    const referenceIds = new Set(blocks.flatMap(block => block.referenceIds));
    const scopes = [...new Map(blocks.filter(block => block.scope).map(block => [block.scope!.observationId, block.scope!])).values()];
    return structuredClone({ status: partial && status === 'answered' ? 'partial' : status, text: blocks.map(block => block.text).join('\n\n'), blocks,
      facts: this.#stale ? [] : this.#registry.all(), references: [...this.#observed.values()].flatMap(observed => observed.references).filter(reference => referenceIds.has(reference.referenceId)),
      snapshots: this.#stale ? [] : this.#registry.snapshots(), scopes, partial });
  }

  render(raw: unknown): GroundedAnswer {
    if (this.#stale) return this.fallback('stale_results');
    const proposal = answerProposalSchema.parse(raw);
    if (proposal.kind !== 'answer') {
      const notice: Notice = proposal.kind === 'clarify' ? 'clarification_required' : proposal.kind === 'scope' ? 'unsupported_scope' : proposal.kind;
      return this.#result([{ type: 'notice', referenceIds: [], notice, text: noticeText[notice] }],
        proposal.kind === 'unavailable' ? 'unavailable' : 'needs_clarification', false);
    }
    return this.#result(proposal.blocks.map(block => this.#block(block)), 'answered', false);
  }

  fallback(reason: Notice): GroundedAnswer {
    if (this.#stale) reason = 'stale_results';
    const blocks: GroundedBlock[] = [];
    if (!this.#stale) for (const observed of this.#observed.values()) for (const fact of observed.facts) {
      if (blocks.length < 10) blocks.push(this.#block({ type: 'fact', observationId: observed.id, factId: fact.id, template: fact.metric }));
    }
    blocks.push({ type: 'notice', referenceIds: [], notice: reason, text: noticeText[reason] });
    return this.#result(blocks, this.#stale || !this.#observed.size ? 'unavailable' : 'partial', true);
  }
}
