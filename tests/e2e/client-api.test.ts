import test from 'node:test';
import assert from 'node:assert/strict';
import { api, cashSummarySchema, ClientError, exportResponse } from '../../src/lib/client/api.ts';

const id = '30000000-0000-4000-8000-000000000001';
const summary = { currency: 'PKR', inflowMinor: '90071992547409930', outflowMinor: '1', netMovementMinor: '90071992547409929', transactionCount: 1, transactionIds: [id], unresolvedImportRowCount: 2, categories: {}, unreviewed: { inflowMinor: '90071992547409930', outflowMinor: '1', netMovementMinor: '90071992547409929' } };
function envelope(data: unknown, status = 200) { return Response.json({ data, error: null }, { status }); }

test('client summary validates exact cash, category reconciliation and complete scope without number rounding', () => {
  assert.equal(cashSummarySchema.parse(summary).inflowMinor, '90071992547409930');
  for (const invalid of [
    { ...summary, inflowMinor: 90071992547409930 }, { ...summary, inflowMinor: 'not-money' },
    { ...summary, netMovementMinor: '9.99' }, { ...summary, netMovementMinor: '0' },
    { ...summary, transactionCount: 2 }, { ...summary, transactionIds: [id, id], transactionCount: 2 },
    { ...summary, unreviewed: { ...summary.unreviewed, inflowMinor: '1' } },
  ]) assert.equal(cashSummarySchema.safeParse(invalid).success, false);
});

test('client reads reject malformed successes and preserve actionable auth/conflict errors', async t => {
  const signal = new AbortController().signal;
  for (const response of [new Response('<html>sign in</html>'), envelope({ ...summary, inflowMinor: 0 })]) {
    t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(api.summary(signal), error => error instanceof ClientError && error.code === 'UNAVAILABLE');
    t.mock.restoreAll();
  }
  for (const code of ['UNAUTHENTICATED', 'CONFLICT']) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ data: null, error: { code, message: 'Reload before saving.' } }, { status: 409 }));
    await assert.rejects(api.transaction(id, signal), error => error instanceof ClientError && error.code === code && error.message === 'Reload before saving.');
    t.mock.restoreAll();
  }
});

test('client commands send exact shared-contract decisions, stable request IDs and abort signals', async t => {
  const calls: { path: string; init: RequestInit }[] = [], controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (path: string | URL | Request, init: RequestInit) => {
    calls.push({ path: String(path), init });
    return envelope({ importId: id, requestId: id, correctedCount: 0, rejectedCount: 1, remainingUnresolvedCount: 0, transactionIds: [], duplicate: calls.length > 1 });
  });
  const input = { requestId: id, rows: [{ rowNumber: 2, action: 'reject' as const }] };
  assert.equal((await api.resolveImport(id, input, controller.signal)).duplicate, false);
  assert.equal((await api.resolveImport(id, input, controller.signal)).duplicate, true);
  assert.equal(calls[0]!.init.body, calls[1]!.init.body);
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), input);
  assert.equal(calls[0]!.init.signal, controller.signal);
  assert.equal(calls[0]!.init.cache, 'no-store');
  assert.equal(calls[0]!.init.credentials, 'same-origin');
  assert.equal(calls[0]!.path, `/api/imports/${id}/resolutions`);
  assert.throws(() => api.reviewTransaction(id, { expectedVersion: 0, amountMinor: '0' } as never, controller.signal));
});

test('export only downloads verified CSV successes and surfaces failures without an error file', async () => {
  const csv = 'date,amount\r\n2026-10-10,100.01\r\n';
  assert.deepEqual(await exportResponse(new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'X-Raqam-Unresolved-Import-Rows': '2' } })), { csv, unresolved: 2 });
  for (const response of [new Response('<html>sign in</html>'), new Response(csv, { headers: { 'Content-Type': 'text/csv' } }), new Response(csv, { headers: { 'Content-Type': 'text/csv', 'X-Raqam-Unresolved-Import-Rows': '-1' } })]) {
    await assert.rejects(exportResponse(response), error => error instanceof ClientError && error.code === 'UNAVAILABLE');
  }
  await assert.rejects(exportResponse(Response.json({ data: null, error: { code: 'UNAUTHENTICATED', message: 'Sign in again.' } }, { status: 401 })), error => error instanceof ClientError && error.code === 'UNAUTHENTICATED');
});
