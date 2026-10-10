import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCategorySuggestions } from '../../src/lib/server/proposals/category-validation.ts';
import { transaction } from './fixtures.ts';

test('A2 category output guard preserves pending suggestions and never edits reviewed cash', () => {
  const records = [transaction(), transaction({ id: 't2', source: { sourceId: 's1', rowNumber: 3 } })];
  const before = structuredClone(records);
  const raw = [
    { transactionId: 't1', category: 'software_services', rationale: 'Synthetic software payment description.', status: 'proposed' },
    { transactionId: 't2', category: 'uncategorized', rationale: 'Synthetic description provides insufficient category evidence.', status: 'needs_review' },
  ];
  const suggestions = validateCategorySuggestions(raw, records, 'w1');
  assert.deepEqual(suggestions, raw);
  assert.deepEqual(records, before);
  raw[0]!.rationale = 'Changed external response';
  assert.notEqual(suggestions[0]!.rationale, raw[0]!.rationale);
  assert.equal(suggestions[0]!.status, 'proposed');
  assert.equal(records[0]!.category, null);
  assert.equal(records[0]!.categoryStatus, 'needs_review');
});

test('A2 category output guard can validate a partial suggestion set without claiming batch completion', () => {
  const records = [transaction(), transaction({ id: 'accepted', source: { sourceId: 's1', rowNumber: 3 },
    category: 'customer_receipts', categoryStatus: 'accepted' })];
  assert.deepEqual(validateCategorySuggestions([], records, 'w1'), []);
  assert.equal(validateCategorySuggestions([
    { transactionId: 't1', category: 'uncategorized', rationale: 'Insufficient evidence.', status: 'needs_review' },
  ], records, 'w1').length, 1);
  assert.equal(records[1]!.category, 'customer_receipts');
});
