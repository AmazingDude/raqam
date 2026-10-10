import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { withSharedProviderCapacity } from '../../src/lib/ai/shared-provider-capacity.ts';
import type { GroqProvider, ProviderResult, ProviderTelemetry } from '../../src/lib/ai/provider.ts';

const versions = { prompt: 'synthetic-v1', schema: 'synthetic-v1' };
const context = { requestId: '10000000-0000-4000-8000-000000000001', deadlineAtMs: Date.now() + 30000 };
const text = { prompt: 'Synthetic input', versions, schema: z.object({ value: z.string() }) };
const success: ProviderResult = { ok: true, output: { value: 'synthetic' }, metadata: { requestId: context.requestId, mode: 'text', model: 'synthetic', providerVersion: 'synthetic-v1', promptVersion: versions.prompt, schemaVersion: versions.schema, attempts: 1, durationMs: 0, providerRequestIds: [], usage: null } };
const provider = (call: () => Promise<ProviderResult>): GroqProvider => ({ requestImageExtraction: call, requestTextProposal: call, requestToolConversation: call });

test('independent provider instances and image/text/tool features share one slot; busy calls make zero attempts', async () => {
  let resolve!: (value: ProviderResult) => void, firstCalls = 0, secondCalls = 0;
  const events: ProviderTelemetry[] = [];
  const first = withSharedProviderCapacity(provider(() => { firstCalls++; return new Promise(done => { resolve = done; }); }));
  const second = withSharedProviderCapacity(provider(async () => { secondCalls++; return success; }), event => events.push(event));
  const pending = first.requestTextProposal(text, context);
  for (const busy of [await second.requestTextProposal(text, context), await second.requestImageExtraction({ versions } as never, context), await second.requestToolConversation({ versions } as never, context)]) {
    assert.equal(busy.ok, false); if (!busy.ok) { assert.equal(busy.error.reason, 'budget_unavailable'); assert.equal(busy.error.retryable, true); }
    assert.equal(busy.metadata.attempts, 0);
  }
  assert.equal(secondCalls, 0); assert.equal(events.length, 3); assert.equal(firstCalls, 1);
  resolve(success); await pending;
  assert.equal((await second.requestTextProposal(text, context)).ok, true); assert.equal(secondCalls, 1);
});

test('a failed or thrown provider operation releases capacity for the next explicit request', async () => {
  const failed = withSharedProviderCapacity(provider(async () => { throw new Error('Synthetic failure'); }));
  await assert.rejects(failed.requestTextProposal(text, context), /Synthetic failure/);
  const next = withSharedProviderCapacity(provider(async () => success));
  assert.equal((await next.requestTextProposal(text, context)).ok, true);
});
