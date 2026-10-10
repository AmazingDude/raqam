// Two existing signed-in development users; only guarded synthetic fixtures.
// Tokens/identifiers/records stay in memory. Never creates users or deletes records.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const env = process.env;
const base = new URL(env.APP_URL ?? 'http://localhost:3000');
const businessName = 'Raqam synthetic validation';
let phase = 'two-account readiness'; let passed = 0;
class ValidationError extends Error {}
function requireCondition(condition, message) { if (!condition) throw new ValidationError(message); }
function ok(label) { passed++; console.log(`PASS ${label}`); }
async function clerk(path, method = 'GET') {
  const response = await fetch(`https://api.clerk.com/v1/${path}`, { method,
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(15000) });
  requireCondition(response.ok, `Clerk readiness failed (HTTP ${response.status}).`);
  return response.json();
}
try {
  requireCondition(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Isolation smoke requires localhost.');
  requireCondition(env.CLERK_SECRET_KEY?.startsWith('sk_test_'), 'Isolation smoke requires a development instance.');
  const users = await clerk('users?limit=3');
  requireCondition(Array.isArray(users) && users.length === 2, 'Exactly two development test users are required; sign in with the second account first.');
  const configuredDomain = Buffer.from(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.split('_').slice(2).join('_'), 'base64').toString('utf8').replace(/\$$/, '');
  const accounts = [];
  for (const user of users) {
    const response = await clerk(`sessions?user_id=${encodeURIComponent(user.id)}&status=active&limit=2`);
    const sessions = Array.isArray(response) ? response : response.data;
    requireCondition(sessions?.length > 0 && sessions[0].user_id === user.id, 'Both test accounts need active sessions.');
    const account = { subject: user.id, session: sessions[0].id, jwt: null, expires: 0 };
    account.token = async () => {
      if (account.jwt && account.expires > Math.floor(Date.now() / 1000) + 10) return account.jwt;
      const result = await clerk(`sessions/${encodeURIComponent(account.session)}/tokens`, 'POST');
      requireCondition(typeof result.jwt === 'string', 'Native token missing.');
      const claims = JSON.parse(Buffer.from(result.jwt.split('.')[1], 'base64url').toString('utf8'));
      requireCondition(claims.sub === account.subject && claims.role === 'authenticated' && claims.iss === `https://${configuredDomain}`, 'Native test identity or role mismatch.');
      account.jwt = result.jwt; account.expires = claims.exp;
      return account.jwt;
    };
    account.database = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      accessToken: account.token, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(15000) }) },
    });
    accounts.push(account);
  }
  async function api(account, path, { method = 'GET', body, form, expected = 200 } = {}) {
    const bearer = await account.token();
    const response = await fetch(new URL(path, base), { method, redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${bearer}`, Origin: base.origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
    requireCondition(response.status === expected, `Isolation API result differed (HTTP ${response.status}; expected ${expected}).`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    if (expected < 400) { assert.equal(result.error, null); return result.data; }
    assert.equal(result.data, null); return result.error;
  }
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWQAAAABJRU5ErkJggg==', 'base64');
  for (const [index, account] of accounts.entries()) {
    phase = `synthetic setup for account ${index + 1}`;
    account.workspace = await api(account, '/api/workspace');
    if (!account.workspace) account.workspace = await api(account, '/api/workspace', { method: 'POST', expected: 201, body: { businessName } });
    requireCondition(account.workspace.businessName === businessName && account.workspace.ownerSubject === account.subject, 'Refusing to mix fixtures into an ordinary business workspace.');
    const csv = 'date,description,direction,amount,reference\n2026-10-10,Synthetic isolation receipt,in,1.01,ISOLATION-1\n';
    const form = new FormData(); form.set('file', new File([csv], 'synthetic-isolation.csv', { type: 'text/csv' }));
    account.batch = await api(account, '/api/imports', { method: 'POST', expected: 201, form });
    const receipt = await api(account, `/api/imports/${account.batch.importId}/confirmation`, { method: 'POST', body: {} });
    assert.equal(receipt.importedCount, 1);
    const rows = (await api(account, '/api/transactions?limit=50')).items.filter(row => row.source.sourceId === account.batch.importId);
    assert.equal(rows.length, 1); assert.equal(rows[0].amountMinor, '101');
    const detail = await api(account, `/api/transactions/${rows[0].id}`);
    account.cash = await api(account, `/api/transactions/${rows[0].id}`, { method: 'PATCH',
      body: { expectedVersion: detail.reviewVersion, description: 'Reviewed isolation receipt', category: 'customer_receipts' } });
    const history = await api(account, `/api/transactions/${rows[0].id}/reviews`);
    assert.ok(history.items.length > 0);
    const image = new FormData(); image.set('file', new File([pixel], 'synthetic-isolation.png', { type: 'image/png' }));
    account.image = await api(account, '/api/sources', { method: 'POST', expected: 201, form: image });
    const metadata = await account.database.from('sources').select('storage_path').eq('id', account.image.sourceId).single();
    assert.equal(metadata.error, null); account.storagePath = metadata.data.storage_path;
    assert.ok(account.storagePath.startsWith(`${account.workspace.id}/`));
    const ownFile = await account.database.storage.from('raqam-sources').download(account.storagePath);
    assert.equal(ownFile.error, null); assert.deepEqual(Buffer.from(await ownFile.data.arrayBuffer()), pixel);
    ok(`account ${index + 1} native identity, synthetic persistence/history and own private file`);
  }
  assert.notEqual(accounts[0].workspace.id, accounts[1].workspace.id);
  for (const [index, caller] of accounts.entries()) {
    const other = accounts[1 - index]; const direction = `account ${index + 1} to ${2 - index}`;
    phase = `${direction} API isolation`;
    const transactionId = other.cash.transaction.id;
    for (const path of [`/api/transactions/${transactionId}`, `/api/transactions/${transactionId}/reviews`,
      `/api/imports/${other.batch.importId}`, `/api/imports/${other.batch.importId}/resolutions`, `/api/sources/${other.image.sourceId}`]) {
      assert.equal((await api(caller, path, { expected: 404 })).code, 'NOT_FOUND');
    }
    assert.equal((await api(caller, `/api/transactions/${transactionId}`, { method: 'PATCH', expected: 404,
      body: { expectedVersion: other.cash.reviewVersion, description: other.cash.transaction.description } })).code, 'NOT_FOUND');
    assert.equal((await api(caller, `/api/imports/${other.batch.importId}/confirmation`, { method: 'POST', expected: 404, body: {} })).code, 'NOT_FOUND');
    const summary = await api(caller, '/api/summary');
    assert.ok(summary.transactionIds.includes(caller.cash.transaction.id)); assert.ok(!summary.transactionIds.includes(transactionId));
    ok(`${direction}: seven foreign-resource API reads/commands denied; summary scoped`);
    phase = `${direction} database isolation`;
    for (const [table, column, value] of [
      ['workspaces', 'id', other.workspace.id], ['sources', 'id', other.image.sourceId],
      ['transactions', 'id', transactionId], ['cashbook_records', 'id', transactionId],
      ['imports', 'source_id', other.batch.importId], ['review_decisions', 'target_id', other.batch.importId],
      ['transaction_reviews', 'transaction_id', transactionId],
    ]) {
      phase = `${direction} ${table} RLS`;
      const result = await caller.database.from(table).select('*').eq(column, value);
      assert.equal(result.error, null); assert.deepEqual(result.data, []);
    }
    phase = `${direction} snapshot RPC`;
    const snapshot = await caller.database.rpc('read_cashbook_snapshot', { p_workspace_id: other.workspace.id });
    assert.equal(snapshot.error, null); assert.deepEqual(snapshot.data.records, []); assert.equal(snapshot.data.unresolvedImportRowCount, 0);
    phase = `${direction} resolution snapshot RPC`;
    const rowState = await caller.database.rpc('read_import_resolution_state', { p_import_id: other.batch.importId });
    assert.equal(rowState.error, null); assert.equal(rowState.data, null);
    phase = `${direction} review RPC`;
    const review = await caller.database.rpc('review_cashbook_transaction', { p_transaction_id: transactionId,
      p_expected_version: other.cash.reviewVersion, p_patch: { description: other.cash.transaction.description } });
    assert.equal(review.error?.code, 'P0002'); assert.equal(review.data, null);
    phase = `${direction} confirmation RPC`;
    const confirmation = await caller.database.rpc('confirm_csv_import', { p_import_id: other.batch.importId, p_rows: [] });
    assert.equal(confirmation.error?.code, 'P0002');
    ok(`${direction}: seven RLS relations and four scoped RPC checks deny foreign evidence`);
    const update = await caller.database.from('transactions').update({ description: other.cash.transaction.description }).eq('id', transactionId);
    assert.equal(update.error?.code, '42501');
    // An impossible fresh ID tests DELETE privileges without deleting an existing record.
    const deletion = await caller.database.from('transactions').delete().eq('id', randomUUID()).eq('workspace_id', other.workspace.id);
    assert.equal(deletion.error?.code, '42501');
    const insertion = await caller.database.from('transactions').insert({ workspace_id: other.workspace.id,
      source_id: other.batch.importId, source_row: 2, date: '2026-10-10', description: 'Synthetic isolation receipt',
      original_description: 'Synthetic isolation receipt', original_values: [], direction: 'in', amount_minor: '101', currency: 'PKR' });
    assert.equal(insertion.error?.code, '42501');
    ok(`${direction}: direct cash INSERT/UPDATE/DELETE privileges denied without deleting records`);
    phase = `${direction} Storage isolation`;
    const foreignFile = await caller.database.storage.from('raqam-sources').download(other.storagePath);
    assert.ok(foreignFile.error); assert.equal(foreignFile.data, null);
    ok(`${direction}: known foreign private Storage path denied`);
    assert.equal((await api(other, `/api/transactions/${transactionId}`)).reviewVersion, other.cash.reviewVersion);
  }
  console.log(`${passed}/10 live two-account groups passed. Only synthetic fixtures retained; no accounts created or records deleted. Storage mutation policies, session expiry/account switching and true concurrent clients remain unverified.`);
} catch (error) {
  console.error(error instanceof ValidationError ? `FAIL ${error.message}` : `FAIL Isolation validation differed during ${phase}. No identifiers, payloads or credentials logged.`);
  process.exitCode = 1;
}
