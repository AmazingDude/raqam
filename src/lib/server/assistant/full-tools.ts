import { z } from 'zod';
import type { SupportingDocument, Transaction } from '../../contracts/index.ts';
import type { AssistantResponse } from '../../contracts/assistant.ts';
import { assistantToolResultSchemas } from '../../contracts/assistant.ts';
import { acceptedDocumentFieldsSchema, documentRecordSchema } from '../../contracts/documents.ts';
import { assistantToolSchemas } from '../../contracts/schemas.ts';
import { BackendError } from '../errors.ts';
import { formatAmount } from '../money.ts';
import { createCashbookTools } from './cashbook-tools.ts';
import { combinedSnapshot, documentSnapshot, historySnapshot } from './snapshot.ts';

export type ToolObservation = {
  text: string; records: Transaction[]; citations: AssistantResponse['citations']; partial: boolean;
  details?: unknown;
};
type Options = {
  workspaceId: string; deadlineAt: number; signal?: AbortSignal;
  readSnapshot: () => Promise<unknown>; readDocuments: () => Promise<unknown>;
  readHistory: (transactionIds: string[], documentIds: string[]) => Promise<unknown>;
};
const documentSchema = documentRecordSchema.shape.document;
const historySchema = z.strictObject({ items: z.array(z.object({
  kind: z.enum(['transaction', 'document']), id: z.string().min(1), partial: z.boolean(),
  decisions: z.array(z.object({ version: z.number().int().positive(), created_at: z.string() })).max(20),
})).max(20), partial: z.boolean() });
const unavailable = () => new BackendError('UNAVAILABLE', 'Assistant evidence could not be verified. Please retry.');

export function createAssistantTools(options: Options) {
  const { workspaceId, deadlineAt, signal, readDocuments, readHistory } = options;
  const cashbook = createCashbookTools(options);
  function active() {
    if (signal?.aborted || Date.now() >= deadlineAt) throw new BackendError('UNAVAILABLE', 'The assistant request expired. Please retry.');
  }
  async function bounded<T>(read: () => Promise<T>): Promise<T> {
    active();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const stopped = new Promise<never>((_, reject) => {
      onAbort = () => reject(unavailable());
      timer = setTimeout(onAbort, Math.max(1, deadlineAt - Date.now()));
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
    try { const result = await Promise.race([Promise.resolve().then(() => { active(); return read(); }), stopped]); active(); return result; }
    catch (error) { if (error instanceof BackendError) throw error; throw unavailable(); }
    finally { if (timer) clearTimeout(timer); if (onAbort) signal?.removeEventListener('abort', onAbort); }
  }
  let documents: Promise<SupportingDocument[]> | undefined;
  async function docs() {
    active();
    documents ??= bounded(async () => {
      const parsed = z.array(documentSchema).max(200).safeParse(await readDocuments());
      if (!parsed.success || parsed.data.some(d => d.workspaceId !== workspaceId) || new Set(parsed.data.map(d => d.id)).size !== parsed.data.length) throw unavailable();
      if (parsed.data.some(d => d.reviewStatus === 'accepted' && !acceptedDocumentFieldsSchema.safeParse(d.correctedFields ?? d.extractedFields).success)) throw unavailable();
      return parsed.data;
    });
    return structuredClone(await documents);
  }
  function citations(records: Transaction[], documents: SupportingDocument[] = []): AssistantResponse['citations'] {
    return [...records.map(r => ({ kind: 'transaction' as const, id: r.id, source: r.source })),
      ...documents.map(d => ({ kind: 'document' as const, id: d.id, source: d.source }))];
  }
  function documentFacts(document: SupportingDocument) {
    const fields = document.correctedFields ?? document.extractedFields;
    const missing = ['date', 'totalMinor', 'currency'].filter(key => fields[key as keyof typeof fields] === null);
    return `Document ${document.id}: extraction ${document.extractionStatus}, review ${document.reviewStatus}; ${missing.length ? `unknown required fields: ${missing.join(', ')}` : 'core fields are present but acceptance remains a separate review decision'}.`;
  }
  function page<T extends { id: string }>(items: T[], limit: number, cursor?: string) {
    const ordered = items.sort((a, b) => a.id.localeCompare(b.id));
    const index = cursor === undefined ? -1 : ordered.findIndex(item => item.id === cursor);
    if (cursor !== undefined && index < 0) throw new BackendError('CONFLICT', 'The review page changed. Restart the lookup.');
    const remaining = ordered.slice(index + 1);
    return { items: remaining.slice(0, limit), total: ordered.length, nextCursor: remaining.length > limit ? remaining[limit - 1]!.id : null };
  }
  return {
    async list_transactions(input: unknown): Promise<ToolObservation> {
      const result = assistantToolResultSchemas.list_transactions.parse(await cashbook.list_transactions(input));
      const args = assistantToolSchemas.list_transactions.parse(input);
      return { text: `Showing ${result.items.length} matching imported transactions${result.nextCursor ? '; more records are available on the next page' : '; this page completes the lookup'}. Amounts and review statuses come from the cashbook.`,
        records: result.items, citations: citations(result.items), partial: !result.complete || args.cursor !== undefined, details: { result } };
    },
    async get_cash_summary(input: unknown): Promise<ToolObservation> {
      const args = assistantToolSchemas.get_cash_summary.parse(input);
      const summary = assistantToolResultSchemas.get_cash_summary.parse(await cashbook.get_cash_summary(input));
      const listed = await cashbook.list_transactions({ limit: 50, ...(args.dateFrom ? { dateFrom: args.dateFrom } : {}), ...(args.dateTo ? { dateTo: args.dateTo } : {}) });
      return { text: `Recorded cash movement${args.dateFrom || args.dateTo ? ` from ${args.dateFrom ?? 'the earliest recorded date'} through ${args.dateTo ?? 'the latest recorded date'}` : ' across the whole workspace'}: PKR ${formatAmount(summary.summary.netMovementMinor)} net, from PKR ${formatAmount(summary.summary.inflowMinor)} cash in minus PKR ${formatAmount(summary.summary.outflowMinor)} cash out, across ${summary.summary.transactionCount} transactions. This is cash movement, not profit or a bank balance. ${summary.summary.unresolvedImportRowCount} unresolved import rows are counted across the whole workspace, regardless of this date range.`,
        records: listed.items, citations: citations(listed.items), partial: false, details: { result: summary } };
    },
    async get_review_queue(input: unknown): Promise<ToolObservation> {
      const parsed = assistantToolSchemas.get_review_queue.safeParse(input);
      if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Provide valid review queue filters.');
      const args = parsed.data;
      if (args.kind === 'unresolved_document_fields') {
        const documents = await docs();
        const result = page(documents.filter(d => d.reviewStatus !== 'accepted' && d.reviewStatus !== 'rejected'), args.limit, args.cursor);
        const output = assistantToolResultSchemas.get_review_queue.parse({ kind: args.kind, items: [], documents: result.items,
          returnedCount: result.items.length, totalCount: result.total, complete: args.cursor === undefined && result.nextCursor === null,
          nextCursor: result.nextCursor, snapshot: documentSnapshot(workspaceId, documents) });
        return { text: `${result.total} supporting documents need field review. Showing ${result.items.length} documents; unknown fields remain unknown and receipts do not create cash movement. ${result.items.map(documentFacts).join(' ')}`,
          records: [], citations: citations([], result.items), partial: !output.complete, details: { result: output } };
      }
      const all = await cashbook.allRecords();
      const matching = all.filter(r => args.kind === 'unreviewed_categories' ? r.categoryStatus !== 'accepted' : r.matchStatus !== 'accepted');
      const result = page(matching, args.limit, args.cursor);
      const wholeSnapshot = await cashbook.get_cash_summary({ scope: 'valid_imported_cash' });
      const output = assistantToolResultSchemas.get_review_queue.parse({ kind: args.kind, items: result.items, documents: [],
        returnedCount: result.items.length, totalCount: result.total, complete: args.cursor === undefined && result.nextCursor === null,
        nextCursor: result.nextCursor, snapshot: wholeSnapshot.snapshot });
      const text = args.kind === 'unreviewed_categories'
        ? `${result.total} of ${all.length} imported transactions have no accepted category. Pending suggestions remain unreviewed.`
        : `${result.total} of ${all.length} imported transactions have no accepted document match, including ${matching.filter(r => r.direction === 'out').length} outflows. A missing match is a review need, not proof of nonpayment.`;
      return { text: `${text} Showing ${result.items.length} matching records.`, records: result.items, citations: citations(result.items), partial: !output.complete,
        details: { result: output } };
    },
    async get_record_evidence(input: unknown): Promise<ToolObservation> {
      const parsed = assistantToolSchemas.get_record_evidence.safeParse(input);
      if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Provide between 1 and 20 evidence record IDs.');
      const { transactionIds, documentIds } = parsed.data;
      const all = transactionIds.length ? await cashbook.allRecords() : [];
      const records = [...new Set(transactionIds)].map(id => all.find(r => r.id === id));
      const allDocs = documentIds.length ? await docs() : [];
      const evidenceDocs = [...new Set(documentIds)].map(id => allDocs.find(d => d.id === id));
      if (records.some(r => !r) || evidenceDocs.some(d => !d)) throw new BackendError('NOT_FOUND', 'Record evidence not found.');
      const history = historySchema.parse(await bounded(() => readHistory([...new Set(transactionIds)], [...new Set(documentIds)])));
      if (history.items.some(item => !(item.kind === 'transaction' ? transactionIds : documentIds).includes(item.id))) throw unavailable();
      const selected = records as Transaction[], selectedDocs = evidenceDocs as SupportingDocument[];
      const snapshots = [];
      if (selected.length) snapshots.push((await cashbook.get_cash_summary({ scope: 'valid_imported_cash' })).snapshot);
      if (selectedDocs.length) snapshots.push(documentSnapshot(workspaceId, await docs()));
      snapshots.push(historySnapshot(workspaceId, history));
      const output = assistantToolResultSchemas.get_record_evidence.parse({ transactions: selected, documents: selectedDocs, history,
        returnedCount: selected.length + selectedDocs.length, totalCount: selected.length + selectedDocs.length,
        complete: !history.partial, nextCursor: null, snapshot: combinedSnapshot(workspaceId, snapshots) });
      return { text: `Consulted ${selected.length} imported transactions and ${selectedDocs.length} supporting documents. Original source references and current reviewed values are preserved. Document fields and proposals alone do not prove settlement. Returned ${history.items.reduce((count, item) => count + item.decisions.length, 0)} review history entries, limited to the latest 20 decisions per record. ${selectedDocs.map(documentFacts).join(' ')}`,
        records: selected, citations: citations(selected, selectedDocs), partial: history.partial, details: { result: output } };
    },
  };
}
export type AssistantTools = ReturnType<typeof createAssistantTools>;
