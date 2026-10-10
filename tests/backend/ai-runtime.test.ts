import test from 'node:test';
import assert from 'node:assert/strict';
import Groq from 'groq-sdk';
import { z } from 'zod';

// A's dependency baseline only. C1 owns the feasibility runner and proof cases.
test('native Node TypeScript executes the pinned Groq SDK and Zod together', async () => {
  let requests: number = 0;
  const client: Groq = new Groq({
    apiKey: 'synthetic-runtime-test-key', maxRetries: 0, timeout: 1000, logLevel: 'off',
    fetch: async () => {
      requests++;
      return new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: '{"ready":true}' } }],
      }), { headers: { 'content-type': 'application/json' } });
    },
  });
  const completion = await client.chat.completions.create({
    model: 'synthetic-runtime-test-model', messages: [{ role: 'user', content: 'Runtime test' }],
  });
  const content: string = completion.choices[0]?.message.content ?? '';
  const result = z.strictObject({ ready: z.literal(true) }).parse(JSON.parse(content));
  assert.deepEqual(result, { ready: true });
  assert.equal(requests, 1);
});
