import assert from 'node:assert/strict';

// Run against the local production shell, with --configured after account setup.
const base = process.env.SMOKE_BASE_URL ?? 'http://localhost:3187';
const configured = process.argv.includes('--configured');
const home = await fetch(base);
assert.equal(home.status, 200);
assert.match(await home.text(), /Open workspace/);
assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
const health = await fetch(`${base}/api/health`);
assert.deepEqual(await health.json(), { status: configured ? 'configured_unverified' : 'setup_required' });
const signIn = await fetch(`${base}/sign-in`, { redirect: 'manual' });
if (configured) assert.equal(signIn.status, 200);
else {
  assert.equal(signIn.status, 307);
  assert.equal(new URL(signIn.headers.get('location'), base).pathname, '/');
}
const privateRequests = [
  ['/api/reviews', 'POST'], ['/api/reviews?proposalId=10000000-0000-4000-8000-000000000001', 'GET'],
  ['/api/workspace', 'GET'], ['/api/workspace', 'POST'], ['/api/transactions', 'GET'],
  ['/api/sources', 'POST'], ['/api/sources/10000000-0000-4000-8000-000000000001', 'GET'],
  ['/api/imports', 'POST'], ['/api/imports/template', 'GET'],
  ['/api/imports/10000000-0000-4000-8000-000000000001', 'GET'],
  ['/api/imports/10000000-0000-4000-8000-000000000001/confirmation', 'POST'],
  ['/api/imports/10000000-0000-4000-8000-000000000001/resolutions', 'GET'],
  ['/api/imports/10000000-0000-4000-8000-000000000001/resolutions', 'POST'],
  ['/api/transactions/10000000-0000-4000-8000-000000000001', 'GET'],
  ['/api/transactions/10000000-0000-4000-8000-000000000001', 'PATCH'],
  ['/api/transactions/10000000-0000-4000-8000-000000000001/reviews', 'GET'],
  ['/api/documents', 'GET'], ['/api/documents', 'POST'],
  ['/api/documents/10000000-0000-4000-8000-000000000001', 'GET'],
  ['/api/documents/10000000-0000-4000-8000-000000000001', 'PATCH'],
  ['/api/documents/10000000-0000-4000-8000-000000000001/history', 'GET'],
  ['/api/documents/10000000-0000-4000-8000-000000000001/extraction', 'POST'],
  ['/api/summary', 'GET'], ['/api/export', 'GET'],
];
for (const [path, method] of privateRequests) {
  const response = await fetch(`${base}${path}`, { method });
  assert.equal(response.status, configured ? 401 : 503, `${method} ${path}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.data, null);
  assert.equal(result.error.code, configured ? 'UNAUTHENTICATED' : 'UNAVAILABLE');
}
console.log(`Local production smoke passed: home, sign-in, health, headers and ${privateRequests.length} private requests fail closed (${configured ? 'signed out' : 'missing configuration'}). Signed-in persistence/isolation remains unverified.`);
