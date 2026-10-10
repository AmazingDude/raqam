import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCategorySuggestions } from '../../src/lib/server/proposals/category-validation.ts';
import { BackendError } from '../../src/lib/server/errors.ts';
import { transaction } from '../backend/fixtures.ts';

const suggestion = { transactionId: 't1', category: 'software_services', rationale: 'Synthetic description.', status: 'proposed' };
const unavailable = (error: unknown) => error instanceof BackendError && error.code === 'UNAVAILABLE';
test('A2 category guard rejects forged ownership, acceptance, invalid labels and duplicate/foreign targets', () => {
  for (const raw of [null, { proposals: [suggestion] }, [{ ...suggestion, workspaceId: 'w2' }],
    [{ ...suggestion, id: 'model-assigned' }], [{ ...suggestion, status: 'accepted' }],
    [{ ...suggestion, category: 'invented' }], [{ ...suggestion, rationale: '' }],
    [{ ...suggestion, transactionId: 'foreign' }], [suggestion, suggestion], Array(51).fill(suggestion)]) {
    assert.throws(() => validateCategorySuggestions(raw, [transaction()], 'w1'), unavailable);
  }
});
test('A2 category guard rejects invalid scoped inputs and replacement of accepted categories', () => {
  for (const records of [[transaction({ workspaceId: 'w2' })], [transaction(), transaction()],
    [transaction({ amountMinor: '0.01' })], [transaction({ source: { sourceId: 'receipt', rowNumber: null } })],
    [transaction({ category: 'customer_receipts', categoryStatus: 'accepted' })],
    Array.from({ length: 51 }, (_, n) => transaction({ id: `t${n}`, source: { sourceId: 's1', rowNumber: n + 2 } }))]) {
    const before = structuredClone(records);
    assert.throws(() => validateCategorySuggestions([suggestion], records, 'w1'), unavailable);
    assert.deepEqual(records, before);
  }
  assert.throws(() => validateCategorySuggestions([suggestion], [transaction()], ''), unavailable);
});
