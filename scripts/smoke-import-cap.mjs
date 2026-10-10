// Managed concurrency proof: only an empty, explicitly named disposable workspace.
// Leaves exactly 50 synthetic cash records; never deletes records or creates accounts.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const env = process.env;
const base = new URL(env.CAP_BASE_URL ?? 'http://localhost:3188');
const origin = new URL(env.APP_URL ?? 'http://localhost:3000').origin;
let phase = 'dedicated test account readiness', passed = 0;
class CheckFailure extends Error {}
const check = condition => { if (!condition) throw new Error('validation'); };
const ok = label => { passed++; console.log(`PASS ${label}`); };
async function clerk(path, method = 'GET') {
  const response = await fetch(`https://api.clerk.com/v1/${path}`, { method,
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new CheckFailure(`Clerk readiness HTTP ${response.status}`);
  return response.json();
}
async function api(account, path, { method = 'GET', body, form, expected = 200 } = {}) {
  const token = await account.token();
  const response = await fetch(new URL(path, base), { method, redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
  if (!(Array.isArray(expected) ? expected.includes(response.status) : response.status === expected)) throw new CheckFailure(`API HTTP ${response.status} differed from expected status`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  if (response.status >= 400) { assert.equal(result.data, null); assert.equal(result.error?.code, 'CONFLICT'); }
  else assert.equal(result.error, null);
  return { status: response.status, data: result.data };
}
async function rows(account) {
  const response = await api(account, '/api/transactions?limit=50');
  assert.equal(response.data.nextCursor, null); return response.data.items;
}
async function upload(account, count, tag) {
  const csv = 'date,description,direction,amount,reference\n' + Array.from({ length: count }, (_, i) =>
    `2026-10-10,Synthetic cap fixture,out,1.01,${tag}-${i}\n`).join('');
  const form = new FormData(); form.set('file', new File([csv], 'synthetic-cap.csv', { type: 'text/csv' }));
  return (await api(account, '/api/imports', { method: 'POST', expected: 201, form })).data;
}
const confirm = (account, batch, options = {}) => api(account, `/api/imports/${batch.importId}/confirmation`, { method: 'POST', body: {}, ...options });
try {
  check(base.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(base.hostname));
  check(env.CLERK_SECRET_KEY?.startsWith('sk_test_'));
  const users = await clerk('users?limit=10'); check(Array.isArray(users) && users.length <= 10);
  const domain = Buffer.from(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.split('_').slice(2).join('_'), 'base64').toString().replace(/\$$/, '');
  let account;
  for (const user of users) {
    const result = await clerk(`sessions?user_id=${encodeURIComponent(user.id)}&status=active&limit=1`);
    const sessions = Array.isArray(result) ? result : result.data;
    if (!sessions?.length) continue;
    check(sessions[0].user_id === user.id);
    const candidate = { subject: user.id, session: sessions[0].id, jwt: null, expires: 0 };
    candidate.token = async () => {
      if (candidate.jwt && candidate.expires > Date.now() / 1000 + 15) return candidate.jwt;
      const minted = await clerk(`sessions/${encodeURIComponent(candidate.session)}/tokens`, 'POST');
      const claims = JSON.parse(Buffer.from(minted.jwt.split('.')[1], 'base64url').toString());
      check(claims.sub === user.id && claims.role === 'authenticated' && claims.iss === `https://${domain}`);
      candidate.jwt = minted.jwt; candidate.expires = claims.exp; return candidate.jwt;
    };
    candidate.workspace = (await api(candidate, '/api/workspace')).data;
    if (candidate.workspace?.businessName !== 'Raqam cap validation') continue;
    check(candidate.workspace.ownerSubject === candidate.subject);
    account = candidate; break;
  }
  if (!account) throw new CheckFailure('Sign into a dedicated Raqam account with an empty workspace named Raqam cap validation');
  account.database = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    accessToken: account.token, db: { retry: false }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(15000) }) },
  });
  assert.equal((await rows(account)).length, 0);
  // Empty source/proposal state makes this a dedicated fixture workspace, not a renamed business.
  for (const table of ['sources','ai_proposals']) {
    const result = await account.database.from(table).select('id').eq('workspace_id', account.workspace.id).limit(1);
    check(result.error === null && result.data.length === 0);
  }
  ok('dedicated owner, exact test workspace name and empty cash/source/proposal state verified before writes');
  if (process.argv.includes('--check-only')) {
    console.log('Read-only cap-test readiness passes. No fixtures written; run without --check-only only for the dedicated disposable workspace.');
    process.exit(0);
  }
  phase = '47-row synthetic seed';
  const seed = await upload(account, 47, randomUUID());
  const seeded = await confirm(account, seed); assert.equal(seeded.data.importedCount, 47);
  assert.equal((await rows(account)).length, 47);
  ok('47 synthetic records persist through the normal upload/confirmation API');
  phase = 'managed concurrent confirmation race';
  const batches = [await upload(account, 2, randomUUID()), await upload(account, 2, randomUUID())];
  const results = await Promise.all(batches.map(batch => confirm(account, batch, { expected: [200,409] })));
  assert.deepEqual(results.map(result => result.status).sort(), [200,409]);
  const winner = results.findIndex(result => result.status === 200), loser = 1-winner;
  assert.equal(results[winner].data.importedCount, 2);
  const after = await rows(account); assert.equal(after.length, 49);
  assert.equal(after.filter(row => row.source.sourceId === batches[winner].importId).length, 2);
  assert.equal(after.filter(row => row.source.sourceId === batches[loser].importId).length, 0);
  const failedHistory = await account.database.from('review_decisions').select('id').eq('target_id', batches[loser].importId);
  check(failedHistory.error === null && failedHistory.data.length === 0);
  const failed = (await api(account, `/api/imports/${batches[loser].importId}`)).data;
  assert.equal(failed.status, 'pending'); assert.equal(failed.confirmation, null);
  ok('concurrent 47+2+2 imports produce one 200 and one 409; losing cash/history/receipt rolls back at 49');
  phase = 'duplicate winning receipt';
  const duplicate = await confirm(account, batches[winner]);
  assert.equal(duplicate.data.duplicate, true); assert.equal(duplicate.data.importedCount, 2);
  assert.equal((await rows(account)).length, 49);
  await confirm(account, batches[loser], { expected: 409 });
  ok('winning retry returns its immutable receipt and losing retry remains blocked without new cash');
  phase = 'explicit reduced-plan retry';
  const retried = await confirm(account, batches[loser], { body: { rows: [{ rowNumber: 3, action: 'reject' }] } });
  assert.equal(retried.data.importedCount, 1); assert.equal(retried.data.rejectedCount, 1);
  const final = await rows(account); assert.equal(final.length, 50);
  assert.ok(final.every(row => row.amountMinor === '101' && row.direction === 'out' && row.workspaceId === account.workspace.id));
  const summary = (await api(account, '/api/summary')).data;
  assert.equal(summary.transactionCount, 50); assert.equal(summary.outflowMinor, '5050'); assert.equal(summary.netMovementMinor, '-5050');
  const original = (await api(account, `/api/imports/${batches[loser].importId}`)).data;
  assert.deepEqual(original.preview, failed.preview);
  ok('explicit rejection makes the rolled-back import retriable; original preview and exact 50-record cash remain correct');
  console.log(`${passed}/5 managed import-cap groups pass. Exactly 50 synthetic records retained in the dedicated test workspace; no deletion, account creation or deployment.`);
} catch (error) {
  console.error(`FAIL during ${phase}. No identifiers, tokens, records or raw provider errors emitted. Synthetic fixtures may remain after a partial run; do not rerun against a nonempty workspace.`);
  if (error instanceof CheckFailure) console.error(error.message);
  process.exitCode = 1;
}
