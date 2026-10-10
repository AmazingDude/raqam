import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documentFieldsSchema, categorySuggestionSchema } from '../../src/lib/contracts/schemas.ts';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { createAIProvider, createGroqProvider } from '../../src/lib/ai/index.ts';
import type { ProviderClock, ProviderResult, ProviderTelemetry, ToolConversationRequest } from '../../src/lib/ai/index.ts';

const env = { GROQ_API_KEY: 'synthetic-provider-test-key', GROQ_VISION_MODEL: 'qwen/qwen3.8-27b', GROQ_TEXT_MODEL: 'openai/gpt-oss-20b' };
const versions = { prompt: 'test-prompt-v1', schema: 'test-schema-v1' };
const context = () => ({ requestId: 'c117073e-87be-4261-a510-7b1de22c0e16', deadlineAtMs: Date.now() + 5000 });
const document = { counterparty: 'Synthetic shop', date: '2026-10-09', totalMinor: null, currency: 'PKR', reference: null };
const image = { source: { sourceId: 'synthetic-source', rowNumber: null }, mime: 'image/png' as const,
  bytes: readFileSync('tests/ai/live/fixtures/receipts/receipt-clean.png'), prompt: 'Extract observed fields as JSON. Preserve unknowns.', versions, schema: documentFieldsSchema };

function completion(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(status === 200 ? {
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(value) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  } : { error: { message: 'private provider error', type: 'synthetic' } }), { status, headers: { 'content-type': 'application/json', ...headers } });
}

test('OpenAI BYOK uses the authenticated OpenAI chat endpoint and validates the structured result',async()=>{
  const env={AI_PROVIDER:'openai',OPENAI_API_KEY:'synthetic-openai-key',OPENAI_TEXT_MODEL:'gpt-test',OPENAI_VISION_MODEL:'gpt-vision-test'};
  let sentUrl='',sentHeaders=new Headers();
  const provider=createAIProvider({environment:()=>env,fetch:async(input,init)=>{sentUrl=String(input);sentHeaders=new Headers(init?.headers);const body=JSON.parse(String(init?.body)) as {model:string};assert.equal(body.model,'gpt-test');return completion({status:'ok'});}});
  const schema=z.strictObject({status:z.literal('ok')});
  const result=await provider.requestTextProposal({prompt:'Return {status: ok}.',versions,schema},context());
  assert.equal(result.ok,true);assert.match(sentUrl,/^https:\/\/api\.openai\.com\/v1\/chat\/completions/);
  assert.equal(sentHeaders.get('authorization'),'Bearer synthetic-openai-key');
  assert.equal(JSON.stringify(result).includes(env.OPENAI_API_KEY),false);
});

test('image extraction preserves unknowns with safe provenance and lazy configuration', async () => {
  let reads = 0;
  const provider = createGroqProvider({ environment: () => { reads++; return env; }, fetch: async (_url, init) => {
    const body: unknown = JSON.parse(String(init?.body));
    assert.equal((body as { response_format: { type: string } }).response_format.type, 'json_object');
    return completion(document, 200, { 'x-request-id': 'req_synthetic01' });
  } });
  assert.equal(reads, 0);
  const result = await provider.requestImageExtraction(image, context());
  if (!result.ok) assert.fail(result.error.reason);
  assert.deepEqual(result.output, document);
  assert.equal(result.metadata.attempts, 1);
  assert.deepEqual(result.metadata.providerRequestIds, ['req_synthetic01']);
  assert.equal(JSON.stringify(result).includes(env.GROQ_API_KEY), false);
});

class FakeClock implements ProviderClock {
  time = 0;
  private sequence = 0;
  private timers = new Map<number, { due: number; callback: () => void }>();
  now = () => this.time;
  setTimer = (milliseconds: number, callback: () => void) => {
    const id = ++this.sequence;
    this.timers.set(id, { due: this.time + milliseconds, callback });
    return () => { this.timers.delete(id); };
  };
  advance(milliseconds: number) {
    const end = this.time + milliseconds;
    for (;;) {
      const next = [...this.timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      this.time = next[1].due; this.timers.delete(next[0]); next[1].callback();
    }
    this.time = end;
  }
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const fakeContext = (deadlineAtMs = 5000) => ({ requestId: context().requestId, deadlineAtMs });
const failureReason = (result: ProviderResult) => { if (result.ok) assert.fail('Expected a structured failure'); return result.error.reason; };

test('a transient outage can recover once within the original operation deadline', async () => {
  const clock = new FakeClock(); let requests = 0;
  const provider = createGroqProvider({ environment: () => env, clock, fetch: async () => {
    requests++; return requests === 1 ? completion(null, 503) : completion(document);
  } });
  const pending = provider.requestImageExtraction(image, fakeContext());
  await flush(); clock.advance(250);
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.metadata.attempts, 2);
  assert.equal(result.metadata.durationMs, 250);
  assert.equal(requests, 2, 'SDK retries must not multiply the public attempt cap');
});

test('text proposals use the accepted shared schema in strict mode', async () => {
  const proposal = { transactionId: 'synthetic-transaction', category: 'software_services', rationale: 'Synthetic subscription', status: 'proposed' };
  const provider = createGroqProvider({ environment: () => env, fetch: async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { tools?: unknown; response_format: { type: string; json_schema: { strict: boolean } } };
    assert.equal(body.tools, undefined);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.strict, true);
    return completion(proposal);
  } });
  const result = await provider.requestTextProposal({ prompt: 'Propose a category for a synthetic software payment.', schema: categorySuggestionSchema, versions }, context());
  if (!result.ok) assert.fail(result.error.reason);
  assert.deepEqual(categorySuggestionSchema.parse(result.output), proposal);
});

const toolRequest: ToolConversationRequest = { messages: [{ role: 'user', content: 'Read the cash summary.' }],
  tools: [{ name: 'get_cash_summary', description: 'Read scoped deterministic cash totals.' }], choice: 'required', versions };
const toolCompletion = (args = '{"scope":"valid_imported_cash"}', name = 'get_cash_summary') => new Response(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: {
  role: 'assistant', content: null, tool_calls: [{ id: 'call_synthetic', type: 'function', function: { name, arguments: args } }],
} }] }), { headers: { 'content-type': 'application/json' } });

test('local tool mode uses A allowlist/argument schemas and preserves call identity without executing tools', async () => {
  const provider = createGroqProvider({ environment: () => env, fetch: async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { tools: { function: { parameters: { properties: Record<string, unknown> } } }[]; response_format?: unknown };
    assert.equal(body.response_format, undefined);
    assert.equal(Object.hasOwn(body.tools[0]!.function.parameters.properties, 'workspaceId'), false);
    return toolCompletion();
  } });
  const result = await provider.requestToolConversation(toolRequest, context());
  if (!result.ok) assert.fail(result.error.reason);
  assert.deepEqual(result.output, { content: null, toolCalls: [{ id: 'call_synthetic', name: 'get_cash_summary', arguments: '{"scope":"valid_imported_cash"}' }] });
});

for (const [name, args] of [['get_cash_summary', '{"scope":"valid_imported_cash","ownerId":"foreign"}'], ['pay_money', '{}'], ['get_cash_summary', '[]']]) {
  test(`unsafe provider tool output is rejected after one bounded repair: ${name} ${args}`, async () => {
    let requests = 0;
    const provider = createGroqProvider({ environment: () => env, fetch: async () => { requests++; return toolCompletion(args, name); } });
    const result = await provider.requestToolConversation(toolRequest, context());
    assert.equal(failureReason(result), 'invalid_model_output');
    assert.equal(result.metadata.attempts, 2);
    assert.equal(requests, 2);
  });
}

for (const settings of [{}, { ...env, GROQ_API_KEY: '' }, { ...env, GROQ_TEXT_MODEL: 'unverified-model' }]) {
  test(`missing or unsupported runtime settings fail before network: ${Object.keys(settings).length}`, async () => {
    let requests = 0;
    const provider = createGroqProvider({ environment: () => settings, fetch: async () => { requests++; return completion(document); } });
    const result = await provider.requestImageExtraction(image, context());
    assert.equal(failureReason(result), 'configuration_missing');
    assert.equal(result.metadata.attempts, 0);
    assert.equal(requests, 0);
  });
}

for (const status of [400, 401, 403, 404, 422]) {
  test(`terminal provider status ${status} is not retried and raw error details stay private`, async () => {
    const events: ProviderTelemetry[] = []; let requests = 0;
    const provider = createGroqProvider({ environment: () => env, onTelemetry: event => events.push(event), fetch: async () => {
      requests++;
      return new Response(JSON.stringify({ error: { message: `${env.GROQ_API_KEY} https://private.invalid/image private-prompt`, code: 'invalid_request' } }), { status });
    } });
    const result = await provider.requestImageExtraction(image, context());
    assert.equal(failureReason(result), status === 401 || status === 403 ? 'provider_auth' : 'provider_request');
    assert.equal(requests, 1);
    for (const privateText of [env.GROQ_API_KEY, 'https://private.invalid', 'private-prompt', 'data:image']) assert.equal(JSON.stringify([result, events]).includes(privateText), false);
  });
}

test('JSON repair recovers once and shares the same two-attempt allowance', async () => {
  let requests = 0;
  const provider = createGroqProvider({ environment: () => env, fetch: async () => {
    requests++; return completion(requests === 1 ? { ...document, totalMinor: 'not-money' } : document);
  } });
  const result = await provider.requestImageExtraction(image, context());
  assert.equal(result.ok, true);
  assert.equal(result.metadata.attempts, 2);
  assert.equal(requests, 2);
  assert.deepEqual(result.metadata.usage, { inputTokens: 20, outputTokens: 10, totalTokens: 30 });
});

test('a transient failure followed by malformed output cannot get a third repair attempt', async () => {
  const clock = new FakeClock(); let requests = 0;
  const provider = createGroqProvider({ environment: () => env, clock, fetch: async () => { requests++; return requests === 1 ? completion(null, 503) : completion({ unexpected: true }); } });
  const pending = provider.requestImageExtraction(image, fakeContext());
  await flush(); clock.advance(250);
  const result = await pending;
  assert.equal(failureReason(result), 'invalid_model_output');
  assert.equal(result.metadata.attempts, 2);
  assert.equal(requests, 2);
});

test('a network failure can recover once without SDK retries multiplying requests', async () => {
  const clock = new FakeClock(); let requests = 0;
  const provider = createGroqProvider({ environment: () => env, clock, fetch: async () => {
    requests++; if (requests === 1) throw new Error('synthetic network failure'); return completion(document);
  } });
  const pending = provider.requestImageExtraction(image, fakeContext());
  await flush(); clock.advance(250);
  const result = await pending;
  assert.equal(result.ok, true); assert.equal(requests, 2);
});

test('a long rate-limit reset returns deferred timing without waiting beyond the deadline', async () => {
  const clock = new FakeClock(); let requests = 0;
  const provider = createGroqProvider({ environment: () => env, clock, fetch: async () => { requests++; return completion(null, 429, { 'retry-after': '60' }); } });
  const result = await provider.requestImageExtraction(image, fakeContext());
  assert.equal(failureReason(result), 'provider_rate_limited');
  if (result.ok) assert.fail('Expected failure');
  assert.equal(result.error.retryAfterMs, 60_000); assert.equal(result.metadata.durationMs, 0); assert.equal(requests, 1);
});

test('short rate-limit guidance is honored once inside the original deadline', async () => {
  const clock = new FakeClock(); let requests = 0;
  const provider = createGroqProvider({ environment: () => env, clock, fetch: async () => {
    requests++; return requests === 1 ? completion(null, 429, { 'retry-after': '0.1' }) : completion(document);
  } });
  const pending = provider.requestImageExtraction(image, fakeContext());
  await flush(); clock.advance(99); await flush(); assert.equal(requests, 1);
  clock.advance(1); const result = await pending;
  assert.equal(result.ok, true); assert.equal(requests, 2); assert.equal(result.metadata.durationMs, 100);
});

test('missing rate-limit guidance does not trigger an immediate blind retry', async () => {
  let requests = 0;
  const provider = createGroqProvider({ environment: () => env, fetch: async () => { requests++; return completion(null, 429); } });
  assert.equal(failureReason(await provider.requestImageExtraction(image, context())), 'provider_rate_limited');
  assert.equal(requests, 1);
});

test('an expired deadline or prior cancellation uses no provider capacity', async () => {
  const clock = new FakeClock(); const controller = new AbortController(); let requests = 0;
  const provider = createGroqProvider({ environment: () => env, clock, fetch: async () => { requests++; return completion(document); } });
  assert.equal(failureReason(await provider.requestImageExtraction(image, fakeContext(0))), 'deadline_exceeded');
  controller.abort('private cancellation reason');
  assert.equal(failureReason(await provider.requestImageExtraction(image, { ...fakeContext(), signal: controller.signal })), 'cancelled');
  assert.equal(requests, 0);
});

test('cancellation interrupts a request and never exposes the caller abort reason', async () => {
  const controller = new AbortController(); const started = Promise.withResolvers<void>();
  const provider = createGroqProvider({ environment: () => env, fetch: async (_url, init) => {
    started.resolve();
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('private provider abort')), { once: true }));
  } });
  const pending = provider.requestImageExtraction(image, { ...context(), signal: controller.signal });
  await started.promise; controller.abort('secret caller reason');
  const result = await pending;
  assert.equal(failureReason(result), 'cancelled'); assert.equal(result.metadata.attempts, 1);
  assert.equal(JSON.stringify(result).includes('secret caller reason'), false);
});

test('cancellation interrupts backoff without sending a second request', async () => {
  const clock = new FakeClock(); const controller = new AbortController(); let requests = 0;
  const provider = createGroqProvider({ environment: () => env, clock, fetch: async () => { requests++; return completion(null, 503); } });
  const pending = provider.requestImageExtraction(image, { ...fakeContext(), signal: controller.signal });
  await flush(); controller.abort(); const result = await pending; clock.advance(5000);
  assert.equal(failureReason(result), 'cancelled'); assert.equal(requests, 1);
});

test('an in-flight request cannot continue beyond the outer deadline', async () => {
  const clock = new FakeClock(); const started = Promise.withResolvers<void>();
  const provider = createGroqProvider({ environment: () => env, clock, fetch: async (_url, init) => {
    started.resolve(); return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true }));
  } });
  const pending = provider.requestImageExtraction(image, fakeContext(100));
  await started.promise; clock.advance(100); const result = await pending;
  assert.equal(failureReason(result), 'deadline_exceeded'); assert.equal(result.metadata.durationMs, 100); assert.equal(result.metadata.attempts, 1);
});

test('per-attempt timeout can recover only while the original outer deadline remains', async () => {
  const clock = new FakeClock(); const started = Promise.withResolvers<void>(); let requests = 0;
  const provider = createGroqProvider({ environment: () => env, clock, fetch: async (_url, init) => {
    requests++; if (requests > 1) return completion(document);
    started.resolve(); return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('synthetic timeout')), { once: true }));
  } });
  const pending = provider.requestImageExtraction(image, fakeContext(50_000));
  await started.promise; clock.advance(20_000); await flush(); clock.advance(250);
  const result = await pending;
  assert.equal(result.ok, true); assert.equal(result.metadata.durationMs, 20_250); assert.equal(requests, 2);
});

test('account budget denial and budget outage are distinct and consume no inference request', async () => {
  let requests = 0;
  const provider = createGroqProvider({ environment: () => env, fetch: async () => { requests++; return completion(document); } });
  assert.equal(failureReason(await provider.requestImageExtraction(image, { ...context(), budget: { take: () => false } })), 'budget_exhausted');
  assert.equal(failureReason(await provider.requestImageExtraction(image, { ...context(), budget: { take: () => { throw new Error('private budget outage'); } } })), 'budget_unavailable');
  assert.equal(requests, 0);
});

test('default server-only import is rejected and server import needs no credentials', () => {
  const environment = { ...process.env, GROQ_API_KEY: '', GROQ_VISION_MODEL: '', GROQ_TEXT_MODEL: '' };
  const blocked = spawnSync(process.execPath, ['--input-type=module', '-e', 'await import("./src/lib/ai/index.ts")'], { env: environment, encoding: 'utf8' });
  assert.equal(blocked.status, 1); assert.match(blocked.stderr, /cannot be imported from a Client Component module/);
  const server = spawnSync(process.execPath, ['--conditions=react-server', '--input-type=module', '-e', 'const {createGroqProvider}=await import("./src/lib/ai/index.ts");createGroqProvider();'], { env: environment, encoding: 'utf8' });
  assert.equal(server.status, 0);
});

test('two exhausted transient attempts return a structured failure with no hidden SDK retries', async () => {
  const clock = new FakeClock(); let requests = 0;
  const provider = createGroqProvider({ environment: () => env, clock, fetch: async () => { requests++; return completion(null, 503); } });
  const pending = provider.requestImageExtraction(image, fakeContext());
  await flush(); clock.advance(250); const result = await pending;
  assert.equal(failureReason(result), 'provider_unavailable'); assert.equal(requests, 2); assert.equal(result.metadata.attempts, 2);
});

test('two malformed responses exhaust the same operation budget without returning canned fields', async () => {
  let requests = 0;
  const provider = createGroqProvider({ environment: () => env, fetch: async () => { requests++; return completion({ totalMinor: 'invented' }); } });
  const result = await provider.requestImageExtraction(image, context());
  assert.equal(failureReason(result), 'invalid_model_output'); assert.equal(requests, 2);
  assert.equal(Object.hasOwn(result, 'output'), false);
});

test('a token-truncated JSON response is invalid even if its partial fields parse', async () => {
  let requests = 0;
  const provider = createGroqProvider({ environment: () => env, fetch: async () => {
    requests++; return new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(document) } }] }));
  } });
  assert.equal(failureReason(await provider.requestImageExtraction(image, context())), 'invalid_model_output');
  assert.equal(requests, 2);
});

test('insufficient remaining time for backoff does not wait or reset the outer deadline', async () => {
  const clock = new FakeClock(); let requests = 0;
  const provider = createGroqProvider({ environment: () => env, clock, fetch: async () => { requests++; return completion(null, 503); } });
  const result = await provider.requestImageExtraction(image, fakeContext(200));
  assert.equal(failureReason(result), 'provider_unavailable'); assert.equal(requests, 1); assert.equal(clock.now(), 0);
});

test('an exhausted external attempt allowance prevents a third-party request on recovery', async () => {
  const clock = new FakeClock(); let requests = 0; let budget = 1;
  const provider = createGroqProvider({ environment: () => env, clock, fetch: async () => { requests++; return completion(null, 503); } });
  const pending = provider.requestImageExtraction(image, { ...fakeContext(), budget: { take: () => budget-- > 0 } });
  await flush(); clock.advance(250); const result = await pending;
  assert.equal(failureReason(result), 'budget_exhausted'); assert.equal(requests, 1); assert.equal(result.metadata.attempts, 1);
});

test('invalid image/schema/context inputs are rejected without consuming account capacity', async () => {
  let requests = 0;
  const provider = createGroqProvider({ environment: () => env, fetch: async () => { requests++; return completion(document); } });
  assert.equal(failureReason(await provider.requestImageExtraction({ ...image, mime: 'image/jpeg' }, context())), 'invalid_request');
  assert.equal(failureReason(await provider.requestImageExtraction({ ...image, source: { sourceId: 'source', rowNumber: 2 } }, context())), 'invalid_request');
  assert.equal(failureReason(await provider.requestImageExtraction(image, { ...context(), requestId: 'private-url-or-secret' })), 'invalid_request');
  assert.equal(failureReason(await provider.requestTextProposal({ prompt: 'JSON proposal', schema: z.object({ optional: z.string().optional() }), versions }, context())), 'invalid_request');
  assert.equal(requests, 0);
});

test('credentials accidentally present in a prompt cannot be sent to the provider', async () => {
  let requests = 0;
  const provider = createGroqProvider({ environment: () => env, fetch: async () => { requests++; return completion(document); } });
  const result = await provider.requestImageExtraction({ ...image, prompt: `JSON ${env.GROQ_API_KEY}` }, context());
  assert.equal(failureReason(result), 'invalid_request'); assert.equal(requests, 0);
  assert.equal(JSON.stringify(result).includes(env.GROQ_API_KEY), false);
});

test('telemetry failures do not change a successful provider outcome', async () => {
  const provider = createGroqProvider({ environment: () => env, fetch: async () => completion(document), onTelemetry: () => { throw new Error('logger outage'); } });
  assert.equal((await provider.requestImageExtraction(image, context())).ok, true);
});

test('malformed optional budgets return INVALID_INPUT without consuming capacity', async () => {
  let requests = 0; let configurationReads = 0;
  const provider = createGroqProvider({ environment: () => { configurationReads++; return env; }, fetch: async () => { requests++; return completion(document); } });
  for (const budget of [null, 1, 'invalid', [], {}, { take: null }]) {
    const result = await provider.requestImageExtraction(image, { ...context(), budget } as unknown as Parameters<typeof provider.requestImageExtraction>[1]);
    assert.equal(failureReason(result), 'invalid_request');
    if (!result.ok) assert.equal(result.error.code, 'INVALID_INPUT');
    assert.equal(result.metadata.attempts, 0);
  }
  assert.equal(requests, 0); assert.equal(configurationReads, 0);
});

test('malformed outer requests and contexts return safe failures in all three modes', async () => {
  let requests = 0; let configurationReads = 0; let budgetCalls = 0;
  const provider = createGroqProvider({ environment: () => { configurationReads++; return env; }, fetch: async () => { requests++; return completion(document); } });
  const operations = [provider.requestImageExtraction, provider.requestTextProposal, provider.requestToolConversation] as unknown as Array<(input: unknown, context: unknown) => Promise<ProviderResult>>;
  for (const operation of operations) {
    for (const input of [null, undefined, [], 1, 'invalid', {}]) {
      const result = await operation(input, { ...context(), budget: { take: () => { budgetCalls++; return true; } } });
      assert.equal(failureReason(result), 'invalid_request');
      if (!result.ok) assert.equal(result.error.code, 'INVALID_INPUT');
      assert.equal(result.metadata.attempts, 0);
    }
    for (const invalidContext of [null, undefined, [], {}]) {
      const result = await operation(image, invalidContext);
      assert.equal(failureReason(result), 'invalid_request');
      if (!result.ok) assert.equal(result.error.code, 'INVALID_INPUT');
      assert.equal(result.metadata.requestId, null);
    }
  }
  assert.equal(requests, 0); assert.equal(configurationReads, 0); assert.equal(budgetCalls, 0);
});
