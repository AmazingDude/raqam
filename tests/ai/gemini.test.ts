import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documentFieldsSchema, categorySuggestionSchema, assistantToolSchemas } from '../../src/lib/contracts/schemas.ts';
import { createAIProvider, createGeminiProvider } from '../../src/lib/ai/index.ts';
import type { ProviderResult, ToolConversationRequest } from '../../src/lib/ai/index.ts';

const env = { GEMINI_API_KEY: 'synthetic-gemini-key', GEMINI_VISION_MODEL: 'gemini-test-vision', GEMINI_TEXT_MODEL: 'gemini-test-text' };
const versions = { prompt: 'test-prompt-v1', schema: 'test-schema-v1' };
const context = () => ({ requestId: 'c117073e-87be-4261-a510-7b1de22c0e16', deadlineAtMs: Date.now() + 5000 });
const document = { counterparty: 'Synthetic shop', date: '2026-10-09', totalMinor: null, currency: 'PKR', reference: null };
const image = { source: { sourceId: 'synthetic-source', rowNumber: null }, mime: 'image/png' as const, bytes: readFileSync('tests/ai/live/fixtures/receipts/receipt-clean.png'), prompt: 'Extract visible receipt fields as JSON.', versions, schema: documentFieldsSchema };
function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}
const completion = (parts: unknown[], extra: Record<string, unknown> = {}) => ({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts } }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8, totalTokenCount: 20 }, ...extra });
const failureReason = (result: ProviderResult) => { if (result.ok) assert.fail('Expected structured provider failure'); return result.error.reason; };

test('Gemini image request uses inline synthetic bytes, fixed origin, and validates unknowns', async () => {
  let sent: { url: string; init: RequestInit } | undefined;
  const provider = createGeminiProvider({ environment: () => env, fetch: async (input, init) => {
    sent = { url: String(input), init: init ?? {} };
    const body = JSON.parse(String(init?.body)) as { contents: Array<{ parts: Array<{ inlineData?: { mimeType?: string; data?: string } }> }>; generationConfig: { responseJsonSchema?: { properties?: Record<string, unknown> } } };
    assert.equal((JSON.parse(String(init?.body)) as { store?: boolean }).store, false);
    assert.equal(body.contents[0]?.parts[1]?.inlineData?.mimeType, 'image/png');
    assert.equal(body.contents[0]?.parts[1]?.inlineData?.data, Buffer.from(image.bytes).toString('base64'));
    assert.equal(body.generationConfig.responseJsonSchema?.properties?.totalMinor !== undefined, true);
    return response(completion([{ text: JSON.stringify(document) }]));
  } });
  const result = await provider.requestImageExtraction(image, context());
  assert.equal(result.ok, true);
  assert.deepEqual(result.output, document);
  assert.match(sent?.url ?? '', /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-test-vision:generateContent$/);
  assert.equal(new Headers(sent?.init.headers).get('x-goog-api-key'), env.GEMINI_API_KEY);
  assert.equal(result.metadata.model, env.GEMINI_VISION_MODEL);
  assert.equal(result.metadata.usage?.totalTokens, 20);
  assert.equal(JSON.stringify(result).includes(env.GEMINI_API_KEY), false);
});

test('Gemini text request maps supported schema and rechecks canonical Zod output', async () => {
  const proposal = { transactionId: 'synthetic-transaction', category: 'software_services', rationale: 'Synthetic subscription', status: 'proposed' };
  let sentBody: Record<string, unknown> | undefined;
  const provider = createGeminiProvider({ environment: () => env, fetch: async (_url, init) => {
    sentBody = JSON.parse(String(init?.body)); return response(completion([{ text: JSON.stringify(proposal) }]));
  } });
  const result = await provider.requestTextProposal({ prompt: 'Propose a category.', versions, schema: categorySuggestionSchema }, context());
  assert.equal(result.ok, true);
  assert.equal((sentBody?.generationConfig as { responseMimeType: string }).responseMimeType, 'application/json');
  assert.equal(sentBody?.responseFormat, undefined);
  const bad = createGeminiProvider({ environment: () => env, fetch: async () => response(completion([{ text: JSON.stringify({ ...proposal, status: 'accepted' }) }])) });
  assert.equal(failureReason(await bad.requestTextProposal({ prompt: 'Propose a category.', versions, schema: categorySuggestionSchema }, context())), 'invalid_model_output');
});

test('Gemini tool state round-trips with local tool results and never executes calls', async () => {
  let request = 0; let secondBody: Record<string, unknown> | undefined;
  const provider = createGeminiProvider({ environment: () => env, fetch: async (_url, init) => {
    request++;
    if (request === 1) return response(completion([{ functionCall: { name: 'get_cash_summary', id: 'call_1', args: { scope: 'valid_imported_cash' } }, thoughtSignature: 'synthetic-signature' }]));
    secondBody = JSON.parse(String(init?.body));
    return response(completion([{ text: 'Your synthetic cash total is PKR 31.00.' }]));
  } });
  const tools: ToolConversationRequest['tools'] = [{ name: 'get_cash_summary', description: 'Read synthetic cash summary.' }];
  const first = await provider.requestToolConversation({ messages: [{ role: 'user', content: 'What is cash total?' }], tools, choice: 'required', versions }, context());
  assert.equal(first.ok, true);
  if (!first.ok || !first.output || typeof first.output !== 'object') assert.fail('Expected a call proposal');
  const output = first.output as { content: string | null; toolCalls: Array<{ id: string; name: keyof typeof assistantToolSchemas; arguments: string }>; providerState: unknown };
  assert.equal(output.toolCalls[0]?.id, 'call_1');
  assert.equal(JSON.stringify(first.metadata).includes('synthetic-signature'), false);
  const second = await provider.requestToolConversation({ messages: [
    { role: 'user', content: 'What is cash total?' },
    { role: 'assistant', content: output.content, toolCalls: output.toolCalls, providerState: output.providerState },
    { role: 'tool', callId: 'call_1', content: JSON.stringify({ totalMinor: '3100', currency: 'PKR' }) },
  ], tools, choice: 'auto', versions }, context());
  assert.equal(second.ok, true); assert.equal(request, 2);
  const body = secondBody as { contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> };
  const modelParts = body.contents.find(item => item.role === 'model')?.parts[0];
  assert.equal((modelParts?.functionCall as { name: string }).name, 'get_cash_summary');
  assert.equal(modelParts?.thoughtSignature, 'synthetic-signature');
  assert.deepEqual((body.contents.at(-1)?.parts[0]?.functionResponse as { response: unknown }).response, { totalMinor: '3100', currency: 'PKR' });
});

test('Gemini tool mode rejects foreign calls and malformed continuation without network', async () => {
  let requests = 0;
  const provider = createGeminiProvider({ environment: () => env, fetch: async () => { requests++; return response(completion([{ text: 'never used' }])); } });
  const toolInput: ToolConversationRequest = { messages: [{ role: 'user', content: 'Read summary' }, { role: 'assistant', content: null, toolCalls: [{ id: 'c1', name: 'get_cash_summary', arguments: '{"scope":"valid_imported_cash"}' }], providerState: { provider: 'gemini', model: env.GEMINI_TEXT_MODEL, parts: [{ functionCall: { name: 'get_cash_summary', id: 'different', args: { scope: 'valid_imported_cash' } } }] } }, { role: 'tool', callId: 'c1', content: '{}' }], tools: [{ name: 'get_cash_summary', description: 'Read summary.' }], choice: 'auto', versions };
  assert.equal(failureReason(await provider.requestToolConversation(toolInput, context())), 'invalid_request');
  assert.equal(requests, 0);
});

test('Gemini provider has bounded transient retry and defers unusable rate limits', async () => {
  let requests = 0;
  const provider = createGeminiProvider({ environment: () => env, fetch: async () => { requests++; return requests === 1 ? response({ error: { message: 'private body' } }, 503) : response(completion([{ text: JSON.stringify(document) }])); } });
  const result = await provider.requestImageExtraction(image, context());
  assert.equal(result.ok, true); assert.equal(requests, 2);
  const limited = createGeminiProvider({ environment: () => env, fetch: async () => response({ error: { message: 'private' } }, 429) });
  const deferred = await limited.requestImageExtraction(image, context());
  assert.equal(failureReason(deferred), 'provider_rate_limited');
  if (!deferred.ok) assert.equal(deferred.error.retryAfterMs, null);
});

test('Gemini blocked responses are terminal and never trigger a repair retry', async () => {
  let requests = 0;
  const provider = createGeminiProvider({ environment: () => env, fetch: async () => {
    requests++; return response({ promptFeedback: { blockReason: 'SAFETY' } });
  } });
  const result = await provider.requestTextProposal({ prompt: 'Synthetic safe prompt', versions, schema: categorySuggestionSchema }, context());
  assert.equal(failureReason(result), 'provider_blocked'); assert.equal(requests, 1);
});

test('Gemini request deadline races a fetch implementation that ignores abort', async () => {
  let time = 0; let expire: (() => void) | undefined; let requests = 0;
  const provider = createGeminiProvider({ environment: () => env, clock: {
    now: () => time,
    setTimer: (milliseconds, callback) => {
      if (milliseconds === 100) expire = () => { time += milliseconds; callback(); };
      return () => {};
    },
  }, fetch: async () => { requests++; return new Promise<Response>(() => {}); } });
  const pending = provider.requestImageExtraction(image, { ...context(), deadlineAtMs: 100 });
  await new Promise(resolve => setImmediate(resolve)); expire?.();
  const result = await pending;
  assert.equal(failureReason(result), 'deadline_exceeded'); assert.equal(requests, 1);
});

test('provider selection defaults to Groq and selects Gemini explicitly without fallback', async () => {
  let url = '';
  const provider = createAIProvider({ environment: () => ({ ...env, AI_PROVIDER: 'gemini' }), fetch: async input => { url = String(input); return response(completion([{ text: JSON.stringify(document) }])); } });
  const selected = await provider.requestImageExtraction(image, context());
  assert.equal(selected.ok, true); assert.match(url, /generativelanguage\.googleapis\.com/);
  let groq = '';
  const fallback = createAIProvider({ environment: () => ({ ...env, AI_PROVIDER: 'groq', GROQ_API_KEY: 'groq-synthetic', GROQ_VISION_MODEL: 'qwen/qwen3.8-27b', GROQ_TEXT_MODEL: 'openai/gpt-oss-20b' }), fetch: async input => { groq = String(input); return response({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(document) } }] }); } });
  assert.equal((await fallback.requestImageExtraction(image, context())).ok, true); assert.match(groq, /api\.groq\.com/);
});

test('Gemini lazy configuration failures and invalid selector never call a provider', async () => {
  let requests = 0;
  const missing = createGeminiProvider({ environment: () => ({}), fetch: async () => { requests++; return response({}); } });
  assert.equal(failureReason(await missing.requestImageExtraction(image, context())), 'configuration_missing');
  const invalid = createAIProvider({ environment: () => ({ ...env, AI_PROVIDER: 'other' }), fetch: async () => { requests++; return response({}); } });
  assert.equal(failureReason(await invalid.requestImageExtraction(image, context())), 'configuration_missing');
  assert.equal(requests, 0);
});

test('Gemini accepts opaque header-safe keys and sends JSON Schema through the JSON Schema fields', async () => {
  let body: any;
  let sentKey: string | null = null;
  const dottedKey = 'AQ.synthetic.key-with_punctuation';
  const provider = createGeminiProvider({ environment: () => ({ ...env, GEMINI_API_KEY: dottedKey }), fetch: async (_url, init) => {
    body = JSON.parse(String(init?.body)); sentKey = new Headers(init?.headers).get('x-goog-api-key');
    return response(completion([{ text: JSON.stringify({ transactionId: 'synthetic-transaction', category: 'software_services', rationale: 'Synthetic test', status: 'proposed' }) }]));
  } });
  const result = await provider.requestTextProposal({ prompt: 'Propose one synthetic category.', versions, schema: categorySuggestionSchema }, context());
  assert.equal(result.ok, true);
  assert.equal(sentKey, dottedKey);
  assert.ok((body as { generationConfig: { responseJsonSchema?: unknown } }).generationConfig.responseJsonSchema);
  assert.equal((body as { generationConfig: { responseSchema?: unknown } }).generationConfig.responseSchema, undefined);
});

test('Gemini function declarations use parametersJsonSchema', async () => {
  let body: any;
  const provider = createGeminiProvider({ environment: () => env, fetch: async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return response(completion([{ text: 'Synthetic answer.' }]));
  } });
  const tools: ToolConversationRequest['tools'] = [{ name: 'get_cash_summary', description: 'Read synthetic summary.' }];
  const result = await provider.requestToolConversation({ messages: [{ role: 'user', content: 'Read the synthetic summary.' }], tools, choice: 'auto', versions }, context());
  assert.equal(result.ok, true);
  const declaration = (body as { tools: Array<{ functionDeclarations: Array<{ parameters?: unknown; parametersJsonSchema?: unknown }> }> }).tools[0]?.functionDeclarations[0];
  assert.ok(declaration?.parametersJsonSchema);
  assert.equal(declaration?.parameters, undefined);
});

test('Gemini rejects malformed or oversized tool envelopes before spending a request', async () => {
  let requests = 0;
  const provider = createGeminiProvider({ environment: () => env, fetch: async () => { requests++; return response(completion([{ text: 'Synthetic answer.' }])); } });
  const tools: ToolConversationRequest['tools'] = [{ name: 'get_cash_summary', description: 'Read summary.' }];
  const oversized = await provider.requestToolConversation({ messages: [{ role: 'user', content: 'x'.repeat(32_001) }], tools, choice: 'auto', versions }, context());
  assert.equal(failureReason(oversized), 'invalid_request');
  const malformed = await provider.requestToolConversation({ messages: [{ role: 'system', content: 4 }], tools, choice: 'auto', versions } as unknown as ToolConversationRequest, context());
  assert.equal(failureReason(malformed), 'invalid_request');
  assert.equal(requests, 0);
});

test('Gemini enforces required and disabled tool choices against returned behavior', async () => {
  const tools: ToolConversationRequest['tools'] = [{ name: 'get_cash_summary', description: 'Read summary.' }];
  const noTool = createGeminiProvider({ environment: () => env, fetch: async () => response(completion([{ text: 'Synthetic answer.' }])) });
  assert.equal(failureReason(await noTool.requestToolConversation({ messages: [{ role: 'user', content: 'Read summary.' }], tools, choice: 'required', versions }, context())), 'invalid_model_output');
  const unexpectedTool = createGeminiProvider({ environment: () => env, fetch: async () => response(completion([{ functionCall: { name: 'get_cash_summary', id: 'call-1', args: { scope: 'valid_imported_cash' } } }])) });
  assert.equal(failureReason(await unexpectedTool.requestToolConversation({ messages: [{ role: 'user', content: 'Do not use a tool.' }], tools, choice: 'none', versions }, context())), 'invalid_model_output');
});
