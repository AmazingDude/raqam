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
});

test('equal-valued distinct source rows count separately; duplicate movements fail closed', () => {
  const second = transaction({ id: 't2', source: { sourceId: 's1', rowNumber: 3 } });
  assert.equal(calculateCashSummary([transaction(), second], 'w1', 0).inflowMinor, '20010');
  assert.throws(() => calculateCashSummary([transaction(), transaction()], 'w1', 0), /Duplicate/);
  assert.throws(() => calculateCashSummary([transaction(), transaction({ id: 't2' })], 'w1', 0), /Duplicate/);
});

test('scope and malformed cash records cannot leak into totals', () => {
  assert.throws(() => calculateCashSummary([transaction({ workspaceId: 'w2' })], 'w1', 0), /Inaccessible/);
  assert.throws(() => calculateCashSummary([transaction({ amountMinor: '0.1' })], 'w1', 0));
  assert.throws(() => calculateCashSummary([transaction({ category: 'travel' })], 'w1', 0));
  assert.throws(() => calculateCashSummary([transaction({ source: { sourceId: 'image1', rowNumber: null } })], 'w1', 0), /imported source/);
  assert.deepEqual(calculateCashSummary([], 'w1', 0).transactionIds, []);
});

test('totals beyond JavaScript safe integer range remain exact', () => {
  assert.equal(calculateCashSummary([transaction({ amountMinor: '9007199254740993' })], 'w1', 0).inflowMinor, '9007199254740993');
});
