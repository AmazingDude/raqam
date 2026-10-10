import { z } from 'zod';

const integerString = z.string().regex(/^-?(0|[1-9]\d*)$/).max(80);
const metricSchema = z.enum([
  'recorded_inflow_minor', 'recorded_outflow_minor', 'net_movement_minor',
  'transaction_count', 'workspace_unresolved_import_rows', 'review_queue_count',
  'listed_transaction_count', 'evidence_transaction_count', 'evidence_document_count', 'review_history_count',
]);
const snapshotSchema = z.strictObject({ workspaceId: z.string().min(1), token: z.string().regex(/^[a-f0-9]{64}$/),
  sources: z.array(z.enum(['cashbook', 'documents', 'history'])).min(1).max(3) });
export const assistantFactSchema = z.strictObject({
  id: z.uuid(), tool: z.enum(['list_transactions', 'get_cash_summary', 'get_review_queue', 'get_record_evidence']),
  metric: metricSchema, value: integerString, currency: z.literal('PKR').nullable(),
  scope: z.strictObject({ dateFrom: z.iso.date().nullable(), dateTo: z.iso.date().nullable(), unresolvedImportRowScope: z.literal('workspace').nullable() }),
  sourceTransactionIds: z.array(z.string().min(1)).max(50), sourceDocumentIds: z.array(z.string().min(1)).max(50),
  sourceCount: z.number().int().nonnegative(), sourcesComplete: z.boolean(), complete: z.boolean(), snapshot: snapshotSchema,
});
export type AssistantFact = z.infer<typeof assistantFactSchema>;

const summarySchema = z.object({
  inflowMinor: integerString, outflowMinor: integerString, netMovementMinor: integerString,
  currency: z.literal('PKR'), transactionCount: z.number().int().nonnegative(),
  transactionIds: z.array(z.string().min(1)).max(50_000), unresolvedImportRowCount: z.number().int().nonnegative(),
});
const observationSchema = z.object({
  records: z.array(z.object({ id: z.string().min(1) })).max(50),
  citations: z.array(z.object({ kind: z.enum(['transaction', 'document']), id: z.string().min(1) })).max(200),
  partial: z.boolean(), details: z.unknown().optional(),
});

/** One registry per assistant request. Only allowlisted values from validated tool results can enter it. */
export class AssistantFactRegistry {
  readonly #facts: AssistantFact[] = [];
  readonly #ids = new Set<string>();
  readonly #snapshots = new Map<string, z.infer<typeof snapshotSchema>>();
  readonly #createId: () => string;
  constructor(createId: () => string = () => crypto.randomUUID()) { this.#createId = createId; }

  register(tool: AssistantFact['tool'], rawObservation: unknown): AssistantFact[] {
    const observation = observationSchema.safeParse(rawObservation);
    if (!observation.success) throw new Error('Assistant tool result could not be registered as verified evidence.');
    const { records, citations, partial, details } = observation.data;
    const transactionIds = [...new Set(citations.filter(item => item.kind === 'transaction').map(item => item.id))].slice(0, 50);
    const documentIds = [...new Set(citations.filter(item => item.kind === 'document').map(item => item.id))].slice(0, 50);
    if (new Set(records.map(record => record.id)).size !== records.length ||
        records.some(record => !citations.some(item => item.kind === 'transaction' && item.id === record.id)))
      throw new Error('Assistant tool references could not be verified.');
    const envelope = z.object({ result: z.unknown() }).safeParse(details);
    if (!envelope.success) throw new Error('Assistant tool result could not be verified.');
    const resultSnapshot = z.object({ snapshot: snapshotSchema }).passthrough().safeParse(envelope.data.result);
    if (!resultSnapshot.success) throw new Error('Assistant tool snapshot could not be verified.');
    const snapshot = resultSnapshot.data.snapshot;
    this.#snapshots.set(snapshot.token, snapshot);
    const staged: AssistantFact[] = [];
    const add = (metric: AssistantFact['metric'], value: string | number, currency: 'PKR' | null,
      scope: AssistantFact['scope'], sourceCount: number, complete: boolean,
      sourceTransactions = transactionIds, sourceDocuments = documentIds) => {
      const fact = assistantFactSchema.parse({ id: this.#createId(), tool, metric, value: String(value), currency, snapshot,
        scope, sourceTransactionIds: sourceTransactions.slice(0, 50), sourceDocumentIds: sourceDocuments.slice(0, 50), sourceCount,
        sourcesComplete: sourceCount <= sourceTransactions.length + sourceDocuments.length,
        complete: complete && !partial });
      if (this.#ids.has(fact.id) || staged.some(item => item.id === fact.id)) throw new Error('Assistant fact IDs must be unique within a request.');
      staged.push(fact);
    };
    const noDate = { dateFrom: null, dateTo: null, unresolvedImportRowScope: null } as const;
    if (tool === 'get_cash_summary') {
      const parsed = z.object({ summary: summarySchema, dateFrom: z.iso.date().nullable(), dateTo: z.iso.date().nullable(), unresolvedImportRowScope: z.literal('workspace') }).passthrough().safeParse(envelope.data.result);
      if (!parsed.success || parsed.data.summary.transactionIds.length !== parsed.data.summary.transactionCount ||
          new Set(parsed.data.summary.transactionIds).size !== parsed.data.summary.transactionIds.length)
        throw new Error('Assistant summary snapshot could not be verified.');
      const { summary, dateFrom, dateTo } = parsed.data;
      const scope = { dateFrom, dateTo, unresolvedImportRowScope: null } as const;
      add('recorded_inflow_minor', summary.inflowMinor, 'PKR', scope, summary.transactionCount, true, summary.transactionIds);
      add('recorded_outflow_minor', summary.outflowMinor, 'PKR', scope, summary.transactionCount, true, summary.transactionIds);
      add('net_movement_minor', summary.netMovementMinor, 'PKR', scope, summary.transactionCount, true, summary.transactionIds);
      add('transaction_count', summary.transactionCount, null, scope, summary.transactionCount, true, summary.transactionIds);
      add('workspace_unresolved_import_rows', summary.unresolvedImportRowCount, null,
        { dateFrom: null, dateTo: null, unresolvedImportRowScope: 'workspace' }, summary.transactionCount, true, summary.transactionIds);
    } else if (tool === 'get_review_queue') {
      const parsed = z.object({ totalCount: z.number().int().nonnegative() }).passthrough().safeParse(envelope.data.result);
      if (!parsed.success) throw new Error('Assistant review count could not be verified.');
      add('review_queue_count', parsed.data.totalCount, null, noDate, parsed.data.totalCount, true);
    } else if (tool === 'list_transactions') {
      add('listed_transaction_count', records.length, null, noDate, records.length, !partial);
    } else {
      const parsed = z.object({ documents: z.array(z.object({ id: z.string().min(1) })).max(50).optional(),
        transactions: z.array(z.object({ id: z.string().min(1) })).max(20).optional(),
        history: z.object({ items: z.array(z.object({ decisions: z.array(z.unknown()).max(20) })).max(20), partial: z.boolean() }).optional() }).passthrough().safeParse(envelope.data.result);
      if (!parsed.success) throw new Error('Assistant evidence counts could not be verified.');
      const documents = parsed.data.documents ?? [];
      if (new Set(documents.map(item => item.id)).size !== documents.length || documents.some(document => !documentIds.includes(document.id)))
        throw new Error('Assistant evidence references could not be verified.');
      const transactionCount = parsed.data.transactions?.length ?? records.length;
      add('evidence_transaction_count', transactionCount, null, noDate, transactionCount, !partial);
      add('evidence_document_count', documents.length, null, noDate, documents.length, !partial);
      if (parsed.data.history) {
        const count = parsed.data.history.items.reduce((sum, item) => sum + item.decisions.length, 0);
        add('review_history_count', count, null, noDate, records.length + documents.length, !parsed.data.history.partial);
      }
    }
    for (const fact of staged) { this.#ids.add(fact.id); this.#facts.push(fact); }
    return staged;
  }

  has(id: string): boolean { return this.#ids.has(id); }
  all(): AssistantFact[] { return structuredClone(this.#facts); }
  snapshots(): Array<z.infer<typeof snapshotSchema>> { return structuredClone([...this.#snapshots.values()]); }
}
