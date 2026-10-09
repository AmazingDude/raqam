import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantToolSchemas, documentFieldsSchema, transactionSchema, workspaceInputSchema, categorySuggestionSchema, matchSuggestionSchema } from '../../src/lib/contracts/schemas.ts';
import { transaction } from '../backend/fixtures.ts';

test('assistant arguments cannot carry ownership, mutable operations or unbounded queries', () => {
  assert.equal(assistantToolSchemas.list_transactions.safeParse({ ownerSubject: 'another-user' }).success, false);
  assert.equal(assistantToolSchemas.list_transactions.safeParse({ workspaceId: 'w2' }).success, false);
  assert.equal(assistantToolSchemas.list_transactions.safeParse({ limit: 51 }).success, false);
  assert.equal(assistantToolSchemas.get_cash_summary.safeParse({ scope: 'profit' }).success, false);
  assert.equal(assistantToolSchemas.get_cash_summary.safeParse({ scope: 'valid_imported_cash', dateFrom: '2026-10-10', dateTo: '2026-10-09' }).success, false);
  assert.equal(assistantToolSchemas.get_record_evidence.safeParse({ transactionIds: [] }).success, false);
  assert.deepEqual(Object.keys(assistantToolSchemas), ['list_transactions', 'get_cash_summary', 'get_review_queue', 'get_record_evidence']);
});

test('raw AI suggestions cannot set owner IDs or claim reviewed acceptance', () => {
  const category = { transactionId: 't1', category: 'travel', rationale: 'Synthetic description', status: 'proposed' };
  assert.equal(categorySuggestionSchema.safeParse(category).success, true);
  assert.equal(categorySuggestionSchema.safeParse({ ...category, status: 'accepted' }).success, false);
  assert.equal(categorySuggestionSchema.safeParse({ ...category, workspaceId: 'w2' }).success, false);
  assert.equal(matchSuggestionSchema.safeParse({ transactionId: 't1', documentId: 'd1', rationale: 'Synthetic', status: 'accepted' }).success, false);
});

test('workspace creation accepts the business name and rejects forged ownership', () => {
  assert.deepEqual(workspaceInputSchema.parse({ businessName: '  Synthetic service  ' }), { businessName: 'Synthetic service' });
  assert.equal(workspaceInputSchema.safeParse({ businessName: 'Synthetic', ownerSubject: 'user_B' }).success, false);
  assert.equal(workspaceInputSchema.safeParse({ businessName: 'Synthetic', workspaceId: 'w2' }).success, false);
  assert.equal(workspaceInputSchema.safeParse({ businessName: '   ' }).success, false);
});

test('missing extraction fields remain null and proposals cannot masquerade as reviewed transactions', () => {
  const unknowns = { counterparty: null, date: null, totalMinor: null, currency: null, reference: null };
  assert.deepEqual(documentFieldsSchema.parse(unknowns), unknowns);
  assert.equal(documentFieldsSchema.safeParse({ ...unknowns, totalMinor: '0.00' }).success, false);
  assert.equal(transactionSchema.safeParse(transaction({ category: 'travel', categoryStatus: 'proposed' })).success, false);
  assert.equal(transactionSchema.safeParse(transaction({ categoryStatus: 'accepted' })).success, false);
});
