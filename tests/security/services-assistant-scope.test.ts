import test from 'node:test';
import assert from 'node:assert/strict';
import { createCashbookTools } from '../../src/lib/server/assistant/cashbook-tools.ts';
import { BackendError } from '../../src/lib/server/errors.ts';
import { transaction } from '../backend/fixtures.ts';

const code = (expected: string) => (error: unknown) => error instanceof BackendError && error.code === expected;
const empty = async () => ({ records: [], unresolvedImportRowCount: 0 });
test('A2 tools reject forged scope, invalid arguments and unavailable semantics before reading', async () => {
  let reads = 0;
  const tools = createCashbookTools({ workspaceId: 'w1', deadlineAt: Date.now() + 10_000,
    readSnapshot: async () => { reads++; return empty(); } });
  for (const input of [{ workspaceId: 'w2' }, { ownerSubject: 'other' }, { direction: 'in' }, { limit: 0 }, { limit: 51 },
    { dateFrom: '2026-10-10', dateTo: '2026-10-01' }, { cursor: 'bad' }]) {
    await assert.rejects(tools.list_transactions(input), code('INVALID_INPUT'));
  }
  for (const input of [{}, { scope: 'profit' }]) await assert.rejects(tools.get_cash_summary(input), code('INVALID_INPUT'));
  await assert.rejects(tools.get_cash_summary({ scope: 'valid_imported_cash', dateFrom: '2026-10-01' }), code('UNAVAILABLE'));
  for (const matchStatus of ['accepted', 'proposed', 'unmatched']) {
    await assert.rejects(tools.list_transactions({ matchStatus }), code('UNAVAILABLE'));
  }
  assert.equal(reads, 0);
});
test('A2 cashbook tools fail closed on foreign, duplicate, malformed and over-cap snapshots', async () => {
  const invalid = [
    [transaction({ workspaceId: 'w2' })], [transaction(), transaction()],
    [transaction({ amountMinor: '0.1' })], [transaction({ source: { sourceId: 'image', rowNumber: null } })],
    Array.from({ length: 51 }, (_, n) => transaction({ id: `t${n}`, source: { sourceId: 's1', rowNumber: n + 2 } })),
  ];
  for (const records of invalid) {
    const tools = createCashbookTools({ workspaceId: 'w1', deadlineAt: Date.now() + 10_000,
      readSnapshot: async () => ({ records, unresolvedImportRowCount: 0 }) });
    await assert.rejects(tools.list_transactions({}), code('UNAVAILABLE'));
    await assert.rejects(tools.get_cash_summary({ scope: 'valid_imported_cash' }), code('UNAVAILABLE'));
  }
  for (const unresolvedImportRowCount of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
    const tools = createCashbookTools({ workspaceId: 'w1', deadlineAt: Date.now() + 10_000,
      readSnapshot: async () => ({ records: [], unresolvedImportRowCount }) });
    await assert.rejects(tools.get_cash_summary({ scope: 'valid_imported_cash' }), code('UNAVAILABLE'));
  }
});
test('A2 tools reject stale cursors and sanitize reader failures without inventing empty results', async () => {
  const tools = createCashbookTools({ workspaceId: 'w1', deadlineAt: Date.now() + 10_000, readSnapshot: empty });
  await assert.rejects(tools.list_transactions({ cursor: '20000000-0000-4000-8000-000000000001' }), code('CONFLICT'));
  let reads = 0;
  const failed = createCashbookTools({ workspaceId: 'w1', deadlineAt: Date.now() + 10_000,
    readSnapshot: async () => { reads++; throw new Error('private database diagnostic'); } });
  await assert.rejects(failed.list_transactions({}), error => code('UNAVAILABLE')(error) &&
    error instanceof Error && !error.message.includes('private'));
  await assert.rejects(failed.get_cash_summary({ scope: 'valid_imported_cash' }), code('UNAVAILABLE'));
  assert.equal(reads, 1);
});
test('A2 tools enforce cancellation and request deadlines for unresolved reads', async () => {
  let reads = 0;
  const cancelled = new AbortController(); cancelled.abort();
  const tools = createCashbookTools({ workspaceId: 'w1', deadlineAt: Date.now() + 10_000, signal: cancelled.signal,
    readSnapshot: async () => { reads++; return empty(); } });
  await assert.rejects(tools.list_transactions({}), code('UNAVAILABLE'));
  assert.equal(reads, 0);
  const timed = createCashbookTools({ workspaceId: 'w1', deadlineAt: Date.now() + 20,
    readSnapshot: () => new Promise(() => {}) });
  await assert.rejects(timed.get_cash_summary({ scope: 'valid_imported_cash' }), code('UNAVAILABLE'));
  const controller = new AbortController();
  const inflight = createCashbookTools({ workspaceId: 'w1', deadlineAt: Date.now() + 10_000, signal: controller.signal,
    readSnapshot: () => new Promise(() => {}) });
  const pending = inflight.list_transactions({}); controller.abort();
  await assert.rejects(pending, code('UNAVAILABLE'));
});
