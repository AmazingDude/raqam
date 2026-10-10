import 'server-only';
import { z } from 'zod';
import type {
  GroqProvider, ImageExtractionRequest, ProviderContext, ProviderDependencies,
  ProviderFailureReason, ProviderMetadata, ProviderResult, PromptVersions,
  TextProposalRequest, ToolConversationRequest, ToolName,
} from './provider.ts';
import { assistantToolSchemas, sourceReferenceSchema } from '../contracts/schemas.ts';
import { identifyImage } from '../server/uploads.ts';
import { PROVIDER_LIMITS as LIMITS, VERSION_PATTERN } from './config.ts';
import { isGeminiModel, readGeminiConfiguration } from './gemini-config.ts';

const GEMINI_ORIGIN = 'https://generativelanguage.googleapis.com/v1beta/models/';
export const GEMINI_PROVIDER_VERSION = 'gemini-provider-v1';
const API_ERROR = z.object({ error: z.object({ code: z.number().optional(), message: z.string().optional(), status: z.string().optional(), details: z.array(z.unknown()).optional() }).passthrough() }).passthrough();
const continuationSchema = z.strictObject({
  provider: z.literal('gemini'), model: z.string().refine(isGeminiModel),
  parts: z.array(z.unknown()).min(1).max(LIMITS.tools + 2),
});
const geminiPartSchema = z.strictObject({
  text: z.string().max(LIMITS.outputCharacters).optional(),
  thought: z.boolean().optional(),
  functionCall: z.strictObject({ name: z.string().min(1).max(128), args: z.record(z.string(), z.unknown()), id: z.string().min(1).max(128).optional() }).optional(),
  thoughtSignature: z.string().max(8192).optional(),
}).refine(part => part.text !== undefined || part.functionCall !== undefined, 'Unsupported Gemini continuation part');
const contextSchema = z.object({ requestId: z.uuid(), deadlineAtMs: z.number().int().finite() });
const versionsSchema = z.strictObject({ prompt: z.string().regex(VERSION_PATTERN), schema: z.string().regex(VERSION_PATTERN) });
const toolRequestSchema = z.strictObject({
  messages: z.array(z.discriminatedUnion('role', [
    z.strictObject({ role: z.literal('system'), content: z.string().max(LIMITS.inputCharacters) }),
    z.strictObject({ role: z.literal('user'), content: z.string().max(LIMITS.inputCharacters) }),
    z.strictObject({ role: z.literal('assistant'), content: z.string().max(LIMITS.inputCharacters).nullable(), toolCalls: z.array(z.strictObject({ id: z.string().min(1).max(128), name: z.string().min(1).max(128), arguments: z.string().max(LIMITS.inputCharacters) })).max(LIMITS.tools).optional(), providerState: z.unknown().optional() }),
    z.strictObject({ role: z.literal('tool'), callId: z.string().min(1).max(128), content: z.string().max(LIMITS.inputCharacters) }),
  ])).min(1).max(LIMITS.messages),
  tools: z.array(z.strictObject({ name: z.string().min(1).max(128), description: z.string().min(1).max(1000) })).min(1).max(LIMITS.tools),
  choice: z.enum(['auto', 'required', 'none']),
  versions: versionsSchema,
});
const REPAIR = 'Return the same response in the required format. Do not guess missing values. Return only the requested content.';

// Gemini 3 reasoning tokens count toward maxOutputTokens. A small structured
// extraction can otherwise spend the entire output cap on default reasoning
// and return MAX_TOKENS with no candidate text. Keep workflow proposals fast,
// with deterministic validation remaining in application code.
function boundedThinking(model: string): Record<string, unknown> {
  if (/^gemini-3(?:[.-]|$)/i.test(model)) return { thinkingConfig: { thinkingLevel: 'low' } };
  if (/^gemini-2\.5(?:[.-]|$)/i.test(model)) return { thinkingConfig: { thinkingBudget: 512 } };
  return {};
}

function isToolName(value: string): value is ToolName { return Object.hasOwn(assistantToolSchemas, value); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function geminiJsonSchema(value: unknown, options: { omitMaxItems?: boolean } = {}): Record<string, unknown> {
  if (!record(value)) throw new Error('unsupported_schema');
  if (Array.isArray(value.anyOf)) {
    if (value.anyOf.length !== 2) throw new Error('unsupported_schema');
    const nullable = value.anyOf.find(item => record(item) && item.type === 'null');
    const concrete = value.anyOf.find(item => !(record(item) && item.type === 'null'));
    if (!nullable || !concrete) throw new Error('unsupported_schema');
    const converted = geminiJsonSchema(concrete, options);
    const type = converted.type;
    if (typeof type !== 'string') throw new Error('unsupported_schema');
    return { ...converted, type: [type, 'null'] };
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    // Gemini's documented JSON Schema subset omits `pattern`; server-side Zod
    // revalidation remains authoritative for those constraints.
    if (key === '$schema' || key === 'default' || key === 'minLength' || key === 'maxLength' || key === 'pattern') continue;
    if (key === 'const') { result.enum = [item]; continue; }
    if (key === 'properties' && record(item)) {
      result.properties = Object.fromEntries(Object.entries(item).map(([name, schema]) => [name, geminiJsonSchema(schema, options)]));
      continue;
    }
    if (key === 'items') { result.items = geminiJsonSchema(item, options); continue; }
    // Keep the provider schema compact; Zod still enforces the original bound after decoding.
    if (key === 'maxItems' && options.omitMaxItems) continue;
    if (key === 'anyOf' || key === 'oneOf' || key === 'allOf' || key === '$ref' || key === '$defs') throw new Error('unsupported_schema');
    if (!['type', 'required', 'additionalProperties', 'enum', 'format', 'minimum', 'maximum', 'minItems', 'maxItems', 'prefixItems', 'title', 'description'].includes(key)) throw new Error('unsupported_schema');
    result[key] = item;
  }
  if (Array.isArray(result.prefixItems)) result.prefixItems = result.prefixItems.map(item => geminiJsonSchema(item, options));
  return result;
}
function bounded<T>(pending: Promise<T>, signal: AbortSignal, reason: () => ProviderFailureReason | null): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => { signal.removeEventListener('abort', onAbort); reject(Object.assign(new Error('bounded_abort'), { boundedReason: reason() ?? 'cancelled' })); };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    pending.then(value => { signal.removeEventListener('abort', onAbort); resolve(value); }, error => { signal.removeEventListener('abort', onAbort); reject(error); });
  });
}
function parseObject(text: unknown): Record<string, unknown> {
  if (typeof text !== 'string' || text.length > LIMITS.outputCharacters) throw new Error('invalid_model_output');
  try { const parsed: unknown = JSON.parse(text); if (record(parsed)) return parsed; } catch { /* do not retain provider response text */ }
  throw new Error('invalid_model_output');
}
function safeId(headers: Headers, key: string): string[] {
  const id = headers.get('x-request-id');
  return id && !id.includes(key) && /^req_[A-Za-z0-9_-]{1,100}$/.test(id) ? [id] : [];
}
function usage(data: unknown): ProviderMetadata['usage'] {
  if (!record(data) || !record(data.usageMetadata)) return null;
  const input = data.usageMetadata.promptTokenCount;
  const output = data.usageMetadata.candidatesTokenCount;
  const total = data.usageMetadata.totalTokenCount;
  if (![input, output, total].every(value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000)) return null;
  return { inputTokens: Number(input), outputTokens: Number(output), totalTokens: Number(total) };
}
function retryDelay(headers: Headers, error: unknown): number | null {
  const retryAfter = headers.get('retry-after');
  if (retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter)) return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(Number(retryAfter) * 1000));
  const parsed = API_ERROR.safeParse(error);
  const detail = parsed.success ? parsed.data.error.details?.find(item => record(item) && item['@type'] === 'type.googleapis.com/google.rpc.RetryInfo') : undefined;
  if (record(detail) && typeof detail.retryDelay === 'string') {
    const match = /^(\d+(?:\.\d+)?)s$/.exec(detail.retryDelay);
    if (match) return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(Number(match[1]) * 1000));
  }
  return null;
}
function safeFailureReason(status: number, headers: Headers, data: unknown, network: boolean): { reason: ProviderFailureReason; delay: number | null; retryable: boolean } {
  if (network) return { reason: 'provider_network', delay: LIMITS.transientBackoffMs, retryable: true };
  if (status === 401 || status === 403) return { reason: 'provider_auth', delay: null, retryable: false };
  if (status === 429) return { reason: 'provider_rate_limited', delay: retryDelay(headers, data), retryable: true };
  if (status === 408 || status >= 500) return { reason: status === 408 ? 'provider_timeout' : 'provider_unavailable', delay: LIMITS.transientBackoffMs, retryable: true };
  return { reason: 'provider_request', delay: null, retryable: false };
}

export function createGeminiProvider(dependencies: ProviderDependencies = {}): GroqProvider {
  const now = dependencies.clock?.now ?? Date.now;
  const setTimer = dependencies.clock?.setTimer ?? ((milliseconds: number, callback: () => void) => {
    const timer = setTimeout(callback, milliseconds); return () => clearTimeout(timer);
  });

  async function execute(mode: 'image' | 'text' | 'tool', versions: PromptVersions, context: ProviderContext,
    makeRequest: (model: string) => { body: Record<string, unknown>; schema?: z.ZodType }): Promise<ProviderResult> {
    const started = now();
    const env = (() => { try { return (dependencies.environment ?? (() => process.env))(); } catch { return {}; } })();
    const configuration = readGeminiConfiguration(env);
    const model = configuration ? (mode === 'image' ? configuration.visionModel : configuration.textModel) : null;
    const metadata: ProviderMetadata = {
      requestId: contextSchema.safeParse(context).success ? context.requestId : null, mode, model: model && isGeminiModel(model) ? model : null,
      providerVersion: GEMINI_PROVIDER_VERSION, promptVersion: versionsSchema.safeParse(versions).success ? versions.prompt : null,
      schemaVersion: versionsSchema.safeParse(versions).success ? versions.schema : null,
      attempts: 0, durationMs: 0, providerRequestIds: [], usage: null,
    };
    const finish = (result: ProviderResult): ProviderResult => {
      metadata.durationMs = Math.max(0, now() - started);
      try { dependencies.onTelemetry?.({ outcome: result.ok ? 'success' : 'failure', reason: result.ok ? null : result.error.reason,
        metadata: { ...metadata, providerRequestIds: [...metadata.providerRequestIds], usage: metadata.usage ? { ...metadata.usage } : null } }); } catch { /* telemetry is optional */ }
      return result;
    };
    const fail = (reason: ProviderFailureReason, retryable = false, retryAfterMs: number | null = null): ProviderResult => finish({ ok: false, error: {
      code: reason === 'invalid_request' ? 'INVALID_INPUT' : 'UNAVAILABLE', reason,
      message: reason === 'invalid_request' ? 'Check the AI request inputs.' : 'AI processing is unavailable. Keep the source and try again when ready.', retryable, retryAfterMs,
    }, metadata });
    if (!contextSchema.safeParse(context).success || !versionsSchema.safeParse(versions).success || (context.signal !== undefined && !(context.signal instanceof AbortSignal)) || (context.budget !== undefined && (!record(context.budget) || typeof context.budget.take !== 'function'))) return fail('invalid_request');
    if (context.signal?.aborted) return fail('cancelled');
    if (now() >= context.deadlineAtMs) return fail('deadline_exceeded', true);
    const key = configuration?.apiKey;
    if (!key || !model) return fail('configuration_missing');
    let request: { body: Record<string, unknown>; schema?: z.ZodType };
    try { request = makeRequest(model); } catch { return fail('invalid_request'); }
    if (JSON.stringify(request.body).includes(key)) return fail('invalid_request');

    const operationController = new AbortController();
    let stopReason: ProviderFailureReason | null = null;
    const stop = (reason: ProviderFailureReason) => { if (!operationController.signal.aborted) { stopReason = reason; operationController.abort(); } };
    const parentAbort = () => stop('cancelled');
    context.signal?.addEventListener('abort', parentAbort, { once: true });
    const cancelDeadline = setTimer(Math.max(0, context.deadlineAtMs - now()), () => stop('deadline_exceeded'));
    if (context.signal?.aborted) parentAbort();
    const pause = async (milliseconds: number) => new Promise<boolean>(resolve => {
      let settled = false;
      const done = (value: boolean) => { if (!settled) { settled = true; cancel(); operationController.signal.removeEventListener('abort', abort); resolve(value); } };
      const cancel = setTimer(milliseconds, () => done(true));
      const abort = () => done(false);
      operationController.signal.addEventListener('abort', abort, { once: true });
      if (operationController.signal.aborted) abort();
    });

    let repair = false;
    try {
      while (metadata.attempts < LIMITS.attempts) {
        if (operationController.signal.aborted) return fail(stopReason ?? 'cancelled', stopReason === 'deadline_exceeded');
        if (now() >= context.deadlineAtMs) return fail('deadline_exceeded', true);
        if (context.budget) {
          try { const allowance: unknown = context.budget.take(); if (typeof allowance !== 'boolean') return fail('budget_unavailable', true); if (!allowance) return fail('budget_exhausted', true); }
          catch { return fail('budget_unavailable', true); }
        }
        const remaining = context.deadlineAtMs - now();
        if (remaining <= 0) return fail('deadline_exceeded', true);
        const attemptController = new AbortController();
        let attemptReason: ProviderFailureReason | null = null;
        const abortAttempt = () => { attemptReason = stopReason ?? 'cancelled'; attemptController.abort(); };
        operationController.signal.addEventListener('abort', abortAttempt, { once: true });
        const cancelAttempt = setTimer(Math.min(LIMITS.attemptTimeoutMs, remaining), () => { attemptReason = 'provider_timeout'; attemptController.abort(); });
        metadata.attempts++;
        try {
          const body = repair ? { ...request.body, contents: [...(request.body.contents as Array<{ role: string; parts: unknown[] }>), { role: 'user', parts: [{ text: REPAIR }] }] } : request.body;
          body.store = false;
          const fetcher = dependencies.fetch ?? globalThis.fetch;
          const response = await bounded(fetcher(`${GEMINI_ORIGIN}${encodeURIComponent(model)}:generateContent`, {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify(body), signal: attemptController.signal,
          }), attemptController.signal, () => attemptReason);
          const raw: unknown = await bounded(response.json().catch(() => null), attemptController.signal, () => attemptReason);
          if (attemptReason) throw Object.assign(new Error('bounded_abort'), { boundedReason: attemptReason });
          const safeIds = safeId(response.headers, key); metadata.providerRequestIds.push(...safeIds);
          const actualUsage = usage(raw);
          if (actualUsage) metadata.usage = { inputTokens: (metadata.usage?.inputTokens ?? 0) + actualUsage.inputTokens, outputTokens: (metadata.usage?.outputTokens ?? 0) + actualUsage.outputTokens, totalTokens: (metadata.usage?.totalTokens ?? 0) + actualUsage.totalTokens };
          if (!response.ok) {
            const issue = safeFailureReason(response.status, response.headers, raw, false);
            if (metadata.attempts >= LIMITS.attempts || !issue.retryable || issue.delay === null || issue.delay >= context.deadlineAtMs - now()) return fail(issue.reason, issue.retryable, issue.reason === 'provider_rate_limited' ? issue.delay : null);
            repair = false;
            cancelAttempt(); operationController.signal.removeEventListener('abort', abortAttempt);
            if (issue.delay > 0 && !(await pause(issue.delay))) return fail(stopReason ?? 'cancelled', stopReason === 'deadline_exceeded');
            continue;
          }
          if (record(raw) && record(raw.promptFeedback) && raw.promptFeedback.blockReason) return fail('provider_blocked');
          if (!record(raw) || !Array.isArray(raw.candidates) || raw.candidates.length !== 1) throw new Error('invalid_model_output');
          const candidate: unknown = raw.candidates[0];
          if (!record(candidate)) throw new Error('invalid_model_output');
          if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') return fail('provider_blocked');
          if (candidate.finishReason !== 'STOP') throw new Error('invalid_model_output');
          if (!record(candidate.content) || !Array.isArray(candidate.content.parts)) throw new Error('invalid_model_output');
          const parts: unknown[] = candidate.content.parts;
          if (parts.length > LIMITS.tools + 2 || parts.some(part => !record(part)) || !geminiPartSchema.array().max(LIMITS.tools + 2).safeParse(parts).success) throw new Error('invalid_model_output');
          const safeParts = parts as Record<string, unknown>[];
          const functionParts = safeParts.filter(part => Object.hasOwn(part, 'functionCall'));
          let output: unknown;
          if (mode === 'tool') {
            const text = safeParts.flatMap(part => typeof part.text === 'string' ? [part.text] : []).join('');
            if (functionParts.length) {
              if ((request.body.toolConfig as { functionCallingConfig: { mode: string } }).functionCallingConfig.mode === 'NONE') throw new Error('invalid_model_output');
              const allowed = (request.body.tools as Array<{ functionDeclarations: Array<{ name: string }> }>).flatMap(tool => tool.functionDeclarations.map(fn => fn.name));
              const ids = new Set<string>();
              const toolCalls = functionParts.map(part => {
                const call = part.functionCall;
                if (!record(call) || typeof call.name !== 'string' || !allowed.includes(call.name) || !isToolName(call.name) || typeof call.id !== 'string' || !call.id || call.id.length > 128 || ids.has(call.id) || !record(call.args) || !assistantToolSchemas[call.name].safeParse(call.args).success) throw new Error('invalid_model_output');
                ids.add(call.id);
                return { id: call.id, name: call.name, arguments: JSON.stringify(call.args) };
              });
              output = { content: text || null, toolCalls, providerState: { provider: 'gemini', model, parts } };
            } else {
              if ((request.body.toolConfig as { functionCallingConfig: { mode: string } }).functionCallingConfig.mode === 'ANY') throw new Error('invalid_model_output');
              if (!text || text.length > LIMITS.outputCharacters) throw new Error('invalid_model_output');
              output = { content: text, toolCalls: [] };
            }
          } else {
            if (functionParts.length) throw new Error('invalid_model_output');
            const text = safeParts.flatMap(part => typeof part.text === 'string' ? [part.text] : []).join('');
            const object = parseObject(text);
            if (request.schema && !request.schema.safeParse(object).success) throw new Error('invalid_model_output');
            output = object;
          }
          if (JSON.stringify(output).includes(key)) throw new Error('invalid_model_output');
          if (context.signal?.aborted) return fail('cancelled');
          if (now() >= context.deadlineAtMs || operationController.signal.aborted) return fail(stopReason ?? 'deadline_exceeded', true);
          return finish({ ok: true, output, metadata });
        } catch (error) {
          if (context.signal?.aborted) return fail('cancelled');
          if (now() >= context.deadlineAtMs || stopReason === 'deadline_exceeded') return fail('deadline_exceeded', true);
          if (attemptReason === 'provider_timeout') {
            if (metadata.attempts >= LIMITS.attempts || LIMITS.transientBackoffMs >= context.deadlineAtMs - now()) return fail('provider_timeout', true);
            repair = false; cancelAttempt(); operationController.signal.removeEventListener('abort', abortAttempt);
            if (!(await pause(LIMITS.transientBackoffMs))) return fail(stopReason ?? 'cancelled', stopReason === 'deadline_exceeded');
            continue;
          }
          if (error instanceof Error && error.message === 'invalid_model_output') {
            if (metadata.attempts >= LIMITS.attempts) return fail('invalid_model_output');
            repair = true;
            cancelAttempt(); operationController.signal.removeEventListener('abort', abortAttempt);
            continue;
          }
          if (attemptController.signal.aborted) return fail('cancelled');
          const issue = safeFailureReason(0, new Headers(), null, true);
          if (metadata.attempts >= LIMITS.attempts || issue.delay === null || issue.delay >= context.deadlineAtMs - now()) return fail(issue.reason, true);
          repair = false; cancelAttempt(); operationController.signal.removeEventListener('abort', abortAttempt);
          if (!(await pause(issue.delay))) return fail(stopReason ?? 'cancelled', stopReason === 'deadline_exceeded');
        } finally { cancelAttempt(); operationController.signal.removeEventListener('abort', abortAttempt); }
      }
      return fail('budget_exhausted', true);
    } finally { cancelDeadline(); context.signal?.removeEventListener('abort', parentAbort); }
  }

  return {
    requestImageExtraction: (input: ImageExtractionRequest, context: ProviderContext) => execute('image', input?.versions, context, model => {
      if (!sourceReferenceSchema.safeParse(input.source).success || input.source.rowNumber !== null || !(input.bytes instanceof Uint8Array) || input.bytes.length === 0 || input.bytes.length > LIMITS.imageBytes || identifyImage(input.bytes)?.mime !== input.mime || !['image/png', 'image/jpeg'].includes(input.mime) || !input.prompt.trim() || input.prompt.length + REPAIR.length > LIMITS.inputCharacters) throw new Error('invalid_request');
      return { body: { model, contents: [{ role: 'user', parts: [{ text: input.prompt }, { inlineData: { mimeType: input.mime, data: Buffer.from(input.bytes).toString('base64') } }] }], generationConfig: { ...boundedThinking(model), responseMimeType: 'application/json', ...(input.schema ? { responseJsonSchema: geminiJsonSchema(z.toJSONSchema(input.schema, { io: 'input' })) } : {}), maxOutputTokens: LIMITS.outputTokens, temperature: 0 } }, ...(input.schema ? { schema: input.schema } : {}) };
    }),
    requestTextProposal: (input: TextProposalRequest, context: ProviderContext) => execute('text', input?.versions, context, model => {
      if (!input.prompt.trim() || input.prompt.length > LIMITS.inputCharacters) throw new Error('invalid_request');
      const schema = geminiJsonSchema(z.toJSONSchema(input.schema, { io: 'input' }), { omitMaxItems: true });
      if (schema.type !== 'object' || schema.additionalProperties !== false || !record(schema.properties) || !Array.isArray(schema.required) || Object.keys(schema.properties).sort().join(',') !== [...schema.required].sort().join(',') || JSON.stringify(schema).length + input.prompt.length + REPAIR.length > LIMITS.inputCharacters) throw new Error('invalid_request');
      return { body: { model, contents: [{ role: 'user', parts: [{ text: input.prompt }] }], generationConfig: { ...boundedThinking(model), responseMimeType: 'application/json', responseJsonSchema: schema, maxOutputTokens: LIMITS.outputTokens, temperature: 0 } }, schema: input.schema };
    }),
    requestToolConversation: (input: ToolConversationRequest, context: ProviderContext) => execute('tool', input?.versions, context, model => {
      const validated = toolRequestSchema.safeParse(input);
      if (!validated.success || new Set(input.tools.map(tool => tool.name)).size !== input.tools.length || input.messages.length + 1 > LIMITS.messages) throw new Error('invalid_request');
      const messages = validated.data.messages;
      const tools = validated.data.tools;
      if (JSON.stringify({ messages, tools }).length + REPAIR.length > LIMITS.inputCharacters) throw new Error('invalid_request');
      const declarations = tools.map(tool => {
        const name: string = tool.name;
        if (!isToolName(name) || !tool.description || tool.description.length > 1000) throw new Error('invalid_request');
        return { name, description: tool.description, parametersJsonSchema: geminiJsonSchema(z.toJSONSchema(assistantToolSchemas[name], { io: 'input' })) };
      });
      const stateMessage = [...messages].reverse().find(message => message.role === 'assistant' && message.providerState !== undefined);
      let contents: unknown[];
      if (stateMessage?.role === 'assistant') {
        const state = continuationSchema.safeParse(stateMessage.providerState);
        if (!state.success || state.data.model !== model || !geminiPartSchema.array().max(LIMITS.tools + 2).safeParse(state.data.parts).success) throw new Error('invalid_request');
        const knownCalls = new Map<string, string>();
        contents = [];
        for (const message of messages) {
          if (message.role === 'system') continue;
          if (message.role === 'user') { contents.push({ role: 'user', parts: [{ text: message.content }] }); continue; }
          if (message.role === 'assistant') {
            if (message.providerState === undefined) {
              if (message.toolCalls?.length) throw new Error('invalid_request');
              contents.push({ role: 'model', parts: [{ text: message.content ?? '' }] });
              continue;
            }
            const state = continuationSchema.safeParse(message.providerState);
            if (!state.success || state.data.model !== model || !geminiPartSchema.array().max(LIMITS.tools + 2).safeParse(state.data.parts).success) throw new Error('invalid_request');
            const hasCalls = state.data.parts.some(part => record(part) && record(part.functionCall));
            if (hasCalls && !message.toolCalls?.length) throw new Error('invalid_request');
            for (const call of message.toolCalls ?? []) {
              if (!isToolName(call.name) || !state.data.parts.some(part => record(part) && record(part.functionCall) && part.functionCall.id === call.id && part.functionCall.name === call.name)) throw new Error('invalid_request');
              knownCalls.set(call.id, call.name);
            }
            contents.push({ role: 'model', parts: state.data.parts });
            continue;
          }
          const name = knownCalls.get(message.callId);
          if (!name || message.content.length > LIMITS.inputCharacters) throw new Error('invalid_request');
          let response: unknown;
          try { response = JSON.parse(message.content); } catch { response = { result: message.content }; }
          if (!record(response) || JSON.stringify(response).length > LIMITS.inputCharacters) throw new Error('invalid_request');
          contents.push({ role: 'user', parts: [{ functionResponse: { name, id: message.callId, response } }] });
        }
        if (!messages.some(message => message.role === 'tool')) throw new Error('invalid_request');
      } else {
        contents = messages.filter(item => item.role !== 'tool' && item.role !== 'system').map(item => item.role === 'assistant'
          ? { role: 'model', parts: [{ text: item.content ?? '' }] } : { role: 'user', parts: [{ text: item.content }] });
        if (messages.some(item => item.role === 'tool')) throw new Error('invalid_request');
      }
      const functionCallingConfig = validated.data.choice === 'required' ? { mode: 'ANY', allowedFunctionNames: tools.map(tool => tool.name) } : { mode: validated.data.choice === 'none' ? 'NONE' : 'AUTO' };
      const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
      return { body: { model, contents, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), tools: [{ functionDeclarations: declarations }], toolConfig: { functionCallingConfig }, generationConfig: { ...boundedThinking(model), maxOutputTokens: LIMITS.toolOutputTokens, temperature: 0 } } };
    }),
  };
}
