import test from 'node:test';
import assert from 'node:assert/strict';
import { transaction } from './fixtures.ts';
import { calculateCashSummary } from '../../src/lib/server/summary.ts';

test('cash totals count all valid records once and separate reviewed category coverage', () => {
  const summary = calculateCashSummary([
    transaction(), transaction({ id: 't2', source: { sourceId: 's1', rowNumber: 3 }, direction: 'out', amountMinor: '10', category: 'software_services', categoryStatus: 'accepted' }),
    transaction({ id: 't3', source: { sourceId: 's1', rowNumber: 4 }, direction: 'out', amountMinor: '20', category: 'transfers_owner_movements', categoryStatus: 'accepted' }),
  ], 'w1', 2);
  assert.deepEqual([summary.inflowMinor, summary.outflowMinor, summary.netMovementMinor], ['10005', '30', '9975']);
  assert.equal(summary.categories.software_services?.outflowMinor, '10');
  assert.equal(summary.categories.transfers_owner_movements?.outflowMinor, '20');
  assert.equal(summary.unreviewed.inflowMinor, '10005');
  assert.equal(summary.unresolvedImportRowCount, 2);
  assert.deepEqual(summary.categoryCoverage, { acceptedCount: 2, notAcceptedCount: 1 });
  assert.deepEqual(summary.matchCoverage, { matchedCount: 0, notMatchedCount: 3 });
  assert.equal(BigInt(summary.categories.software_services!.inflowMinor) + BigInt(summary.categories.transfers_owner_movements!.inflowMinor) + BigInt(summary.unreviewed.inflowMinor), BigInt(summary.inflowMinor));
  assert.equal(BigInt(summary.categories.software_services!.outflowMinor) + BigInt(summary.categories.transfers_owner_movements!.outflowMinor) + BigInt(summary.unreviewed.outflowMinor), BigInt(summary.outflowMinor));
});

test('full-workspace category and match coverage counts accepted outcomes independently of cash totals', () => {
  const summary = calculateCashSummary([
    transaction({ category: 'customer_receipts', categoryStatus: 'accepted', matchStatus: 'accepted' }),
    transaction({ id: 't2', source: { sourceId: 's1', rowNumber: 3 }, direction: 'out', amountMinor: '50', categoryStatus: 'rejected', matchStatus: 'proposed' }),
    transaction({ id: 't3', source: { sourceId: 's1', rowNumber: 4 }, amountMinor: '20', categoryStatus: 'proposed' }),
  ], 'w1', 4);
  assert.deepEqual(summary.categoryCoverage, { acceptedCount: 1, notAcceptedCount: 2 });
  assert.deepEqual(summary.matchCoverage, { matchedCount: 1, notMatchedCount: 2 });
  assert.deepEqual([summary.inflowMinor, summary.outflowMinor, summary.netMovementMinor], ['10025', '50', '9975']);
  assert.equal(summary.unresolvedImportRowCount, 4);
});

test('equal-valued distinct source rows count separately; duplicate movements fail closed', () => {
  const second = transaction({ id: 't2', source: { sourceId: 's1', rowNumber: 3 } });
  assert.equal(calculateCashSummary([transaction(), second], 'w1', 0).inflowMinor, '20010');
  assert.throws(() => calculateCashSummary([transaction(), transaction()], 'w1', 0), /Duplicate/);
  assert.throws(() => calculateCashSummary([transaction(), transaction({ id: 't2' })], 'w1', 0), /Duplicate/);
});

test('chat-entered transactions without imported rows contribute to totals independently', () => {
  const summary = calculateCashSummary([
    transaction({ id: 'manual-1', source: { sourceId: 'chat-source', rowNumber: null, kind: 'manual_chat' }, amountMinor: '3000000', direction: 'out' }),
    transaction({ id: 'manual-2', source: { sourceId: 'chat-source', rowNumber: null, kind: 'manual_chat' }, amountMinor: '7500000', direction: 'in' }),
  ], 'w1', 0);
  assert.deepEqual([summary.transactionCount, summary.inflowMinor, summary.outflowMinor, summary.netMovementMinor], [2, '7500000', '3000000', '4500000']);
});

test('scope and malformed cash records cannot leak into totals', () => {
  assert.throws(() => calculateCashSummary([transaction({ workspaceId: 'w2' })], 'w1', 0), /Inaccessible/);
  assert.throws(() => calculateCashSummary([transaction({ amountMinor: '0.1' })], 'w1', 0));
  assert.throws(() => calculateCashSummary([transaction({ category: 'travel' })], 'w1', 0));
  assert.throws(() => calculateCashSummary([transaction({ source: { sourceId: 'image1', rowNumber: null } })], 'w1', 0), /source reference is invalid/);
  assert.deepEqual(calculateCashSummary([], 'w1', 0).transactionIds, []);
  assert.deepEqual(calculateCashSummary([], 'w1', 0).categoryCoverage, { acceptedCount: 0, notAcceptedCount: 0 });
  assert.deepEqual(calculateCashSummary([], 'w1', 0).matchCoverage, { matchedCount: 0, notMatchedCount: 0 });
});

test('totals beyond JavaScript safe integer range remain exact', () => {
  assert.equal(calculateCashSummary([transaction({ amountMinor: '9007199254740993' })], 'w1', 0).inflowMinor, '9007199254740993');
});

test('cash summaries filter every reporting bucket and coverage count to an inclusive date range', () => {
  const summary = calculateCashSummary([
    transaction({ id: 'before', date: '2026-09-30', amountMinor: '400' }),
    transaction({ id: 'start', date: '2026-10-01', source: { sourceId: 's1', rowNumber: 3 }, category: 'software_services', categoryStatus: 'accepted', matchStatus: 'accepted', amountMinor: '1250' }),
    transaction({ id: 'end', date: '2026-10-31', source: { sourceId: 's1', rowNumber: 4 }, direction: 'out', amountMinor: '250' }),
    transaction({ id: 'after', date: '2026-11-01', source: { sourceId: 's1', rowNumber: 5 }, amountMinor: '800' }),
  ], 'w1', 3, { dateFrom: '2026-10-01', dateTo: '2026-10-31' });
  assert.deepEqual(summary.transactionIds, ['start', 'end']);
  assert.deepEqual([summary.inflowMinor, summary.outflowMinor, summary.netMovementMinor], ['1250', '250', '1000']);
  assert.deepEqual(summary.categoryCoverage, { acceptedCount: 1, notAcceptedCount: 1 });
  assert.deepEqual(summary.matchCoverage, { matchedCount: 1, notMatchedCount: 1 });
  assert.equal(summary.categories.software_services?.inflowMinor, '1250');
  assert.equal(summary.unreviewed.outflowMinor, '250');
  assert.equal(summary.unresolvedImportRowCount, 3, 'unresolved rows remain workspace-wide because their source dates may be unknown');
});

test('cash summary date ranges reject invalid dates and reversed bounds', () => {
  assert.throws(() => calculateCashSummary([transaction()], 'w1', 0, { dateFrom: '2026-02-30' }), /valid YYYY-MM-DD/);
  assert.throws(() => calculateCashSummary([transaction()], 'w1', 0, { dateFrom: '2026-10-11', dateTo: '2026-10-10' }), /Date range is reversed/);
});
