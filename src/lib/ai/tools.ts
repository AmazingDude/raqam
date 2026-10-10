import 'server-only';
import { assistantToolNames, type AssistantToolName, type AssistantToolResult } from '../contracts/assistant.ts';
import { assistantToolSchemas } from '../contracts/schemas.ts';
import type { ScopedAssistantResultTools } from '../server/assistant/tools.ts';
import { AnswerSession, type ModelObservation } from './answer.ts';

export const assistantToolDefinitions = assistantToolNames.map(name => ({ name, description: {
  list_transactions: 'Read a bounded page of imported transactions using explicit date and accepted category/review/match filters. A page is not a complete financial summary.',
  get_cash_summary: 'Read exact cash in, cash out, net movement and transaction count for all imported records in an explicit date range or whole workspace. scope is valid_imported_cash. Excluded import rows are workspace-wide. This is not profit or bank balance.',
  get_review_queue: 'Read unreviewed_categories, unmatched_records or unresolved_document_fields. Pending suggestions are not accepted decisions. Pages may be incomplete.',
  get_record_evidence: 'Read accessible transaction/document source references and bounded review history for IDs already returned by a tool. No paths, URLs, queries or writes.',
}[name] }));

export class AssistantBoundaryError extends Error {
  readonly reason: 'invalid_tool' | 'invalid_arguments' | 'unavailable' | 'execution_limit' | 'cancelled';
  constructor(reason: AssistantBoundaryError['reason']) {
    super('The assistant investigation could not complete safely.');
    this.reason = reason;
  }
}
export type ExecutionContext = { deadlineAtMs: number; signal: AbortSignal };
export function assertActive(context: ExecutionContext): void {
  if (context.signal.aborted) throw new AssistantBoundaryError('cancelled');
  if (Date.now() >= context.deadlineAtMs) throw new AssistantBoundaryError('execution_limit');
}
/** Bounds even a faulty adapter that ignores AbortSignal; late results are discarded. */
export async function boundedExecution<T>(context: ExecutionContext, operation: () => Promise<T>): Promise<T> {
  assertActive(context);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => {
    onAbort = () => reject(new AssistantBoundaryError('cancelled'));
    timer = setTimeout(() => reject(new AssistantBoundaryError('execution_limit')), Math.max(1, context.deadlineAtMs - Date.now()));
    context.signal.addEventListener('abort', onAbort, { once: true });
    if (context.signal.aborted) onAbort();
  });
  try {
    const result = await Promise.race([Promise.resolve().then(() => { assertActive(context); return operation(); }), stopped]);
    assertActive(context); return result;
  } finally { if (timer) clearTimeout(timer); if (onAbort) context.signal.removeEventListener('abort', onAbort); }
}

type ToolArguments = ReturnType<(typeof assistantToolSchemas)[AssistantToolName]['parse']>;
export type PreparedAssistantCall = { name: AssistantToolName; args: ToolArguments; key: string };
const recordId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
export function prepareAssistantCall(name: string, json: string): PreparedAssistantCall {
  if (!assistantToolNames.some(allowed => allowed === name)) throw new AssistantBoundaryError('invalid_tool');
  const tool = name as AssistantToolName;
  if (json.length > 8000) throw new AssistantBoundaryError('invalid_arguments');
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new AssistantBoundaryError('invalid_arguments'); }
  const parsed = assistantToolSchemas[tool].safeParse(raw);
  if (!parsed.success) throw new AssistantBoundaryError('invalid_arguments');
  const args = parsed.data;
  if ('cursor' in args && args.cursor !== undefined && !recordId.test(args.cursor)) throw new AssistantBoundaryError('invalid_arguments');
  if ('transactionIds' in args && [args.transactionIds, args.documentIds].some(ids =>
    new Set(ids).size !== ids.length || ids.some(id => !recordId.test(id)))) throw new AssistantBoundaryError('invalid_arguments');
  const canonical = Object.fromEntries(Object.entries(args).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value]));
  return { name: tool, args, key: `${tool}:${JSON.stringify(canonical)}` };
}
export type PublicToolTrace = { tool: AssistantToolName; scope: Record<string, string | number | boolean>;
  recordsConsulted: number; factRefs: string[]; status: 'complete' | 'partial' | 'unavailable'; reused: number };
function publicScope(args: ToolArguments): PublicToolTrace['scope'] {
  const scope: PublicToolTrace['scope'] = {};
  for (const key of ['dateFrom', 'dateTo', 'category', 'categoryStatus', 'matchStatus', 'kind', 'limit', 'scope'] as const) {
    if (key in args) { const value = (args as Record<string, unknown>)[key]; if (typeof value === 'string' || typeof value === 'number') scope[key] = value; }
  }
  if ('cursor' in args) scope.paginated = args.cursor !== undefined;
  if ('transactionIds' in args) { scope.transactionIdsRequested = args.transactionIds.length; scope.documentIdsRequested = args.documentIds.length; }
  return scope;
}

/** Receives only A's authenticated result-only closures, never a database client. */
export class AssistantToolBoundary {
  readonly #cache = new Map<string, { observation: ModelObservation; trace: PublicToolTrace }>();
  readonly #trace: PublicToolTrace[] = [];
  #running = false;
  readonly evidence: AnswerSession;
  private readonly tools: ScopedAssistantResultTools;
  private readonly context: ExecutionContext;
  constructor(evidence: AnswerSession, tools: ScopedAssistantResultTools, context: ExecutionContext) {
    this.evidence = evidence; this.tools = tools; this.context = context;
  }
  trace(): PublicToolTrace[] { return structuredClone(this.#trace); }
  executions(): number { return this.#trace.length; }
  async execute(name: string, json: string): Promise<ModelObservation> {
    const call = prepareAssistantCall(name, json); assertActive(this.context);
    if (this.#running) throw new AssistantBoundaryError('execution_limit');
    const cached = this.#cache.get(call.key);
    if (cached) { cached.trace.reused++; return structuredClone(cached.observation); }
    if (this.executions() >= 4) throw new AssistantBoundaryError('execution_limit');
    if ('transactionIds' in call.args && (call.args.transactionIds.some(id => !this.evidence.knows('transaction', id)) ||
      call.args.documentIds.some(id => !this.evidence.knows('document', id)))) throw new AssistantBoundaryError('invalid_arguments');
    if ('cursor' in call.args && call.args.cursor !== undefined &&
      !this.evidence.knows(call.name === 'get_review_queue' && 'kind' in call.args && call.args.kind === 'unresolved_document_fields' ? 'document' : 'transaction', call.args.cursor))
      throw new AssistantBoundaryError('invalid_arguments');
    const trace: PublicToolTrace = { tool: call.name, scope: publicScope(call.args), recordsConsulted: 0, factRefs: [], status: 'unavailable', reused: 0 };
    this.#trace.push(trace); this.#running = true;
    try {
      const raw = await boundedExecution<AssistantToolResult[AssistantToolName]>(this.context, () => this.tools[call.name](call.args));
      const observation = this.evidence.register(call.name, call.args, raw);
      trace.recordsConsulted = 'returnedCount' in raw ? raw.returnedCount : 0;
      trace.factRefs = observation.facts.map(fact => fact.id); trace.status = observation.complete ? 'complete' : 'partial';
      this.#cache.set(call.key, { observation, trace }); return structuredClone(observation);
    } finally { this.#running = false; }
  }
}
