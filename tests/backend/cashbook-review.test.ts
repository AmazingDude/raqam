import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transactionReviewSchema } from '../../src/lib/contracts/cashbook.ts';
import { mapCashbookRow } from '../../src/lib/server/cashbook-mapping.ts';

test('transaction reviews accept explicit labels/clears and reject money, ownership and stale-shaped inputs', () => {
  assert.equal(transactionReviewSchema.safeParse({ expectedVersion: 0, description: 'Reviewed' }).success, true);
  assert.equal(transactionReviewSchema.safeParse({ expectedVersion: 2, category: null }).success, true);
  for (const body of [
    { expectedVersion: 0 }, { description: 'Missing version' }, { expectedVersion: -1, category: 'travel' },
    { expectedVersion: 0, description: ' \n\t' }, { expectedVersion: 0, description: 'NUL\0text' }, { expectedVersion: 0, category: 'invented' },
    { expectedVersion: 0, amountMinor: '123' }, { expectedVersion: 0, ownerSubject: 'other', category: 'travel' },
  ]) assert.equal(transactionReviewSchema.safeParse(body).success, false);
});

test('cashbook database mapping preserves exact money/originals and rejects numeric bigint JSON', () => {
  const row = { id: 't', workspace_id: 'w', source_id: 's', source_row: 2, date: '2026-10-10',
    original_description: '', description: 'Corrected', direction: 'out', amount_minor: '9007199254740993',
    currency: 'PKR', reference: null, category: null, category_status: 'needs_review' };
  assert.equal(mapCashbookRow(row).amountMinor, '9007199254740993');
  assert.equal(mapCashbookRow(row).originalDescription, '');
  assert.throws(() => mapCashbookRow({ ...row, amount_minor: 9007199254740993 }));
});
