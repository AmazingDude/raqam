import test from 'node:test';
import assert from 'node:assert/strict';
import { createCashbookTools } from '../../src/lib/server/assistant/cashbook-tools.ts';
import { transaction } from './fixtures.ts';

const ids = [1, 2, 3, 4].map(n => `20000000-0000-4000-8000-00000000000${n}`);
function records() {
  return [
    transaction({ id: ids[0]!, date: '2026-10-01', amountMinor: '9007199254740993' }),
    transaction({ id: ids[1]!, date: '2026-10-02', direction: 'out', amountMinor: '3', source: { sourceId: 's1', rowNumber: 3 }, category: 'software_services', categoryStatus: 'accepted' }),
    transaction({ id: ids[2]!, date: '2026-10-03', direction: 'out', amountMinor: '7', source: { sourceId: 's1', rowNumber: 4 } }),
    transaction({ id: ids[3]!, date: '2026-10-04', amountMinor: '0', source: { sourceId: 's1', rowNumber: 5 }, category: 'customer_receipts', categoryStatus: 'accepted' }),
  ];
}
test('A2 cashbook tools filter and page one request snapshot while whole-scope totals stay exact', async () => {
  let reads = 0;
  const tools = createCashbookTools({ workspaceId: 'w1', deadlineAt: Date.now() + 10_000,
    readSnapshot: async () => { reads++; return { records: records().reverse(), unresolvedImportRowCount: 2 }; } });
  const first = await tools.list_transactions({ limit: 2 });
  assert.deepEqual(first.items.map(record => record.id), ids.slice(0, 2));
  assert.equal(first.nextCursor, ids[1]);
  assert.equal(first.complete, false);
  assert.equal(first.returnedCount, 2);
  assert.equal(first.totalCount, 4);
  assert.equal(first.snapshot.workspaceId, 'w1');
  assert.equal(first.snapshot.version, 1);
  const second = await tools.list_transactions({ limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items.map(record => record.id), ids.slice(2));
  assert.equal(second.nextCursor, null);
  assert.equal(second.complete, false, 'a cursor page is not a complete first-page result');
  assert.deepEqual((await tools.list_transactions({ dateFrom: '2026-10-02', dateTo: '2026-10-03' })).items.map(record => record.id), ids.slice(1, 3));
  assert.deepEqual((await tools.list_transactions({ category: 'software_services', categoryStatus: 'accepted' })).items.map(record => record.id), [ids[1]]);
  assert.deepEqual((await tools.list_transactions({ categoryStatus: 'needs_review' })).items.map(record => record.id), [ids[0], ids[2]]);
  const summary = await tools.get_cash_summary({ scope: 'valid_imported_cash' });
  assert.equal(summary.complete, true);
  assert.equal(summary.returnedCount, 4);
  assert.equal(summary.totalCount, 4);
  assert.equal(summary.summary.inflowMinor, '9007199254740993');
  assert.equal(summary.summary.outflowMinor, '10');
  assert.equal(summary.summary.netMovementMinor, '9007199254740983');
  assert.equal(summary.summary.transactionCount, 4);
  assert.equal(summary.summary.unresolvedImportRowCount, 2);
  assert.equal(summary.summary.categories.software_services?.outflowMinor, '3');
  assert.equal(summary.summary.categories.customer_receipts?.inflowMinor, '0');
  assert.equal(summary.summary.unreviewed.outflowMinor, '7');
  assert.equal(reads, 1);
});
test('A2 snapshots are detached from returned pages and isolated between requests', async () => {
  const source = records();
  const options = { workspaceId: 'w1', deadlineAt: Date.now() + 10_000,
    readSnapshot: async () => ({ records: source, unresolvedImportRowCount: 0 }) };
  const tools = createCashbookTools(options);
  const page = await tools.list_transactions({});
  assert.equal(page.snapshot.workspaceId, 'w1');
  page.items[0]!.amountMinor = '1';
  page.items[0]!.source.rowNumber = 999;
  source[0]!.amountMinor = '2';
  assert.equal((await tools.get_cash_summary({ scope: 'valid_imported_cash' })).summary.inflowMinor, '9007199254740993');
  const next = await createCashbookTools(options).get_cash_summary({ scope: 'valid_imported_cash' });
  assert.equal(next.summary.inflowMinor, '2');
  assert.notEqual(next.snapshot.token, page.snapshot.token, 'the token covers exact read fields, not only statuses');
  source[0]!.description = 'Updated synthetic description';
  const changedDescription = await createCashbookTools(options).list_transactions({});
  assert.notEqual(changedDescription.snapshot.token, next.snapshot.token, 'the token covers source text used by evidence tools');
});
test('A2 verified empty cashbooks retain unresolved counts and exact zero totals', async () => {
  const tools = createCashbookTools({ workspaceId: 'w1', deadlineAt: Date.now() + 10_000,
    readSnapshot: async () => ({ records: [], unresolvedImportRowCount: 3 }) });
  const emptyPage = await tools.list_transactions({});
  assert.deepEqual(emptyPage.items, []);
  assert.equal(emptyPage.nextCursor, null);
  const summary = await tools.get_cash_summary({ scope: 'valid_imported_cash' });
  assert.equal(summary.summary.inflowMinor, '0');
  assert.equal(summary.summary.outflowMinor, '0');
  assert.equal(summary.summary.netMovementMinor, '0');
  assert.equal(summary.summary.transactionCount, 0);
  assert.equal(summary.summary.unresolvedImportRowCount, 3);
});

test('assistant date totals cover every matching row and persisted match filters work', async () => {
  const data = records(); data[1]!.matchStatus = 'accepted'; data[2]!.matchStatus = 'proposed';
  const tools = createCashbookTools({ workspaceId: 'w1', deadlineAt: Date.now() + 10_000,
    readSnapshot: async () => ({ records: data, unresolvedImportRowCount: 7 }) });
  const summary = await tools.get_cash_summary({ scope: 'valid_imported_cash', dateFrom: '2026-10-02', dateTo: '2026-10-03' });
  assert.equal(summary.summary.netMovementMinor, '-10');
  assert.equal(summary.summary.transactionCount, 2);
  assert.equal(summary.summary.unresolvedImportRowCount, 7);
  assert.deepEqual((await tools.list_transactions({ matchStatus: 'accepted' })).items.map(r => r.id), [ids[1]]);
  assert.deepEqual((await tools.list_transactions({ matchStatus: 'proposed' })).items.map(r => r.id), [ids[2]]);
});

test('cash summary remains exact and complete beyond a truncated transaction page', async () => {
  const many = Array.from({ length: 60 }, (_, index) => transaction({
    id: `tx-${String(index).padStart(3, '0')}`, source: { sourceId: 'synthetic-source', rowNumber: index + 2 },
    direction: 'in', amountMinor: '17',
  }));
  const tools = createCashbookTools({ workspaceId: 'w1', deadlineAt: Date.now() + 10_000,
    readSnapshot: async () => ({ records: many, unresolvedImportRowCount: 0 }) });
  const page = await tools.list_transactions({ limit: 50 });
  const summary = await tools.get_cash_summary({ scope: 'valid_imported_cash' });
  assert.equal(page.returnedCount, 50);
  assert.equal(page.totalCount, 60);
  assert.equal(page.complete, false);
  assert.equal(summary.complete, true);
  assert.equal(summary.returnedCount, 60);
  assert.equal(summary.totalCount, 60);
  assert.equal(summary.summary.inflowMinor, '1020');
  assert.equal(summary.summary.transactionCount, 60);
  assert.equal(summary.summary.transactionIds.length, 60);
});
