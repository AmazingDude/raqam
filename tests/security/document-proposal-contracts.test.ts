import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptedDocumentFieldsSchema, documentReviewSchema, documentRegistrationSchema, documentExtractionSaveSchema, documentRecordSchema } from '../../src/lib/contracts/documents.ts';
import { categoryGenerationRequestSchema, categoryPersistenceSchema, matchPersistenceSchema, proposalReviewSchema } from '../../src/lib/contracts/proposals.ts';

const id = '00000000-0000-4000-8000-000000000001';
const fields = { counterparty: null, date: '2026-10-10', totalMinor: '10005', currency: 'PKR', reference: null };
const provenance = { modelVersion: 'synthetic', promptVersion: 'v1', schemaVersion: 'v1' };

test('document acceptance requires explicit date, exact total and PKR but allows unknown merchant/reference', () => {
  assert.deepEqual(acceptedDocumentFieldsSchema.parse(fields), fields);
  for (const invalid of [{ date: null }, { date: '2026-02-30' }, { totalMinor: null }, { totalMinor: 10005 },
    { totalMinor: '100.05' }, { totalMinor: '9223372036854775808' }, { currency: null }, { currency: 'USD' }]) {
    assert.equal(acceptedDocumentFieldsSchema.safeParse({ ...fields, ...invalid }).success, false);
  }
  assert.equal(acceptedDocumentFieldsSchema.safeParse({ ...fields, totalMinor: '0' }).success, true);
});

test('document commands preserve correction unknowns and reject forged ownership, money shortcuts and stale-shaped inputs', () => {
  const command = { requestId: id, expectedVersion: 0, action: 'accept', fields };
  assert.equal(documentReviewSchema.safeParse(command).success, true);
  assert.equal(documentReviewSchema.safeParse({ ...command, fields: { ...fields, totalMinor: null } }).success, false);
  assert.equal(documentReviewSchema.safeParse({ ...command, action: 'correct', fields: { ...fields, totalMinor: null } }).success, true);
  for (const extra of [{ ownerSubject: 'forged' }, { workspaceId: id }, { expectedVersion: -1 }, { settled: true }, { requestId: 'unstable' }]) {
    assert.equal(documentReviewSchema.safeParse({ ...command, ...extra }).success, false);
  }
  assert.equal(documentRegistrationSchema.safeParse({ sourceId: id }).success, true);
  assert.equal(documentRegistrationSchema.safeParse({ sourceId: id, imageUrl: 'https://example.invalid' }).success, false);
});

test('failed extraction is distinct from unknown successful fields and cannot supply approvals or raw errors', () => {
  const command = { requestId: id, expectedVersion: 0 };
  assert.equal(documentExtractionSaveSchema.safeParse({ ...command, outcome: { status: 'failed', reason: 'provider_timeout' } }).success, true);
  assert.equal(documentExtractionSaveSchema.safeParse({ ...command, outcome: { status: 'complete', fields: { ...fields, totalMinor: null }, provenance } }).success, true);
  for (const outcome of [{ status: 'failed', reason: 'private raw error' }, { status: 'complete', fields },
    { status: 'complete', fields, provenance, reviewStatus: 'accepted' }]) {
    assert.equal(documentExtractionSaveSchema.safeParse({ ...command, outcome }).success, false);
  }
});

test('document result cannot claim acceptance with uncertain financial fields or omit successful provenance', () => {
  const record = { document: { id, workspaceId: id, source: { sourceId: id, rowNumber: null }, extractedFields: fields,
    correctedFields: null, extractionStatus: 'complete', reviewStatus: 'accepted', modelVersion: 'synthetic', promptVersion: 'v1' },
    reviewVersion: 1, schemaVersion: 'v1', extractionFailure: null };
  assert.equal(documentRecordSchema.safeParse(record).success, true);
  assert.equal(documentRecordSchema.safeParse({ ...record, schemaVersion: null }).success, false);
  assert.equal(documentRecordSchema.safeParse({ ...record, document: { ...record.document, extractedFields: { ...fields, totalMinor: null } } }).success, false);
});

test('proposal boundaries require unique scoped versions and cannot claim user acceptance', () => {
  const suggestion = { transactionId: id, transactionVersion: 0, category: 'travel', rationale: 'Synthetic', status: 'proposed' };
  assert.equal(categoryGenerationRequestSchema.safeParse({ requestId: id, transactionIds: [id] }).success, true);
  assert.equal(categoryGenerationRequestSchema.safeParse({ requestId: id, transactionIds: [id, id] }).success, false);
  const batch = { requestId: id, provenance, proposals: [suggestion] };
  assert.equal(categoryPersistenceSchema.safeParse(batch).success, true);
  assert.equal(categoryPersistenceSchema.safeParse({ ...batch, proposals: [suggestion, suggestion] }).success, false);
  assert.equal(categoryPersistenceSchema.safeParse({ ...batch, proposals: [{ ...suggestion, status: 'accepted' }] }).success, false);
  const match = { transactionId: id, transactionVersion: 0, documentId: id, documentVersion: 0, rationale: 'Synthetic', status: 'needs_review' };
  assert.equal(matchPersistenceSchema.safeParse({ requestId: id, provenance, proposals: [match] }).success, true);
  assert.equal(matchPersistenceSchema.safeParse({ requestId: id, provenance, proposals: [{ ...match, documentVersion: -1 }] }).success, false);
});

test('proposal decisions require explicit versions and keep category/match corrections distinct', () => {
  const base = { requestId: id, proposalId: id, expectedVersion: 0 };
  for (const decision of [{ decision: 'accept' }, { decision: 'reject' },
    { decision: 'correct_category', category: 'travel' }, { decision: 'correct_match', transactionId: id }]) {
    assert.equal(proposalReviewSchema.safeParse({ ...base, ...decision }).success, true);
  }
  assert.equal(proposalReviewSchema.safeParse({ ...base, decision: 'correct_match', category: 'travel' }).success, false);
  assert.equal(proposalReviewSchema.safeParse({ ...base, decision: 'accept', ownerSubject: 'forged' }).success, false);
});
