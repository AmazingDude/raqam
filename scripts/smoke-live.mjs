// Uses an existing signed-in development test session. Tokens stay in memory.
// Writes only a named synthetic workspace; never creates users/sessions or deletes data.
import assert from 'node:assert/strict';
const env = process.env;
const base = new URL(env.APP_URL ?? 'http://localhost:3000');
const businessName = 'Raqam synthetic validation';
let passed = 0;
class ValidationError extends Error {}
function ok(name) { passed++; console.log(`PASS ${name}`); }
function requireCondition(condition, message) { if (!condition) throw new ValidationError(message); }
async function clerk(path, method = 'GET') {
  const result = await fetch(`https://api.clerk.com/v1/${path}`, {
    method, headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(15000),
  });
  requireCondition(result.ok, `Clerk session preparation failed (HTTP ${result.status}).`);
  return result.json();
}
try {
  requireCondition(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) && base.protocol === 'http:', 'Live smoke requires a localhost APP_URL.');
  requireCondition(env.CLERK_SECRET_KEY?.startsWith('sk_test_'), 'Live smoke requires a Clerk development instance.');
  const users = await clerk('users?limit=2');
  const selectedUser = process.argv.find(arg => arg.startsWith('--user='))?.slice(7);
  requireCondition(selectedUser || (Array.isArray(users) && users.length === 1), 'Specify --user=<test-user-id> when more than one account exists.');
  const userId = selectedUser ?? users[0].id;
  requireCondition(/^user_[a-zA-Z0-9]+$/.test(userId), 'Invalid test user identifier.');
  const sessions = await clerk(`sessions?user_id=${encodeURIComponent(userId)}&status=active&limit=2`);
  const activeSessions = Array.isArray(sessions) ? sessions : sessions.data;
  requireCondition(activeSessions?.length > 0, 'An active test session is required. Sign in to the local app first.');
  requireCondition(activeSessions[0].user_id === userId && activeSessions[0].status === 'active', 'Session does not belong to the selected test account.');
  const sessionId = activeSessions[0].id;
  async function token(checkRole = true) {
    const result = await clerk(`sessions/${encodeURIComponent(sessionId)}/tokens`, 'POST');
    requireCondition(typeof result.jwt === 'string', 'No native session token returned.');
    const claims = JSON.parse(Buffer.from(result.jwt.split('.')[1], 'base64url').toString('utf8'));
    requireCondition(claims.sub === userId, 'Native session token does not belong to the selected test user.');
    if (checkRole) requireCondition(claims.role === 'authenticated', 'Native Clerk token is missing the authenticated role. Enable Clerk/Supabase integration.');
    return result.jwt;
  }
  const nativeToken = await token(false);
  const nativeClaims = JSON.parse(Buffer.from(nativeToken.split('.')[1], 'base64url').toString('utf8'));
  const configuredDomain = Buffer.from(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.split('_').slice(2).join('_'), 'base64').toString('utf8').replace(/\$$/, '');
  const issuerMatchesConfiguration = nativeClaims.iss === `https://${configuredDomain}`;
  requireCondition(issuerMatchesConfiguration, 'Clerk secret and publishable keys belong to different instances.');
  const roleConfigured = nativeClaims.role === 'authenticated';
  const tokenAgeSeconds = Math.floor(Date.now() / 1000) - nativeClaims.iat;
  const probe = await fetch(new URL('/rest/v1/workspaces?select=id&limit=0', env.NEXT_PUBLIC_SUPABASE_URL), {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${nativeToken}` },
    signal: AbortSignal.timeout(15000),
  });
  const probeBody = await probe.json().catch(() => null);
  const probeCode = typeof probeBody?.code === 'string' && /^[A-Z0-9_]{1,20}$/.test(probeBody.code) ? probeBody.code : null;
  console.log(JSON.stringify({ check: 'Native Clerk role and managed Supabase token access', issuerMatchesConfiguration,
    tokenIssuedRecently: Number.isFinite(tokenAgeSeconds) && tokenAgeSeconds >= -5 && tokenAgeSeconds <= 90,
    roleConfigured, httpStatus: probe.status, code: probeCode }));
  requireCondition(roleConfigured, 'Native Clerk token is missing the authenticated role. Enable Clerk/Supabase integration.');
  requireCondition(probe.ok, 'Supabase rejected the native Clerk token. Check Third-party auth for this Clerk app.');
  if (process.argv.includes('--readiness-only')) {
    console.log('Native session integration readiness passed. No records written; two-user isolation is unverified.');
    process.exit(0);
  }
  async function request(path, { method = 'GET', body, form, expected = 200, origin = base.origin } = {}) {
    const response = await fetch(new URL(path, base), {
      method, redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${await token()}`, Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    requireCondition(response.status === expected, `${method} ${path.split('?')[0]} failed (HTTP ${response.status}; expected ${expected}).`);
    requireCondition(response.headers.get('cache-control') === 'no-store', 'Private response must not be cached.');
    return response;
  }
  async function json(path, options) {
    const payload = await (await request(path, options)).json();
    requireCondition(payload.error === null, 'Backend returned a safe error instead of data.');
    return payload.data;
  }
  let workspace = await json('/api/workspace');
  if (!workspace) workspace = await json('/api/workspace', { method: 'POST', expected: 201, body: { businessName } });
  requireCondition(workspace.businessName === businessName, 'Existing workspace is not the synthetic validation workspace; refusing to mix test records.');
  assert.equal((await json('/api/workspace')).id, workspace.id);
  ok('verified native Clerk session, workspace persistence and reload');
  const csv = 'date,description,direction,amount,reference\n2026-10-10,Synthetic validation receipt,in,20.15,LIVE-1\n2026-10-10,Synthetic validation expense,out,10.05,LIVE-2\n2026-10-10,Synthetic unresolved,out,?,LIVE-3\n';
  const uploadCsv = async () => {
    const form = new FormData(); form.set('file', new File([csv], 'synthetic-validation.csv', { type: 'text/csv' }));
    return json('/api/imports', { method: 'POST', expected: 201, form });
  };
  const batch = await uploadCsv();
  assert.equal(batch.preview.validCount, 2); assert.equal(batch.preview.invalidCount, 1);
  assert.equal((await json(`/api/imports/${batch.importId}`)).importId, batch.importId);
  if (batch.status === 'pending') {
    const before = await json('/api/transactions?limit=50');
    assert.equal(before.items.filter(row => row.source.sourceId === batch.importId).length, 0);
  }
  ok('original CSV and stored preview survive reload without premature cash');
  const receipt = await json(`/api/imports/${batch.importId}/confirmation`, { method: 'POST', body: {} });
  assert.equal(receipt.importedCount, 2); assert.equal(receipt.unresolvedCount, 1); assert.equal(receipt.rejectedCount, 0);
  assert.equal((await uploadCsv()).duplicate, true);
  assert.equal((await json(`/api/imports/${batch.importId}/confirmation`, { method: 'POST', body: {} })).duplicate, true);
  const book = await json('/api/transactions?limit=50');
  const rows = book.items.filter(row => row.source.sourceId === batch.importId);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.amountMinor).sort(), ['1005', '2015']);
  ok('atomic CSV confirmation, exact money, unresolved preservation and duplicate retries');
  if (process.argv.includes('--reviews')) {
    // Exercise only this script's own fixture row, even in a previously used test workspace.
    const expense = rows.find(row => row.amountMinor === '1005');
    const detail = await json(`/api/transactions/${expense.id}`);
    const reviewed = await json(`/api/transactions/${expense.id}`, {
      method: 'PATCH', body: { expectedVersion: detail.reviewVersion, description: 'Live reviewed expense', category: 'travel' },
    });
    assert.equal(reviewed.transaction.originalDescription, 'Synthetic validation expense');
    assert.equal(reviewed.transaction.amountMinor, '1005');
    const stale = await request(`/api/transactions/${expense.id}`, {
      method: 'PATCH', expected: 409, body: { expectedVersion: reviewed.reviewVersion - 1, category: 'software_services' },
    });
    assert.equal((await stale.json()).error.code, 'CONFLICT');
    const history = await json(`/api/transactions/${expense.id}/reviews`);
    assert.ok(history.items.length > 0);
    assert.equal((await json(`/api/transactions/${expense.id}`)).reviewVersion, reviewed.reviewVersion);
    const summary = await json('/api/summary');
    const currentRows = (await json('/api/transactions?limit=50')).items;
    const total = direction => currentRows.filter(row => row.direction === direction).reduce((sum, row) => sum + BigInt(row.amountMinor), 0n).toString();
    assert.equal(summary.inflowMinor, total('in')); assert.equal(summary.outflowMinor, total('out'));
    assert.ok(summary.unresolvedImportRowCount >= 1);
    const exported = await request('/api/export');
    assert.ok(Number(exported.headers.get('X-Raqam-Unresolved-Import-Rows')) >= 1);
    assert.match(await exported.text(), /Synthetic validation expense,Live reviewed expense,out,10\.05,PKR,LIVE-2,travel,accepted,unmatched/);
    ok('audited review persistence, stale-write denial, exact summary and reviewed CSV export');
  }
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWQAAAABJRU5ErkJggg==', 'base64');
  const uploadImage = async () => {
    const form = new FormData(); form.set('file', new File([image], 'synthetic-pixel.png', { type: 'image/png' }));
    return json('/api/sources', { method: 'POST', expected: 201, form });
  };
  const source = await uploadImage();
  assert.equal((await uploadImage()).duplicate, true);
  const signed = await json(`/api/sources/${source.sourceId}`);
  const signedUrl = new URL(signed.signedUrl);
  requireCondition(signedUrl.origin === new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin, 'Source URL must belong to configured Supabase.');
  const original = await fetch(signedUrl, { signal: AbortSignal.timeout(15000) });
  assert.equal(original.status, 200); assert.deepEqual(Buffer.from(await original.arrayBuffer()), image);
  const publicUrl = new URL(signedUrl.pathname.replace('/object/sign/', '/object/public/'), signedUrl.origin);
  assert.notEqual((await fetch(publicUrl, { signal: AbortSignal.timeout(15000) })).status, 200);
  assert.equal((await json('/api/transactions?limit=50')).items.length, book.items.length);
  ok('private source upload/retry, signed retrieval and no cash created from images');
  const foreign = await request('/api/workspace', { method: 'POST', expected: 422, origin: 'https://invalid.example', body: { businessName } });
  assert.equal((await foreign.json()).error.code, 'INVALID_INPUT');
  const invalid = await fetch(new URL('/api/transactions', base), { headers: { Authorization: 'Bearer invalid-token' }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  assert.equal(invalid.status, 401);
  ok('foreign-origin mutations and invalid sessions fail closed');
  console.log(`${passed} live one-account checks passed. Synthetic records retained. Two-user isolation, session expiry and browser account switching remain unverified.`);
} catch (error) {
  // Assert failures intentionally omit actual payloads; vendor exceptions/tokens never reach logs.
  console.error(error instanceof ValidationError ? `FAIL ${error.message}` :
    error?.code === 'ERR_ASSERTION' ? 'FAIL Live behavior differed from the synthetic expected result.' : 'FAIL Live validation could not complete.');
  process.exitCode = 1;
}
