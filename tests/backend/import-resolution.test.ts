import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importResolutionSchema, importResolutionResultSchema, importResolutionStateSchema } from '../../src/lib/contracts/imports.ts';
import { MAX_IMPORT_ROWS } from '../../src/lib/contracts/limits.ts';

const requestId = '20000000-0000-4000-8000-000000000001';
const transaction = { date: '2026-10-10', description: 'Reviewed unknown row', direction: 'out', amountMinor: '1005', currency: 'PKR', reference: null };
test('resolution commands require explicit bounded decisions and cannot carry ownership or silently invent cash', () => {
  assert.equal(importResolutionSchema.safeParse({ requestId, rows: [{ rowNumber: 3, action: 'correct', transaction }] }).success, true);
  for (const body of [
    { rows: [{ rowNumber: 3, action: 'reject' }] }, { requestId, rows: [] },
    { requestId, ownerSubject: 'forged', rows: [{ rowNumber: 3, action: 'reject' }] },
    { requestId, rows: [{ rowNumber: 3, action: 'reject' }, { rowNumber: 3, action: 'reject' }] },
    { requestId, rows: Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => ({ rowNumber: index + 2, action: 'reject' })) },
    { requestId, rows: [{ rowNumber: 3, action: 'import', transaction }] },
    { requestId, rows: [{ rowNumber: 3, action: 'reject', transaction }] },
  ]) assert.equal(importResolutionSchema.safeParse(body).success, false);
  for (const amountMinor of ['unknown', '', '-1', '10.05', '9223372036854775808']) {
    assert.equal(importResolutionSchema.safeParse({ requestId, rows: [{ rowNumber: 3, action: 'correct', transaction: { ...transaction, amountMinor } }] }).success, false);
  }
  assert.equal(importResolutionSchema.safeParse({ requestId, rows: [{ rowNumber: 3, action: 'correct', transaction: { ...transaction, amountMinor: '0' } }] }).success, true, 'zero requires an explicit known correction');
});
test('resolution results cannot disagree with row outcomes or created transaction IDs', () => {
  const state = { importId: requestId, rows: [{ rowNumber: 2, outcome: 'unresolved', transactionId: null }], importedCount: 0, rejectedCount: 0, unresolvedCount: 1 };
  assert.equal(importResolutionStateSchema.safeParse(state).success, true);
  assert.equal(importResolutionStateSchema.safeParse({ ...state, unresolvedCount: 0 }).success, false);
  assert.equal(importResolutionStateSchema.safeParse({ ...state, rows: [{ rowNumber: 2, outcome: 'imported', transactionId: null }] }).success, false);
  assert.equal(importResolutionResultSchema.safeParse({ importId: requestId, requestId, correctedCount: 1, rejectedCount: 0, remainingUnresolvedCount: 0, transactionIds: [], duplicate: false }).success, false);
});
