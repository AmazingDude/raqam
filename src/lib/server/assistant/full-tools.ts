import { z } from 'zod';
import type { SupportingDocument, Transaction } from '../../contracts/index.ts';
import {
  assistantHistorySchema, parseAssistantToolResult,
  type AssistantResponse, type AssistantToolName, type AssistantToolResult,
} from '../../contracts/assistant.ts';
import { acceptedDocumentFieldsSchema, documentRecordSchema } from '../../contracts/documents.ts';
import { assistantToolSchemas } from '../../contracts/schemas.ts';
import { BackendError } from '../errors.ts';
import { formatAmount } from '../money.ts';
import { createCashbookTools } from './cashbook-tools.ts';
import { combinedSnapshot, documentSnapshot, historySnapshot } from './snapshot.ts';

export type ToolObservation<Name extends AssistantToolName = AssistantToolName> = {
  text: string; records: Transaction[]; citations: AssistantResponse['citations']; partial: boolean;
  result: AssistantToolResult[Name];
  details?: unknown;
};
type Options = {
  workspaceId: string; deadlineAt: number; signal?: AbortSignal;
  readSnapshot: () => Promise<unknown>; readDocuments: () => Promise<unknown>;
  readHistory: (transactionIds: string[], documentIds: string[]) => Promise<unknown>;
};
const documentSchema = documentRecordSchema.shape.document;
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
  function validatedResult<Name extends AssistantToolName>(name: Name, value: unknown): AssistantToolResult[Name] {
    try { return parseAssistantToolResult(name, value, workspaceId); }
    catch { throw unavailable(); }
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
    async list_transactions(input: unknown): Promise<ToolObservation<'list_transactions'>> {
      const result = await cashbook.list_transactions(input);
      return { result, text: `Showing ${result.returnedCount} of ${result.totalCount} matching imported transactions${result.nextCursor ? '; more records are available on the next page' : result.complete ? '; this response completes the lookup' : '; this page does not establish full-scope completeness'}. Amounts and review statuses come from the cashbook.`,
        records: result.items, citations: citations(result.items), partial: !result.complete, details: result };
    },
    async get_cash_summary(input: unknown): Promise<ToolObservation<'get_cash_summary'>> {
      const args = assistantToolSchemas.get_cash_summary.parse(input);
      const summary = await cashbook.get_cash_summary(input);
      const result = await cashbook.list_transactions({ limit: 50, ...(args.dateFrom ? { dateFrom: args.dateFrom } : {}), ...(args.dateTo ? { dateTo: args.dateTo } : {}) });
      return { result: summary, text: `Recorded cash movement${args.dateFrom || args.dateTo ? ` from ${args.dateFrom ?? 'the earliest recorded date'} through ${args.dateTo ?? 'the latest recorded date'}` : ' across the whole workspace'}: PKR ${formatAmount(summary.summary.netMovementMinor)} net, from PKR ${formatAmount(summary.summary.inflowMinor)} cash in minus PKR ${formatAmount(summary.summary.outflowMinor)} cash out, across ${summary.summary.transactionCount} transactions. This is cash movement, not profit or a bank balance. ${summary.summary.unresolvedImportRowCount} unresolved import rows are counted across the whole workspace, regardless of this date range.`,
        records: result.items, citations: citations(result.items), partial: false, details: summary };
    },
    async get_review_queue(input: unknown): Promise<ToolObservation<'get_review_queue'>> {
      const parsed = assistantToolSchemas.get_review_queue.safeParse(input);
      if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Provide valid review queue filters.');
      const args = parsed.data;
      if (args.kind === 'unresolved_document_fields') {
        const allDocuments = await docs();
        const result = page(allDocuments.filter(d => d.reviewStatus !== 'accepted' && d.reviewStatus !== 'rejected'), args.limit, args.cursor);
        const payload = validatedResult('get_review_queue', {
          kind: args.kind, items: [], documents: result.items, returnedCount: result.items.length, totalCount: result.total,
          complete: args.cursor === undefined && result.nextCursor === null, nextCursor: result.nextCursor,
          snapshot: documentSnapshot(workspaceId, allDocuments),
        });
        return { text: `${result.total} supporting documents need field review. Showing ${result.items.length} documents; unknown fields remain unknown and receipts do not create cash movement. ${result.items.map(documentFacts).join(' ')}`,
          records: [], citations: citations([], result.items), partial: !payload.complete, result: payload, details: payload };
      }
      const { records: all, snapshot } = await cashbook.allRecordsSnapshot();
      const matching = all.filter(r => args.kind === 'unreviewed_categories' ? r.categoryStatus !== 'accepted' : r.matchStatus !== 'accepted');
      const result = page(matching, args.limit, args.cursor);
      const payload = validatedResult('get_review_queue', {
        kind: args.kind, items: result.items, documents: [], returnedCount: result.items.length, totalCount: result.total,
        complete: args.cursor === undefined && result.nextCursor === null, nextCursor: result.nextCursor, snapshot,
      });
      const text = args.kind === 'unreviewed_categories'
        ? `${result.total} of ${all.length} imported transactions have no accepted category. Pending suggestions remain unreviewed.`
        : `${result.total} of ${all.length} imported transactions have no accepted document match, including ${matching.filter(r => r.direction === 'out').length} outflows. A missing match is a review need, not proof of nonpayment.`;
      return { text: `${text} Showing ${result.items.length} matching records.`, records: result.items, citations: citations(result.items), partial: !payload.complete,
        result: payload, details: payload };
    },
    async get_record_evidence(input: unknown): Promise<ToolObservation<'get_record_evidence'>> {
      const parsed = assistantToolSchemas.get_record_evidence.safeParse(input);
      if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Provide between 1 and 20 evidence record IDs.');
      const { transactionIds, documentIds } = parsed.data;
      const uniqueTransactionIds = [...new Set(transactionIds)], uniqueDocumentIds = [...new Set(documentIds)];
      const cashbookRead = uniqueTransactionIds.length ? await cashbook.allRecordsSnapshot() : null;
      const all = cashbookRead?.records ?? [];
      const records = uniqueTransactionIds.map(id => all.find(r => r.id === id));
      const allDocs = uniqueDocumentIds.length ? await docs() : [];
      const evidenceDocs = uniqueDocumentIds.map(id => allDocs.find(d => d.id === id));
      if (records.some(r => !r) || evidenceDocs.some(d => !d)) throw new BackendError('NOT_FOUND', 'Record evidence not found.');
      const rawHistory = await bounded(() => readHistory(uniqueTransactionIds, uniqueDocumentIds));
      const parsedHistory = assistantHistorySchema.safeParse(rawHistory);
      if (!parsedHistory.success) throw unavailable();
      const history = parsedHistory.data;
      if (history.items.some(item => !(item.kind === 'transaction' ? uniqueTransactionIds : uniqueDocumentIds).includes(item.id))) throw unavailable();
      const selected = records as Transaction[], selectedDocs = evidenceDocs as SupportingDocument[];
      const snapshots = [
        ...(cashbookRead ? [cashbookRead.snapshot] : []),
        ...(uniqueDocumentIds.length ? [documentSnapshot(workspaceId, allDocs)] : []),
        historySnapshot(workspaceId, history),
      ];
      const payload = validatedResult('get_record_evidence', {
        transactions: selected, documents: selectedDocs, history,
        returnedCount: selected.length + selectedDocs.length, totalCount: uniqueTransactionIds.length + uniqueDocumentIds.length,
        complete: !history.partial, nextCursor: null, snapshot: combinedSnapshot(workspaceId, snapshots),
      });
      return { text: `Consulted ${selected.length} imported transactions and ${selectedDocs.length} supporting documents. Original source references and current reviewed values are preserved. Document fields and proposals alone do not prove settlement. Returned ${history.items.reduce((count, item) => count + item.decisions.length, 0)} review history entries, limited to the latest 20 decisions per record. ${selectedDocs.map(documentFacts).join(' ')}`,
        records: selected, citations: citations(selected, selectedDocs), partial: !payload.complete, result: payload, details: payload };
    },
  };
}
export type AssistantTools = ReturnType<typeof createAssistantTools>;
