// Read-only native-session checks against localhost and guarded synthetic workspaces.
// No account/session creation or revocation, financial writes, model calls or retries.
import assert from 'node:assert/strict';
const env = process.env;
const base = new URL(env.SESSION_BASE_URL ?? 'http://localhost:3188');
let phase = 'native test sessions', passed = 0;
class CheckFailure extends Error {}
function check(value) { if (!value) throw new Error('validation'); }
const ok = label => { passed++; console.log(`PASS ${label}`); };
async function clerk(path, method = 'GET') {
  const response = await fetch(`https://api.clerk.com/v1/${path}`, {
    method, headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new CheckFailure(`Clerk readiness HTTP ${response.status}`);
  return response.json();
}
async function api(token, path, expected = 200, method = 'GET') {
  const response = await fetch(new URL(path, base), { method, redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status !== expected) throw new CheckFailure(`API HTTP ${response.status}; expected ${expected}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  if (expected >= 400) {
    const result = await response.json(); assert.equal(result.data, null);
    assert.equal(result.error?.code, expected === 401 ? 'UNAUTHENTICATED' : 'NOT_FOUND');
    return;
  }
  if (path === '/api/export') {
    check(response.headers.get('content-type')?.startsWith('text/csv'));
    return response.text();
  }
  const result = await response.json(); assert.equal(result.error, null); return result.data;
}
try {
  check(base.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(base.hostname));
  check(env.CLERK_SECRET_KEY?.startsWith('sk_test_'));
  const users = await clerk('users?limit=10');
  check(Array.isArray(users) && users.length > 0 && users.length <= 10);
  const domain = Buffer.from(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.split('_').slice(2).join('_'), 'base64').toString().replace(/\$$/, '');
  const accounts = [];
  for (const user of users) {
    phase = `account ${accounts.length + 1} active session readiness`;
    const result = await clerk(`sessions?user_id=${encodeURIComponent(user.id)}&status=active&limit=1`);
    const sessions = Array.isArray(result) ? result : result.data;
    if (!sessions?.length) continue;
    check(sessions[0].user_id === user.id);
    const account = { subject: user.id, session: sessions[0].id };
    account.mint = async () => {
      const minted = await clerk(`sessions/${encodeURIComponent(account.session)}/tokens`, 'POST');
      check(typeof minted.jwt === 'string');
      const claims = JSON.parse(Buffer.from(minted.jwt.split('.')[1], 'base64url').toString());
      check(claims.sub === account.subject && claims.role === 'authenticated' && claims.iss === `https://${domain}` && Number.isFinite(claims.exp));
      return { jwt: minted.jwt, exp: claims.exp };
    };
    phase = `account ${accounts.length + 1} native token validation`;
    const token = await account.mint();
    phase = `account ${accounts.length + 1} guarded workspace readiness`;
    account.workspace = await api(token.jwt, '/api/workspace');
    if (account.workspace?.businessName !== 'Raqam synthetic validation') continue;
    check(account.workspace.ownerSubject === user.id);
    const page = await api(token.jwt, '/api/transactions?limit=50');
    check(page.items.length > 0 && page.nextCursor === null);
    check(page.items.every(row => row.workspaceId === account.workspace.id));
    account.transactionIds = page.items.map(row => row.id);
    accounts.push(account);
    if (accounts.length === 2) break;
  }
  if (accounts.length !== 2) throw new CheckFailure('Two existing synthetic validation accounts need active signed-in sessions');
  check(accounts[0].workspace.id !== accounts[1].workspace.id);
  ok('two existing native test sessions read only their guarded synthetic workspace');
  phase = 'interleaved account boundary';
  // Repeated account A/B/A/B requests share one production process, not one client cookie jar.
  for (const index of [0,1,0,1]) {
    const owner = accounts[index], foreign = accounts[1-index], token = await owner.mint();
    const workspace = await api(token.jwt, '/api/workspace'); assert.equal(workspace.id, owner.workspace.id);
    const page = await api(token.jwt, '/api/transactions?limit=50');
    assert.deepEqual(new Set(page.items.map(row => row.id)), new Set(owner.transactionIds));
    check(page.items.every(row => row.workspaceId === owner.workspace.id));
    const summary = await api(token.jwt, '/api/summary');
    assert.deepEqual(new Set(summary.transactionIds), new Set(owner.transactionIds));
    const csv = await api(token.jwt, '/api/export');
    check(owner.transactionIds.every(id => csv.includes(id)) && foreign.transactionIds.every(id => !csv.includes(id)));
    await api(token.jwt, `/api/transactions/${foreign.transactionIds[0]}`, 404);
  }
  ok('four interleaved A/B reads keep workspace, cashbook, summary, export and foreign detail isolated');
  phase = 'invalid token rejection';
  const valid = await accounts[0].mint();
  const segments = valid.jwt.split('.');
  const claims = JSON.parse(Buffer.from(segments[1], 'base64url').toString());
  // Alter a signed claim without resigning. Never log the forged token or account IDs.
  claims.sub = accounts[1].subject;
  const forged = `${segments[0]}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${segments[2]}`;
  for (const invalid of ['invalid-session-token', forged]) {
    for (const path of ['/api/workspace','/api/transactions','/api/summary','/api/export']) await api(invalid, path, 401);
  }
  ok('malformed and signature-invalid identity tokens deny four private endpoints each');
  phase = 'natural native-token expiry';
  const expiring = await accounts[0].mint();
  await api(expiring.jwt, '/api/workspace');
  const waitMs = Math.ceil((expiring.exp + 10) * 1000 - Date.now());
  check(waitMs > 0 && waitMs <= 90000);
  console.log('Waiting for native token expiry plus clock-skew margin; existing user sessions remain active.');
  // Each timer is <=60s; the exec session yields while this check waits.
  for (let remaining = waitMs; remaining > 0;) {
    const duration = Math.min(remaining, 30000);
    await new Promise(resolve => setTimeout(resolve, duration)); remaining -= duration;
  }
  for (const path of ['/api/workspace','/api/transactions','/api/summary','/api/export']) await api(expiring.jwt, path, 401);
  ok('genuinely expired native token denies four private endpoints without exposing records');
  phase = 'fresh session recovery';
  const fresh = await accounts[0].mint();
  assert.equal((await api(fresh.jwt, '/api/workspace')).id, accounts[0].workspace.id);
  ok('the still-active user session can mint a fresh token and recover its own workspace');
  phase = 'no-session requests after authenticated reads';
  for (const path of ['/api/workspace','/api/transactions','/api/summary','/api/export']) await api(null, path, 401);
  ok('requests without a session remain denied after interleaved authenticated reads');
  console.log(`${passed}/6 read-only native API session groups pass. Browser cookie sign-out/account-switching and session revocation remain separate gates.`);
} catch (error) {
  console.error(`FAIL during ${phase}. No tokens, IDs, records or raw provider errors emitted.`);
  if (error instanceof CheckFailure) console.error(error.message);
  process.exitCode = 1;
}
