import assert from 'node:assert/strict';

// Run only against the unconfigured local production shell.
const base = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3187';
const home = await fetch(base);
assert.equal(home.status, 200);
assert.match(await home.text(), /Account setup is pending/);
assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
const health = await fetch(`${base}/api/health`);
assert.deepEqual(await health.json(), { status: 'setup_required' });
const signIn = await fetch(`${base}/sign-in`, { redirect: 'manual' });
assert.equal(signIn.status, 307);
assert.equal(new URL(signIn.headers.get('location'), base).pathname, '/');
for (const [path, method] of [
  ['/api/workspace', 'GET'], ['/api/workspace', 'POST'], ['/api/transactions', 'GET'],
  ['/api/sources', 'POST'], ['/api/sources/10000000-0000-4000-8000-000000000001', 'GET'],
]) {
  const response = await fetch(`${base}${path}`, { method });
  assert.equal(response.status, 503, `${method} ${path}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.data, null);
  assert.equal(result.error.code, 'UNAVAILABLE');
}
console.log('Local production smoke passed: setup page, sign-in redirect, health, headers and five private API requests failing closed. Live auth/persistence remains unverified.');
