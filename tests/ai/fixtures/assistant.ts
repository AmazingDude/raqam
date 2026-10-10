import type { Transaction, SupportingDocument } from '../../../src/lib/contracts/index.ts';
import { createAssistantTools } from '../../../src/lib/server/assistant/full-tools.ts';
import type { ScopedAssistantResultTools } from '../../../src/lib/server/assistant/tools.ts';
import type { ProviderResult, ToolConversationRequest, ProviderContext } from '../../../src/lib/ai/provider.ts';

export const workspaceId = '10000000-0000-4000-8000-000000000001';
export const requestId = '10000000-0000-4000-8000-000000000002';
export const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function transaction(n = 1, overrides: Partial<Transaction> = {}): Transaction {
  return { id: id(n), workspaceId, date: '2026-10-10', description: 'Synthetic receipt', originalDescription: 'Synthetic receipt',
    amountMinor: '9007199254740993', currency: 'PKR', direction: 'in', reference: null,
    source: { sourceId: id(100), rowNumber: n + 1 }, category: null, categoryStatus: 'needs_review', matchStatus: 'unmatched', ...overrides };
}
export function document(): SupportingDocument {
  return { id: id(200), workspaceId, source: { sourceId: id(201), rowNumber: null },
    extractedFields: { counterparty: null, date: null, totalMinor: null, currency: null, reference: null },
    correctedFields: null, extractionStatus: 'pending', reviewStatus: 'needs_review', modelVersion: null, promptVersion: null };
}
/** Uses A's real deterministic read implementation with synthetic readers, not hosted auth. */
export function scopedTools(records = [transaction()], documents = [document()]): ScopedAssistantResultTools {
  const tools = createAssistantTools({ workspaceId, deadlineAt: Date.now() + 10_000,
    readSnapshot: async () => ({ records, unresolvedImportRowCount: 2 }), readDocuments: async () => documents,
    readHistory: async (transactions, docs) => ({ partial: false, items: [...transactions.map(id => ({ kind: 'transaction', id })),
      ...docs.map(id => ({ kind: 'document', id }))].map(item => ({ ...item, partial: false,
        decisions: [{ version: 1, created_at: '2026-10-10T12:00:00Z' }] })) }) });
  return { list_transactions: async args => (await tools.list_transactions(args)).result,
    get_cash_summary: async args => (await tools.get_cash_summary(args)).result,
    get_review_queue: async args => (await tools.get_review_queue(args)).result,
    get_record_evidence: async args => (await tools.get_record_evidence(args)).result };
}
export type Script = (request: ToolConversationRequest, context: ProviderContext, round: number) => unknown | Promise<unknown>;
export function provider(script: Script) {
  let rounds = 0;
  const requests: ToolConversationRequest[] = [];
  return { requests, async requestToolConversation(request: ToolConversationRequest, context: ProviderContext): Promise<ProviderResult> {
    requests.push(structuredClone(request));
    if (!context.budget?.take()) throw new Error('script budget exhausted');
    const output = await script(request, context, ++rounds);
    return { ok: true, output, metadata: { requestId: null, mode: 'tool', model: 'scripted-test-only', providerVersion: 'scripted-v1',
      promptVersion: request.versions.prompt, schemaVersion: request.versions.schema, attempts: 1, durationMs: 1, providerRequestIds: [], usage: null } };
  } };
}
export const call = (name: string, args: unknown = {}, callId = 'call-1') => ({ content: null, toolCalls: [{ id: callId, name, arguments: JSON.stringify(args) }] });
export function observations(request: ToolConversationRequest) {
  return request.messages.filter(message => message.role === 'tool').map(message => JSON.parse(message.content));
}
export function factAnswer(request: ToolConversationRequest, metric = 'net_movement_minor') {
  const observation = observations(request).find(observation => observation.facts.some((fact: { metric: string }) => fact.metric === metric));
  return { content: JSON.stringify({ kind: 'answer', blocks: [{ type: 'fact', observationId: observation.observationId,
    factId: observation.facts.find((fact: { metric: string }) => fact.metric === metric).id, template: metric }] }), toolCalls: [] };
}
