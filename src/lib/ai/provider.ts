import 'server-only';
import Groq from 'groq-sdk';
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam } from 'groq-sdk/resources/chat/completions';
import { z } from 'zod';
import type { ApiErrorCode, SourceReference } from '../contracts/index.ts';
import { assistantToolSchemas, sourceReferenceSchema } from '../contracts/schemas.ts';
import { identifyImage } from '../server/uploads.ts';
import { PROVIDER_LIMITS as LIMITS, PROVIDER_VERSION, VERSION_PATTERN, readProviderConfiguration } from './config.ts';

export type ToolName = keyof typeof assistantToolSchemas;
export type ProviderMode = 'image' | 'text' | 'tool';
export type ProviderFailureReason = 'configuration_missing' | 'invalid_request' | 'invalid_model_output' |
  'provider_auth' | 'provider_request' | 'provider_blocked' | 'provider_rate_limited' | 'provider_unavailable' |
  'provider_timeout' | 'provider_network' | 'deadline_exceeded' | 'cancelled' | 'budget_exhausted' | 'budget_unavailable';
export interface ProviderClock {
  now(): number;
  setTimer(milliseconds: number, callback: () => void): () => void;
}
export interface ProviderContext {
  requestId: string;
  deadlineAtMs: number;
  signal?: AbortSignal;
  // Optional A/C account allowance; the adapter's own two-attempt cap always applies.
  budget?: { take(): boolean };
}
export interface PromptVersions { prompt: string; schema: string }
export interface ImageExtractionRequest {
  source: SourceReference;
  mime: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
  prompt: string;
  versions: PromptVersions;
  schema?: z.ZodType;
}
export interface TextProposalRequest { prompt: string; versions: PromptVersions; schema: z.ZodType }
export type ToolConversationMessage =
  { role: 'system' | 'user'; content: string } |
  { role: 'assistant'; content: string | null; toolCalls?: ReadonlyArray<{ id: string; name: ToolName; arguments: string }>; providerState?: unknown } |
  { role: 'tool'; callId: string; content: string };
export interface ToolConversationRequest {
  messages: ReadonlyArray<ToolConversationMessage>;
  tools: ReadonlyArray<{ name: ToolName; description: string }>;
  choice: 'auto' | 'required' | 'none';
  versions: PromptVersions;
}
export interface ProviderMetadata {
  requestId: string | null; mode: ProviderMode; model: string | null;
  providerVersion: string; promptVersion: string | null; schemaVersion: string | null;
  attempts: number; durationMs: number; providerRequestIds: string[];
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
}
export type ProviderResult =
  { ok: true; output: unknown; metadata: ProviderMetadata } |
  { ok: false; error: { code: ApiErrorCode; reason: ProviderFailureReason; message: string; retryable: boolean; retryAfterMs: number | null }; metadata: ProviderMetadata };
export interface ProviderTelemetry { outcome: 'success' | 'failure'; reason: ProviderFailureReason | null; metadata: ProviderMetadata }
export interface ProviderDependencies {
  environment?: () => Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
  clock?: ProviderClock;
  onTelemetry?: (event: ProviderTelemetry) => void;
}
export interface GroqProvider {
  requestImageExtraction(input: ImageExtractionRequest, context: ProviderContext): Promise<ProviderResult>;
  requestTextProposal(input: TextProposalRequest, context: ProviderContext): Promise<ProviderResult>;
  requestToolConversation(input: ToolConversationRequest, context: ProviderContext): Promise<ProviderResult>;
}

const realClock: ProviderClock = {
  now: () => Date.now(),
  setTimer: (milliseconds, callback) => {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
  },
};
const contextSchema = z.object({ requestId: z.uuid(), deadlineAtMs: z.number().int().finite() });
const versionsSchema = z.strictObject({ prompt: z.string().regex(VERSION_PATTERN), schema: z.string().regex(VERSION_PATTERN) });
const REPAIR_NOTICE = 'The prior response failed output validation. Return a complete response in the requested format using only the supplied inputs and tools. Preserve unknown fields; do not guess. Do not add commentary.';
const messageSchema = z.discriminatedUnion('role', [
  z.strictObject({ role: z.enum(['system', 'user']), content: z.string().max(LIMITS.inputCharacters) }),
  z.strictObject({ role: z.literal('tool'), callId: z.string().min(1).max(128), content: z.string().max(LIMITS.inputCharacters) }),
  z.strictObject({ role: z.literal('assistant'), content: z.string().max(LIMITS.inputCharacters).nullable(), toolCalls: z.array(z.strictObject({
    id: z.string().min(1).max(128), name: z.string(), arguments: z.string().max(LIMITS.inputCharacters),
  })).max(LIMITS.tools).optional(), providerState: z.unknown().optional() }),
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function requireInput(condition: unknown): asserts condition {
  if (!condition) throw new Error('invalid_request');
}
function isArray(value: unknown): boolean { return Array.isArray(value); }
function isToolName(value: string): value is ToolName { return Object.hasOwn(assistantToolSchemas, value); }
class InvalidModelOutput extends Error {}
function jsonObject(text: string): Record<string, unknown> {
  try { const value: unknown = JSON.parse(text); if (record(value)) return value; } catch { /* no provider content in error */ }
  throw new InvalidModelOutput();
}

function decode(data: unknown, mode: ProviderMode, schema?: z.ZodType, allowedTools: readonly ToolName[] = []): unknown {
  if (!record(data) || !Array.isArray(data.choices) || data.choices.length !== 1) throw new InvalidModelOutput();
  const choice: unknown = data.choices[0];
  if (!record(choice) || !record(choice.message)) throw new InvalidModelOutput();
  const message = choice.message;
  if (mode === 'tool') {
    const calls: unknown = message.tool_calls;
    if (choice.finish_reason === 'tool_calls' && Array.isArray(calls) && calls.length > 0 && calls.length <= LIMITS.tools) {
      const ids = new Set<string>();
      const toolCalls = calls.map((call: unknown) => {
        if (!record(call) || call.type !== 'function' || typeof call.id !== 'string' || !call.id || call.id.length > 128 || ids.has(call.id) || !record(call.function)) throw new InvalidModelOutput();
        ids.add(call.id);
        const fn = call.function;
        const name = allowedTools.find(tool => tool === fn.name);
        const args = fn.arguments;
        if (!name || typeof args !== 'string' || args.length > LIMITS.outputCharacters || !assistantToolSchemas[name].safeParse(jsonObject(args)).success) throw new InvalidModelOutput();
        return { id: call.id, name, arguments: args };
      });
      return { content: null, toolCalls };
    }
    if (choice.finish_reason !== 'stop' || (calls !== undefined && calls !== null && (!Array.isArray(calls) || calls.length !== 0)) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > LIMITS.outputCharacters) throw new InvalidModelOutput();
    return { content: message.content, toolCalls: [] };
  }
  if (choice.finish_reason !== 'stop' || typeof message.content !== 'string' || message.content.length > LIMITS.outputCharacters) throw new InvalidModelOutput();
  const value = jsonObject(message.content);
  try { if (schema && !schema.safeParse(value).success) throw new InvalidModelOutput(); } catch { throw new InvalidModelOutput(); }
  return value;
}

function safeRequestId(headers: Headers): string | null {
  const id = headers.get('x-request-id');
  return id && /^req_[A-Za-z0-9_-]{1,100}$/.test(id) ? id : null;
}
function tokens(data: unknown): ProviderMetadata['usage'] {
  if (!record(data) || !record(data.usage)) return null;
  const { prompt_tokens: input, completion_tokens: output, total_tokens: total } = data.usage;
  if (![input, output, total].every(value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000)) return null;
  return { inputTokens: Number(input), outputTokens: Number(output), totalTokens: Number(total) };
}

type StopReason = 'cancelled' | 'deadline_exceeded' | 'provider_timeout';
class Stopped extends Error {
  readonly reason: StopReason;
  constructor(reason: StopReason) { super(reason); this.reason = reason; }
}
function scope(parent: AbortSignal | undefined, milliseconds: number, timeoutReason: StopReason, clock: ProviderClock,
  parentReason: () => StopReason = () => 'cancelled') {
  const controller = new AbortController();
  let reason: StopReason | undefined;
  const stop = (value: StopReason) => { if (!controller.signal.aborted) { reason = value; controller.abort(); } };
  const onParent = () => stop(parentReason());
  parent?.addEventListener('abort', onParent, { once: true });
  const cancelTimer = clock.setTimer(Math.max(0, milliseconds), () => stop(timeoutReason));
  if (parent?.aborted) onParent();
  return { signal: controller.signal, reason: () => reason, dispose: () => { cancelTimer(); parent?.removeEventListener('abort', onParent); } };
}
function bounded<T>(pending: Promise<T>, active: ReturnType<typeof scope>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => { active.signal.removeEventListener('abort', onAbort); reject(new Stopped(active.reason() ?? 'cancelled')); };
    active.signal.addEventListener('abort', onAbort, { once: true });
    if (active.signal.aborted) onAbort();
    pending.then(value => { active.signal.removeEventListener('abort', onAbort); resolve(value); }, error => { active.signal.removeEventListener('abort', onAbort); reject(error); });
  });
}
async function pause(milliseconds: number, active: ReturnType<typeof scope>, clock: ProviderClock): Promise<void> {
  let cancelTimer = () => {};
  try { await bounded(new Promise<void>(resolve => { cancelTimer = clock.setTimer(milliseconds, resolve); }), active); }
  finally { cancelTimer(); }
}
function retryDelay(headers: Headers | undefined, now: number): number | null {
  if (!headers) return null;
  const seconds = headers.get('retry-after')?.trim();
  if (seconds) {
    const value = /^\d+(?:\.\d+)?$/.test(seconds) ? Number(seconds) * 1000 : Date.parse(seconds) - now;
    if (Number.isFinite(value) && value >= 0) return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(value));
  }
  const ms = headers.get('retry-after-ms');
  if (ms && /^\d+(?:\.\d+)?$/.test(ms)) return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(Number(ms)));
  const durations = ['x-ratelimit-reset-tokens', 'x-ratelimit-reset-requests'].flatMap(name => {
    const text = headers.get(name); if (!text) return [];
    const pieces = [...text.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d)/g)];
    if (!pieces.length || pieces.map(piece => piece[0]).join('') !== text) return [];
    const factors: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    const total = pieces.reduce((value, piece) => value + Number(piece[1]) * (factors[piece[2] ?? ''] ?? 0), 0);
    return Number.isFinite(total) ? [Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(total))] : [];
  });
  return durations.length ? Math.max(...durations) : null;
}
function failure(error: unknown, now: number): { reason: ProviderFailureReason; transient: boolean; repair: boolean; delay: number | null } {
  const result = (reason: ProviderFailureReason, transient = false, repair = false, delay: number | null = null) => ({ reason, transient, repair, delay });
  if (error instanceof Stopped) return result(error.reason, error.reason === 'provider_timeout', false, LIMITS.transientBackoffMs);
  if (error instanceof InvalidModelOutput || error instanceof SyntaxError) return result('invalid_model_output', false, true, 0);
  if (error instanceof Groq.APIConnectionTimeoutError) return result('provider_timeout', true, false, LIMITS.transientBackoffMs);
  if (error instanceof Groq.APIConnectionError) return result('provider_network', true, false, LIMITS.transientBackoffMs);
  if (error instanceof Groq.APIError) {
    if (error.status === 401 || error.status === 403) return result('provider_auth');
    if (error.status === 429) return result('provider_rate_limited', true, false, retryDelay(error.headers, now));
    if (error.status === 408) return result('provider_timeout', true, false, LIMITS.transientBackoffMs);
    if (error.status !== undefined && error.status >= 500) return result('provider_unavailable', true, false, LIMITS.transientBackoffMs);
    if (error.status === 400 && record(error.error) && ['json_validate_failed', 'tool_use_failed'].includes(String(error.error.code))) return result('invalid_model_output', false, true, 0);
    return result('provider_request');
  }
  return result('provider_unavailable');
}

// Configuration, SDK client and credentials stay private behind these three modes.
export function createGroqProvider(dependencies: ProviderDependencies = {}): GroqProvider {
  const clock = dependencies.clock ?? realClock;
  async function execute(mode: ProviderMode, versions: PromptVersions, context: ProviderContext,
    prepare: (model: string) => ChatCompletionCreateParamsNonStreaming, schema?: z.ZodType): Promise<ProviderResult> {
    const started = clock.now();
    const metadata: ProviderMetadata = {
      requestId: contextSchema.safeParse(context).success ? context.requestId : null, mode, model: null,
      providerVersion: PROVIDER_VERSION, promptVersion: versionsSchema.safeParse(versions).success ? versions.prompt : null,
      schemaVersion: versionsSchema.safeParse(versions).success ? versions.schema : null,
      attempts: 0, durationMs: 0, providerRequestIds: [], usage: null,
    };
    const finish = (result: ProviderResult): ProviderResult => {
      metadata.durationMs = Math.max(0, clock.now() - started);
      try { dependencies.onTelemetry?.({ outcome: result.ok ? 'success' : 'failure', reason: result.ok ? null : result.error.reason,
        metadata: { ...metadata, providerRequestIds: [...metadata.providerRequestIds], usage: metadata.usage ? { ...metadata.usage } : null } }); } catch { /* telemetry cannot turn success into failure */ }
      return result;
    };
    const fail = (reason: ProviderFailureReason, retryable = false, retryAfterMs: number | null = null): ProviderResult => finish({ ok: false, error: {
      code: reason === 'invalid_request' ? 'INVALID_INPUT' : 'UNAVAILABLE', reason,
      message: reason === 'invalid_request' ? 'Check the AI request inputs.' : 'AI processing is unavailable. Keep the source and try again when ready.', retryable, retryAfterMs,
    }, metadata });
    if (!contextSchema.safeParse(context).success || !versionsSchema.safeParse(versions).success || (context.signal !== undefined && !(context.signal instanceof AbortSignal)) || (context.budget !== undefined && (!record(context.budget) || typeof context.budget.take !== 'function'))) return fail('invalid_request');
    if (context.signal?.aborted) return fail('cancelled');
    if (clock.now() >= context.deadlineAtMs) return fail('deadline_exceeded', true);
    let configuration;
    try { configuration = readProviderConfiguration((dependencies.environment ?? (() => process.env))()); } catch { return fail('configuration_missing'); }
    if (!configuration) return fail('configuration_missing');
    if (versions.prompt.includes(configuration.apiKey) || versions.schema.includes(configuration.apiKey)) { metadata.promptVersion = null; metadata.schemaVersion = null; return fail('invalid_request'); }
    metadata.model = mode === 'image' ? configuration.visionModel : configuration.textModel;
    let body: ChatCompletionCreateParamsNonStreaming;
    try { body = prepare(metadata.model); } catch { return fail('invalid_request'); }
    if (JSON.stringify(body).includes(configuration.apiKey)) return fail('invalid_request');
    const allowedTools = body.tool_choice === 'none' ? [] : (body.tools ?? []).map(tool => tool.function?.name).filter((name): name is ToolName => typeof name === 'string' && isToolName(name));
    const client = new Groq({ apiKey: configuration.apiKey, baseURL: 'https://api.groq.com', maxRetries: 0, timeout: LIMITS.attemptTimeoutMs,
      logLevel: 'off', dangerouslyAllowBrowser: false, ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}) });
    if (context.signal?.aborted) return fail('cancelled');
    if (clock.now() >= context.deadlineAtMs) return fail('deadline_exceeded', true);
    const operation = scope(context.signal, context.deadlineAtMs - clock.now(), 'deadline_exceeded', clock);
    let repair = false;
    try {
      while (metadata.attempts < LIMITS.attempts) {
        if (operation.signal.aborted) return fail(operation.reason() ?? 'cancelled', operation.reason() === 'deadline_exceeded');
        if (clock.now() >= context.deadlineAtMs) return fail('deadline_exceeded', true);
        try {
          if (context.budget) {
            const allowed: unknown = context.budget.take();
            if (typeof allowed !== 'boolean') return fail('budget_unavailable', true);
            if (!allowed) return fail('budget_exhausted', true);
          }
        }
        catch { return fail('budget_unavailable', true); }
        if (context.signal?.aborted) return fail('cancelled');
        const remaining = context.deadlineAtMs - clock.now();
        if (remaining <= 0) return fail('deadline_exceeded', true);
        const attempt = scope(operation.signal, Math.min(LIMITS.attemptTimeoutMs, remaining), 'provider_timeout', clock, () => operation.reason() ?? 'cancelled');
        metadata.attempts++;
        try {
          const request = repair ? { ...body, messages: [...body.messages, { role: 'user' as const, content: REPAIR_NOTICE }] } : body;
          const result = await bounded(client.chat.completions.create(request, { maxRetries: 0, timeout: Math.min(LIMITS.attemptTimeoutMs, remaining), signal: attempt.signal }).withResponse(), attempt);
          const id = safeRequestId(result.response.headers); if (id && !id.includes(configuration.apiKey)) metadata.providerRequestIds.push(id);
          const usage = tokens(result.data);
          if (usage) metadata.usage = { inputTokens: (metadata.usage?.inputTokens ?? 0) + usage.inputTokens, outputTokens: (metadata.usage?.outputTokens ?? 0) + usage.outputTokens, totalTokens: (metadata.usage?.totalTokens ?? 0) + usage.totalTokens };
          const output = decode(result.data, mode, schema, allowedTools);
          if (body.tool_choice === 'required' && (!record(output) || !Array.isArray(output.toolCalls) || output.toolCalls.length === 0)) throw new InvalidModelOutput();
          if (JSON.stringify(output).includes(configuration.apiKey)) throw new InvalidModelOutput();
          if (context.signal?.aborted) return fail('cancelled');
          if (clock.now() >= context.deadlineAtMs || operation.signal.aborted) return fail('deadline_exceeded', true);
          return finish({ ok: true, output, metadata });
        } catch (error) {
          if (context.signal?.aborted) return fail('cancelled');
          if (clock.now() >= context.deadlineAtMs || operation.reason() === 'deadline_exceeded') return fail('deadline_exceeded', true);
          const detail = failure(error, clock.now());
          if (error instanceof Groq.APIError && error.headers) { const id = safeRequestId(error.headers); if (id && !id.includes(configuration.apiKey)) metadata.providerRequestIds.push(id); }
          if (metadata.attempts >= LIMITS.attempts || (!detail.transient && !detail.repair) || detail.delay === null || detail.delay >= context.deadlineAtMs - clock.now()) return fail(detail.reason, detail.transient, detail.reason === 'provider_rate_limited' ? detail.delay : null);
          repair = repair || detail.repair;
          attempt.dispose();
          try { if (detail.delay > 0) await pause(detail.delay, operation, clock); }
          catch { return fail(operation.reason() ?? 'cancelled', operation.reason() === 'deadline_exceeded'); }
        } finally { attempt.dispose(); }
      }
      return fail('budget_exhausted', true);
    } finally { operation.dispose(); }
  }

  return {
    requestImageExtraction: (input, context) => execute('image', input?.versions, context, model => {
      requireInput(sourceReferenceSchema.safeParse(input.source).success && input.source.rowNumber === null && input.bytes instanceof Uint8Array && input.bytes.byteLength > 0 && input.bytes.byteLength <= LIMITS.imageBytes);
      requireInput(identifyImage(input.bytes)?.mime === input.mime && ['image/png', 'image/jpeg'].includes(input.mime));
      requireInput(typeof input.prompt === 'string' && input.prompt.trim() && input.prompt.length + REPAIR_NOTICE.length <= LIMITS.inputCharacters);
      return { model, messages: [{ role: 'user', content: [{ type: 'text', text: input.prompt }, { type: 'image_url', image_url: { url: `data:${input.mime};base64,${Buffer.from(input.bytes).toString('base64')}` } }] }],
        response_format: { type: 'json_object' }, stream: false, temperature: 0, max_completion_tokens: LIMITS.outputTokens };
    }, input?.schema),
    requestTextProposal: (input, context) => execute('text', input?.versions, context, model => {
      requireInput(typeof input.prompt === 'string' && input.prompt.trim() && input.prompt.length <= LIMITS.inputCharacters);
      const schema = z.toJSONSchema(input.schema, { io: 'input' });
      requireInput(schema.type === 'object' && schema.additionalProperties === false && record(schema.properties) && Array.isArray(schema.required) && Object.keys(schema.properties).sort().join(',') === [...schema.required].sort().join(','));
      requireInput(JSON.stringify(schema).length + input.prompt.length + REPAIR_NOTICE.length <= LIMITS.inputCharacters);
      return { model, messages: [{ role: 'user', content: input.prompt }], response_format: { type: 'json_schema', json_schema: { name: input.versions.schema, schema, strict: true } },
        stream: false, temperature: 0, max_completion_tokens: LIMITS.outputTokens };
    }, input?.schema),
    requestToolConversation: (input, context) => execute('tool', input?.versions, context, model => {
      requireInput(['auto', 'required', 'none'].includes(input.choice) && isArray(input.tools) && input.tools.length > 0 && input.tools.length <= LIMITS.tools && new Set(input.tools.map(tool => tool.name)).size === input.tools.length);
      const tools = input.tools.map(tool => {
        requireInput(Object.hasOwn(assistantToolSchemas, tool.name) && typeof tool.description === 'string' && tool.description.length <= 1000);
        return { type: 'function' as const, function: { name: tool.name, description: tool.description, parameters: z.toJSONSchema(assistantToolSchemas[tool.name], { io: 'input' }) } };
      });
      requireInput(isArray(input.messages) && input.messages.length > 0 && input.messages.length + 1 <= LIMITS.messages && input.messages.every(message => messageSchema.safeParse(message).success));
      requireInput(JSON.stringify(input.messages).length + JSON.stringify(tools).length + REPAIR_NOTICE.length <= LIMITS.inputCharacters);
      const messages: ChatCompletionMessageParam[] = input.messages.map(message => {
        if (message.role === 'tool') return { role: 'tool', tool_call_id: message.callId, content: message.content };
        if (message.role === 'assistant') {
          requireInput(message.providerState === undefined);
          return { role: 'assistant', content: message.content,
            ...(message.toolCalls ? { tool_calls: message.toolCalls.map(call => ({ id: call.id, type: 'function' as const, function: { name: call.name, arguments: call.arguments } })) } : {}) };
        }
        return { role: message.role, content: message.content };
      });
      return { model, messages, tools, tool_choice: input.choice, stream: false, temperature: 0, max_completion_tokens: LIMITS.toolOutputTokens };
    }),
  };
}
