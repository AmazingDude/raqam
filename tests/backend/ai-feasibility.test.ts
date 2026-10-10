import test from 'node:test';
import assert from 'node:assert/strict';
import { imageDataUrl, MAX_IMAGE_BYTES, proofClient, runProofCase } from '../ai/live/feasibility-support.ts';

const image = 'data:image/png;base64,synthetic';
const fields = { counterparty: null, date: null, totalMinor: null, currency: null, reference: null };
function response(content: string, finishReason = 'stop'): Response {
  return new Response(JSON.stringify({ choices: [{ finish_reason: finishReason, message: { content } }] }), {
    headers: { 'content-type': 'application/json' },
  });
}

test('vision proof validates nullable output and rejects invented schema fields and truncation', async () => {
  for (const [content, finish, expected] of [
    [JSON.stringify(fields), 'stop', 'schema_valid'],
    [JSON.stringify({ ...fields, totalMinor: 'unknown' }), 'stop', 'invalid_output'],
    [JSON.stringify({ ...fields, settled: true }), 'stop', 'invalid_output'],
    ['not JSON', 'stop', 'invalid_output'],
    [JSON.stringify(fields), 'length', 'invalid_output'],
  ] as const) {
    const client = proofClient('synthetic-key', async () => response(content, finish));
    const result = await runProofCase(client, 'synthetic-model', image);
    assert.equal(result.outcome, expected);
    assert.deepEqual(result.fields, expected === 'schema_valid' ? fields : null);
  }
});

test('real pinned Groq SDK performs one attempt for retryable failures and redacts error payloads', async () => {
  for (const status of [408, 409, 429, 500, 503]) {
    let attempts = 0;
    const client = proofClient('synthetic-secret', async () => {
      attempts++;
      return new Response(JSON.stringify({ error: { message: 'synthetic-secret private-receipt' } }), { status });
    });
    const result = await runProofCase(client, 'synthetic-model', image);
    assert.equal(attempts, 1);
    assert.equal(result.outcome, 'provider_error');
    assert.doesNotMatch(JSON.stringify(result), /synthetic-secret|private-receipt/);
  }
});

test('proof client disables SDK logging even when inherited GROQ_LOG requests debug output', async () => {
  const previous = process.env.GROQ_LOG;
  process.env.GROQ_LOG = 'debug';
  try {
    const client = proofClient('synthetic-key', async () => response(JSON.stringify(fields)));
    let logCalls = 0;
    const log = () => { logCalls++; };
    client.logger = { debug: log, info: log, warn: log, error: log };
    assert.equal(client.logLevel, 'off');
    assert.equal((await runProofCase(client, 'synthetic-model', image)).outcome, 'schema_valid');
    assert.equal(logCalls, 0);
  } finally {
    if (previous === undefined) delete process.env.GROQ_LOG;
    else process.env.GROQ_LOG = previous;
  }
});

test('vision proof aborts a stalled fetch within its deadline without retrying', async () => {
  let attempts = 0;
  const client = proofClient('synthetic-key', async (_input, init) => {
    attempts++;
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const abort = () => reject(new DOMException('synthetic-private-error', 'AbortError'));
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
  });
  const result = await runProofCase(client, 'synthetic-model', image, 40);
  assert.equal(result.outcome, 'timeout');
  assert.equal(attempts, 1);
  assert.ok(result.elapsedMs < 2000);
});

test('image proof preflight rejects unsupported and oversized inputs', () => {
  assert.throws(() => imageDataUrl(Buffer.from('private text')), /unsupported_image/);
  assert.throws(() => imageDataUrl(Buffer.alloc(MAX_IMAGE_BYTES + 1)), /invalid_image_size/);
  assert.match(imageDataUrl(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), /^data:image\/png;base64,/);
});
