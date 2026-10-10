import test from 'node:test';
import assert from 'node:assert/strict';
import { requireSameOrigin, readJson, jsonEndpoint } from '../../src/lib/server/http.ts';
import { readPlatformConfiguration } from '../../src/lib/server/configuration.ts';
import { BackendError } from '../../src/lib/server/errors.ts';

test('cookie mutations reject absent and foreign origins', () => {
  assert.throws(() => requireSameOrigin(new Request('https://raqam.example/api/workspace'), 'https://raqam.example'));
  assert.throws(() => requireSameOrigin(new Request('https://raqam.example/api/workspace', { headers: { origin: 'https://attacker.example' } }), 'https://raqam.example'));
  assert.doesNotThrow(() => requireSameOrigin(new Request('https://raqam.example/api/workspace', { headers: { origin: 'https://raqam.example' } }), 'https://raqam.example'));
});

test('JSON input is bounded and rejects malformed bodies', async () => {
  const request = (body: string, type = 'application/json'): Request => new Request('https://raqam.example/api/workspace', { method: 'POST', headers: { 'Content-Type': type }, body });
  assert.deepEqual(await readJson(request('{"businessName":"Synthetic"}')), { businessName: 'Synthetic' });
  await assert.rejects(() => readJson(request('broken')));
  await assert.rejects(() => readJson(request('{}', 'text/plain')));
  await assert.rejects(() => readJson(request('12345'), 4));
});

test('errors fail closed without leaking provider details or caching private results', async () => {
  const response = await jsonEndpoint(async () => { throw new Error('PRIVATE_PROVIDER_DETAIL'); });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(JSON.stringify(await response.json()).includes('PRIVATE_PROVIDER_DETAIL'), false);
  assert.equal((await jsonEndpoint(async () => { throw new BackendError('UNAUTHENTICATED', 'Sign in.'); })).status, 401);
  assert.equal(readPlatformConfiguration({}), null);
});
