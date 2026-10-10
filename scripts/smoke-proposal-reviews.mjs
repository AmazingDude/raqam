// Hosted native-session checks. Only guarded synthetic fixtures; no AI calls,
// new accounts, service-role access or automatic request retries. --storage-only
// removes only newly created, unreferenced disposable files after ownership checks.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { proposalReviewResultSchema } from '../src/lib/contracts/proposals.ts';
const env = process.env;
const base = new URL(env.REVIEW_BASE_URL ?? 'http://localhost:3188');
const origin = new URL(env.APP_URL ?? 'http://localhost:3000').origin;
const provenance = { modelVersion: 'synthetic-hosted-check', promptVersion: 'v1', schemaVersion: 'v1' };
const fields = { counterparty: null, date: '2026-10-10', totalMinor: '10005', currency: 'PKR', reference: null };
let phase = 'readiness', passed = 0;
class CheckFailure extends Error {}
const ok = name => { passed++; console.log(`PASS ${name}`); };
function check(value) { if (!value) throw new Error('validation'); }
async function clerk(path, method = 'GET') {
  const response = await fetch(`https://api.clerk.com/v1/${path}`, { method,
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(15000) });
  check(response.ok); return response.json();
}
async function api(account, path, { method = 'GET', body, form, expected = 200 } = {}) {
  const token = await account.token();
  const response = await fetch(new URL(path, base), { method, redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
  if (!(Array.isArray(expected) ? expected.includes(response.status) : response.status === expected)) throw new CheckFailure(`HTTP ${response.status} differed from expected status`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  if (Array.isArray(expected)) {
    if (response.status === 409) { assert.equal(result.error?.code, 'CONFLICT'); assert.equal(result.data, null); }
    else { assert.equal(result.error, null); proposalReviewResultSchema.parse(result.data); }
    return { status: response.status, data: result.data };
  }
  if (expected >= 400) { assert.equal(result.data, null); return result.error; }
  assert.equal(result.error, null); return result.data;
}
async function rpc(account, name, body, expectedCode) {
  const result = await account.database.rpc(name, body);
  if (expectedCode) { assert.equal(result.error?.code, expectedCode); assert.equal(result.data, null); return; }
  if (result.error !== null) throw new CheckFailure(`RPC ${name} denied with ${/^[A-Z0-9_]{1,20}$/.test(result.error.code) ? result.error.code : 'unknown code'}`);
  return result.data;
}
const command = (proposalId, expectedVersion, decision = 'accept', extra = {}) => ({
  requestId: randomUUID(), proposalId, expectedVersion, decision, ...extra,
});
async function review(account, input, expected = 200) {
  const result = await api(account, '/api/reviews', { method: 'POST', body: input, expected });
  return expected === 200 ? proposalReviewResultSchema.parse(result) : result;
}
async function snapshot(account) {
  return rpc(account, 'read_cashbook_snapshot', { p_workspace_id: account.workspace.id });
}
async function category(account, txn) {
  const result = await rpc(account, 'register_category_proposals', { p_request_id: randomUUID(), p_provenance: provenance,
    p_proposals: [{ transactionId: txn.id, transactionVersion: txn.reviewVersion, category: 'travel', rationale: 'Synthetic proposal', status: 'proposed' }] });
  return result.items[0];
}
try {
  check(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname));
  check(env.CLERK_SECRET_KEY?.startsWith('sk_test_'));
  const users = await clerk('users?limit=3'); check(Array.isArray(users) && users.length === 2);
  const accounts = [];
  for (const user of users) {
    const response = await clerk(`sessions?user_id=${encodeURIComponent(user.id)}&status=active&limit=1`);
    const sessions = Array.isArray(response) ? response : response.data;
    check(sessions?.[0]?.user_id === user.id);
    const account = { subject: user.id, session: sessions[0].id, jwt: null, expires: 0 };
    account.token = async () => {
      if (account.jwt && account.expires > Date.now() / 1000 + 15) return account.jwt;
      const result = await clerk(`sessions/${encodeURIComponent(account.session)}/tokens`, 'POST');
      const claims = JSON.parse(Buffer.from(result.jwt.split('.')[1], 'base64url').toString());
      const domain = Buffer.from(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.split('_').slice(2).join('_'), 'base64').toString().replace(/\$$/, '');
      check(claims.sub === user.id && claims.role === 'authenticated' && claims.iss === `https://${domain}`);
      account.jwt = result.jwt; account.expires = claims.exp; return account.jwt;
    };
    account.database = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      accessToken: account.token, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      db: { retry: false },
      global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(15000) }) },
    });
    account.workspace = await api(account, '/api/workspace');
    check(account.workspace?.businessName === 'Raqam synthetic validation' && account.workspace.ownerSubject === user.id);
    accounts.push(account);
  }
  if (process.argv.includes('--storage-only')) {
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWQAAAABJRU5ErkJggg==', 'base64');
    for (const [index, owner] of accounts.entries()) {
      const foreign = accounts[1-index];
      phase = `account ${index + 1} disposable Storage setup`;
      const path = `${owner.workspace.id}/synthetic-storage-${randomUUID()}.png`;
      const absent = await owner.database.from('sources').select('id').eq('storage_path', path);
      check(absent.error === null && absent.data.length === 0);
      const bucket = owner.database.storage.from('raqam-sources');
      const inserted = await bucket.upload(path, bytes, { contentType: 'image/png', upsert: false });
      check(inserted.error === null && inserted.data.path === path);
      const unchanged = async () => {
        const downloaded = await bucket.download(path); check(downloaded.error === null);
        assert.deepEqual(Buffer.from(await downloaded.data.arrayBuffer()), bytes);
      };
      await unchanged();
      phase = `account ${index + 1} foreign Storage mutation denial`;
      const foreignBucket = foreign.database.storage.from('raqam-sources');
      const foreignPath = `${owner.workspace.id}/synthetic-storage-${randomUUID()}.png`;
      const forgedInsert = await foreignBucket.upload(foreignPath, bytes, { contentType: 'image/png', upsert: false });
      check(forgedInsert.error !== null);
      const notInserted = await bucket.download(foreignPath); check(notInserted.error !== null && notInserted.data === null);
      const forgedUpdate = await foreignBucket.update(path, Buffer.concat([bytes, Buffer.from('foreign-attempt')]), { contentType: 'image/png', upsert: false });
      check(forgedUpdate.error !== null); await unchanged();
      // Storage DELETE may return success with [] when RLS hides the target.
      const forgedDelete = await foreignBucket.remove([path]);
      check(forgedDelete.error !== null || (Array.isArray(forgedDelete.data) && forgedDelete.data.length === 0));
      await unchanged();
      ok(`account ${index + 1}: foreign Storage INSERT/UPDATE/DELETE denied; owned bytes preserved`);
      phase = `account ${index + 1} owned disposable Storage lifecycle`;
      const updated = await bucket.update(path, bytes, { contentType: 'image/png', upsert: false });
      if (updated.error !== null) throw new CheckFailure(`Owned Storage update failed (HTTP ${/^\d{3}$/.test(String(updated.error.statusCode)) ? updated.error.statusCode : 'unknown'})`);
      phase = `account ${index + 1} owned Storage update byte check`;
      await unchanged();
      // Recheck exact workspace prefix and lack of source references before removal.
      check(path.startsWith(`${owner.workspace.id}/synthetic-storage-`));
      const references = await owner.database.from('sources').select('id').eq('storage_path', path);
      check(references.error === null && references.data.length === 0);
      phase = `account ${index + 1} owned Storage removal`;
      const removed = await bucket.remove([path]); check(removed.error === null && removed.data.length === 1);
      phase = `account ${index + 1} owned Storage removal verification`;
      // An already fetched object may remain in Storage's download cache. Verify
      // authoritative object metadata rather than inferring deletion from bytes.
      const gone = await bucket.list(owner.workspace.id, { search: path.split('/')[1], limit: 2 });
      check(gone.error === null && gone.data.length === 0);
      ok(`account ${index + 1}: owner INSERT/UPDATE/DELETE works only on the newly created disposable file`);
    }
    console.log(`${passed}/4 hosted Storage mutation groups pass. Only newly created unreferenced disposable files removed; financial records untouched.`);
    process.exit(0);
  }
  phase = '007 grants and projection';
  for (const account of accounts) {
    for (const table of ['proposal_reviews', 'accepted_matches', 'proposal_review_operations']) {
      phase = `${table} authenticated read grant`;
      const result = await account.database.from(table).select('*').limit(0); check(result.error === null);
      // Fresh nonexistent IDs make unexpected DELETE grants harmless to existing records.
      phase = `${table} direct delete denial`;
      const denied = await account.database.from(table).delete().eq(table === 'proposal_review_operations' ? 'request_id' : 'id', randomUUID());
      if (denied.error?.code !== '42501') throw new CheckFailure(`Direct deletion denial returned ${/^[A-Z0-9_]{1,20}$/.test(denied.error?.code) ? denied.error.code : 'unknown code'}`);
    }
    const projection = await account.database.from('cashbook_records').select('match_status').limit(0); check(projection.error === null);
    await rpc(account, 'review_ai_proposal', { p_proposal_id: randomUUID(), p_request_id: randomUUID(), p_expected_version: 0,
      p_decision: { decision: 'reject' } }, 'P0002');
  }
  ok('007 owner grants, denied direct deletion, persisted match projection and review RPC');
  // Verify both workspaces/capacity before any fixture write.
  for (const account of accounts) {
    const current = await snapshot(account); check(current.records.length <= 47);
  }
  for (const [index, account] of accounts.entries()) {
    phase = `account ${index + 1} synthetic fixture creation`;
    const tag = randomUUID();
    const csv = `date,description,direction,amount,reference\n2026-10-10,Synthetic review one,out,100.05,${tag}-1\n2026-10-10,Synthetic review two,out,100.05,${tag}-2\n2026-10-10,Synthetic review mismatch,out,100.06,${tag}-3\n`;
    const form = new FormData(); form.set('file', new File([csv], 'synthetic-review.csv', { type: 'text/csv' }));
    const batch = await api(account, '/api/imports', { method: 'POST', expected: 201, form });
    const receipt = await api(account, `/api/imports/${batch.importId}/confirmation`, { method: 'POST', body: {} });
    assert.equal(receipt.importedCount, 3);
    const rows = await api(account, '/api/transactions?limit=50');
    account.txns = rows.items.filter(row => row.source.sourceId === batch.importId).sort((a,b) => a.source.rowNumber - b.source.rowNumber);
    assert.equal(account.txns.length, 3);
    for (const txn of account.txns) txn.reviewVersion = (await api(account, `/api/transactions/${txn.id}`)).reviewVersion;
    account.before = await snapshot(account);
    // Distinct PNG fixture content keeps prior synthetic documents untouched.
    const pixel = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWQAAAABJRU5ErkJggg==', 'base64'), Buffer.from(tag)]);
    const image = new FormData(); image.set('file', new File([pixel], 'synthetic-review.png', { type: 'image/png' }));
    const source = await api(account, '/api/sources', { method: 'POST', expected: 201, form: image });
    const registered = await rpc(account, 'register_supporting_document', { p_source_id: source.sourceId });
    assert.equal(registered.duplicate, false); account.doc = registered.record.document.id;
    const duplicateDoc = await rpc(account, 'register_supporting_document', { p_source_id: source.sourceId });
    assert.equal(duplicateDoc.duplicate, true);
    const extractionKey = randomUUID();
    const reservation = await rpc(account, 'reserve_document_extraction', { p_document_id: account.doc, p_request_id: extractionKey, p_expected_version: 0, p_provenance: provenance });
    assert.equal(reservation.state, 'reserved');
    const extracted = await rpc(account, 'save_document_extraction', { p_document_id: account.doc, p_request_id: extractionKey, p_expected_version: 0,
      p_outcome: { status: 'complete', fields, provenance } });
    assert.equal(extracted.record.reviewVersion, 1);
    const reviewed = await rpc(account, 'review_supporting_document', { p_document_id: account.doc, p_request_id: randomUUID(), p_expected_version: 1,
      p_decision: { action: 'accept', fields } });
    assert.equal(reviewed.record.reviewVersion, 2);
    const afterDocument = await snapshot(account); assert.deepEqual(afterDocument, account.before);
    ok(`account ${index + 1}: synthetic extraction/review persists without creating cash`);
    phase = `account ${index + 1} category decisions`;
    const prop = await category(account, account.txns[0]); account.category = prop;
    const accept = command(prop.id, 0); account.categoryRequestId = accept.requestId;
    const accepted = await review(account, accept);
    assert.equal(accepted.proposal.status, 'accepted');
    await review(account, { ...accept, decision: 'reject' }, 409);
    await review(account, command(prop.id, 0, 'reject'), 409);
    await review(account, command(prop.id, 1, 'correct_category', { category: 'software_services' }));
    const duplicate = await review(account, accept); assert.equal(duplicate.duplicate, true);
    assert.deepEqual(duplicate.proposal, accepted.proposal);
    await review(account, command(prop.id, 2, 'reject'));
    const history = await api(account, `/api/reviews?proposalId=${prop.id}&limit=2`);
    assert.equal(history.items.length, 2); assert.equal(history.nextCursor, '2');
    const page2 = await api(account, `/api/reviews?proposalId=${prop.id}&cursor=2&limit=2`);
    assert.equal(page2.items.length, 1); assert.equal(page2.nextCursor, null);
    assert.ok([...history.items, ...page2.items].every(item => item.actorSubject === account.subject));
    ok(`account ${index + 1}: category accept/correct/reject, immutable retries, stale conflicts and history pagination`);
    phase = `account ${index + 1} competing match approvals`;
    for (const txn of account.txns) txn.reviewVersion = (await api(account, `/api/transactions/${txn.id}`)).reviewVersion;
    const batchMatches = await rpc(account, 'register_match_proposals', { p_request_id: randomUUID(), p_provenance: provenance,
      p_proposals: account.txns.map(txn => ({ transactionId: txn.id, transactionVersion: txn.reviewVersion, documentId: account.doc,
        documentVersion: 2, rationale: 'Synthetic candidate', status: 'proposed' })) });
    phase = `account ${index + 1} mismatched match denial`;
    await review(account, command(batchMatches.items[2].id, 0), 422);
    // Two independent HTTP requests race on the managed database; exactly one may allocate the document.
    phase = `account ${index + 1} concurrent match requests`;
    const raced = await Promise.all(batchMatches.items.slice(0,2).map(prop => api(account, '/api/reviews', {
      method: 'POST', body: command(prop.id, 0), expected: [200,409],
    })));
    assert.deepEqual(raced.map(result => result.status).sort(), [200,409]);
    const winnerIndex = raced.findIndex(result => result.status === 200);
    const winner = raced[winnerIndex].data; account.match = winner.proposal;
    const loserIndex = 1 - winnerIndex;
    await review(account, command(batchMatches.items[loserIndex].id, 0), 409);
    const allocations = await account.database.from('accepted_matches').select('id,transaction_id').eq('document_id', account.doc).eq('active', true);
    check(allocations.error === null); assert.equal(allocations.data.length, 1);
    assert.equal(allocations.data[0].transaction_id, winner.proposal.transactionId);
    await rpc(account, 'review_supporting_document', { p_document_id: account.doc, p_request_id: randomUUID(), p_expected_version: 2,
      p_decision: { action: 'accept', fields } }, 'PT409');
    ok(`account ${index + 1}: real concurrent competing approvals leave exactly one allocation; document review fenced`);
    phase = `account ${index + 1} match correction rollback`;
    await review(account, command(winner.proposal.id, 1, 'correct_match', { transactionId: account.txns[2].id, transactionVersion: account.txns[2].reviewVersion }), 422);
    const unchanged = await account.database.from('accepted_matches').select('id').eq('document_id', account.doc).eq('active', true);
    assert.deepEqual(unchanged.data, [{ id: winner.match.id }]);
    const corrected = await review(account, command(winner.proposal.id, 1, 'correct_match', {
      transactionId: account.txns[loserIndex].id, transactionVersion: account.txns[loserIndex].reviewVersion,
    }));
    assert.equal(corrected.match.transactionId, account.txns[loserIndex].id);
    const projected = (await api(account, `/api/transactions/${corrected.match.transactionId}`)).transaction;
    assert.equal(projected.matchStatus, 'accepted');
    const listed = (await api(account, '/api/transactions?limit=50')).items.find(txn => txn.id === corrected.match.transactionId);
    assert.equal(listed?.matchStatus, 'accepted');
    await review(account, command(winner.proposal.id, 2, 'reject'));
    const historical = await account.database.from('accepted_matches').select('active').eq('document_id', account.doc);
    check(historical.error === null); assert.equal(historical.data.length, 2); assert.ok(historical.data.every(row => row.active === false));
    const after = await snapshot(account);
    const stableCash = snap => snap.records.map(row => ({ id: row.id, amountMinor: row.amount_minor, currency: row.currency, date: row.date,
      direction: row.direction, sourceId: row.source_id, sourceRow: row.source_row })).sort((a,b) => a.id.localeCompare(b.id));
    assert.deepEqual(stableCash(after), stableCash(account.before));
    ok(`account ${index + 1}: incompatible correction rolls back; valid correction/rejection retains history and exact cash`);
  }
  for (const [index, account] of accounts.entries()) {
    phase = `account ${index + 1} foreign resource denial`;
    const other = accounts[1-index];
    await review(account, command(other.category.id, 3, 'reject'), 404);
    await api(account, `/api/reviews?proposalId=${other.category.id}`, { expected: 404 });
    await rpc(account, 'review_supporting_document', { p_document_id: other.doc, p_request_id: randomUUID(), p_expected_version: 2,
      p_decision: { action: 'reject' } }, 'P0002');
    for (const [table, column, value] of [['supporting_documents','id',other.doc], ['document_history','document_id',other.doc],
      ['ai_proposals','id',other.category.id], ['proposal_reviews','proposal_id',other.category.id],
      ['accepted_matches','document_id',other.doc], ['proposal_review_operations','request_id',other.categoryRequestId]]) {
      phase = `account ${index + 1} foreign ${table} read`;
      const hidden = await account.database.from(table).select('*').eq(column, value);
      check(hidden.error === null); assert.deepEqual(hidden.data, []);
    }
    ok(`account ${index + 1}: foreign review API/document RPC and six populated RLS relations deny access`);
  }
  console.log(`${passed}/11 hosted groups pass. Synthetic fixtures retained; no live AI, deletion, deployment or full release claim.`);
} catch (error) {
  console.error(`FAIL during ${phase}. No identifiers, financial payloads, tokens or raw provider errors emitted.`);
  if (error instanceof CheckFailure) console.error(error.message);
  process.exitCode = 1;
}
