// Read-only API checks against existing guarded synthetic validation workspaces.
// Native session tokens stay in memory. No users, sessions or records are created/deleted.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createScopedAssistantTools } from '../src/lib/server/assistant/tools.ts';
import { formatAmount } from '../src/lib/server/money.ts';

const env = process.env;
const base = new URL(process.argv.find(arg => arg.startsWith('--url='))?.slice(6) ?? env.APP_URL ?? 'http://localhost:3000');
const origin = new URL(env.APP_URL).origin;
let passed = 0;
class CheckError extends Error {}
function requireCondition(value, message) { if (!value) throw new CheckError(message); }
function pass(label) { passed++; console.log(`PASS ${label}`); }
async function clerk(path, method = 'GET') {
  const response = await fetch(`https://api.clerk.com/v1/${path}`, { method,
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(15000) });
  requireCondition(response.ok, `Clerk test readiness failed (HTTP ${response.status}).`);
  return response.json();
}
async function request(path, token, body, expected = 200, requestOrigin = origin) {
  const response = await fetch(new URL(path, base), { method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Origin: requestOrigin,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(55000), redirect: 'manual' });
  requireCondition(response.status === expected, `Assistant check received HTTP ${response.status}; expected ${expected}.`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  if (expected >= 400) { assert.equal(result.data, null); return result.error; }
  assert.equal(result.error, null); return result.data;
}
try {
  requireCondition(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname), 'Assistant smoke requires localhost.');
  requireCondition(env.CLERK_SECRET_KEY?.startsWith('sk_test_'), 'Assistant smoke requires Clerk development credentials.');
  assert.equal((await request('/api/assistant', null, { question: 'hi' }, 401)).code, 'UNAUTHENTICATED');
  pass('signed-out assistant denied without caching');
  const users = await clerk('users?limit=20');
  requireCondition(Array.isArray(users), 'Development test user discovery is unavailable.');
  const accounts = [];
  for (const user of users) {
    if (accounts.length === 2) break;
    const raw = await clerk(`sessions?user_id=${encodeURIComponent(user.id)}&status=active&limit=2`);
    const sessions = Array.isArray(raw) ? raw : raw.data;
    if (!sessions?.length || sessions[0].user_id !== user.id) continue;
    const token = (await clerk(`sessions/${encodeURIComponent(sessions[0].id)}/tokens`, 'POST')).jwt;
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (claims.sub !== user.id || claims.role !== 'authenticated') continue;
    const workspace = await request('/api/workspace', token);
    if (!['Raqam synthetic validation', 'Raqam cap validation'].includes(workspace?.businessName) || workspace.ownerSubject !== user.id) continue;
    accounts.push({ token, workspace, subject: user.id });
    const greeting = await request('/api/assistant', token, { question: 'hi' });
    assert.equal(greeting.workspaceId, workspace.id); assert.match(greeting.text, /^Hi!/); assert.deepEqual(greeting.records, []);
  }
  requireCondition(accounts.length > 0, 'An existing active session in a guarded synthetic validation workspace is required. Ordinary business records were not read.');
  pass(`${accounts.length} native test session(s) receive their own workspace-scoped greeting`);
  const first = accounts[0];
  assert.equal((await request('/api/assistant', first.token, { question: 'hi', workspaceId: accounts[1]?.workspace.id ?? 'foreign-scope' }, 422)).code, 'INVALID_INPUT');
  assert.equal((await request('/api/assistant', first.token, { question: 'hi' }, 422, 'https://foreign.invalid')).code, 'INVALID_INPUT');
  pass('forged workspace and foreign-origin requests denied');
  const summary = await request('/api/summary', first.token);
  const answer = await request('/api/assistant', first.token, { question: 'What is our net cash movement?' });
  assert.equal(answer.workspaceId, first.workspace.id);
  assert.ok(answer.actionTrail.some(entry => entry.tool === 'get_cash_summary'));
  assert.ok(answer.text.includes(`PKR ${formatAmount(summary.netMovementMinor)}`));
  assert.ok(answer.records.every(record => record.workspaceId === first.workspace.id && summary.transactionIds.includes(record.id)));
  pass('live Groq answer agrees with exact hosted synthetic cash summary');
  const foreignRows = accounts[1] ? (await request('/api/transactions?limit=50', accounts[1].token)).items : [];
  const inaccessibleId = foreignRows[0]?.id ?? 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const database = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    accessToken: async () => first.token, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const scoped = createScopedAssistantTools({ subject: first.subject, database, configuration: env }, first.workspace, { deadlineAt: Date.now() + 15000 });
  await assert.rejects(scoped.get_record_evidence({ transactionIds: [inaccessibleId] }), error => error?.code === 'NOT_FOUND');
  const documents = await scoped.get_review_queue({ kind: 'unresolved_document_fields' });
  assert.ok(documents.citations.every(c => c.kind === 'document'));
  pass(`native scoped tools deny ${foreignRows.length ? 'foreign' : 'nonexistent'} evidence and read owned document queue`);
  if (!foreignRows.length) console.log('Actual two-account foreign-evidence check remains pending; no second populated active fixture was available.');
  console.log(`${passed}/5 assistant HTTP/native/Groq groups passed; guarded synthetic records only, zero financial writes.`);
} catch (error) {
  console.error(error instanceof CheckError ? error.message : 'Assistant smoke failed an assertion or service check; private diagnostics omitted.');
  process.exitCode = 1;
}
