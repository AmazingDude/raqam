import assert from 'node:assert/strict';
// Read-only HTTP checks. Does not log credentials, records or provider responses.
const base = process.env.FRONTEND_BASE_URL ?? 'http://localhost:3000';
const pages = [
  ['/', /A little clarity/], ['/demo', /Synthetic records/], ['/workspace', /Checking your session|Your workspace is almost ready/],
];
for (const [path, copy] of pages) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const body = await response.text(); assert.match(body, copy, path);
  if (path === '/workspace') assert.doesNotMatch(body, /Brand identity · Aster Studio/);
}
for (const path of ['/api/workspace', '/api/transactions', '/api/sources/10000000-0000-4000-8000-000000000001']) {
  const response = await fetch(`${base}${path}`, { redirect: 'manual' });
  assert.ok([401,503].includes(response.status), path);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json(); assert.equal(result.data, null);
  assert.ok(['UNAUTHENTICATED','UNAVAILABLE'].includes(result.error?.code));
}
console.log('Frontend HTTP smoke passed: 3 public/UI routes and 3 unauthenticated private GET denials. Live account isolation remains unverified.');
