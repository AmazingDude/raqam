import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentService } from '../../src/lib/server/documents/mapping.ts';
import { BackendError } from '../../src/lib/server/errors.ts';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const foreignWorkspaceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const receiptSourceId = '33333333-3333-4333-8333-333333333333';
const documentId = '22222222-2222-4222-8222-222222222222';
const fields = { counterparty: null, date: null, totalMinor: null, currency: null, reference: null };
const record = (workspace = workspaceId, source = receiptSourceId) => ({
  document: {
    id: documentId, workspaceId: workspace, source: { sourceId: source, rowNumber: null },
    extractedFields: fields, correctedFields: null, extractionStatus: 'pending', reviewStatus: 'needs_review',
    modelVersion: null, promptVersion: null,
  },
  reviewVersion: 0, schemaVersion: null, extractionFailure: null,
});
const result = (data: unknown, error: unknown = null) => ({ data, error });
const code = (expected: string) => (error: unknown) => error instanceof BackendError && error.code === expected;

function service(options: {
  source?: unknown;
  registered?: unknown;
  sourceCalls?: string[];
  registerCalls?: string[];
} = {}) {
  const sourceCalls = options.sourceCalls ?? [];
  const registerCalls = options.registerCalls ?? [];
  const persistence = {
    async source(id: string) {
      sourceCalls.push(id);
      return result(options.source === undefined
        ? { id: receiptSourceId, workspace_id: workspaceId, source_type: 'receipt_image', status: 'complete' }
        : options.source);
    },
    async register(id: string) {
      registerCalls.push(id);
      return result(options.registered === undefined
        ? { record: record(), duplicate: false }
        : options.registered);
    },
    async detail() { return result(null); },
    async list() { return result([]); },
    async review() { return result(null); },
  };
  return createDocumentService({ workspaceId, persistence });
}

test('document registration validates the receipt source and preserves the database duplicate result', async () => {
  const serviceInstance = service();
  const first = await serviceInstance.register({ sourceId: receiptSourceId });
  assert.equal(first.duplicate, false);
  assert.equal(first.record.document.workspaceId, workspaceId);
  assert.equal(first.record.document.source.sourceId, receiptSourceId);
  assert.equal(first.record.document.extractionStatus, 'pending');
  assert.equal(first.record.document.reviewStatus, 'needs_review');
  assert.deepEqual(first.record.document.extractedFields, fields);

  const duplicate = await service({ registered: { record: record(), duplicate: true } })
    .register({ sourceId: receiptSourceId });
  assert.equal(duplicate.duplicate, true);
});

test('document registration rejects malformed commands before reading or writing', async () => {
  const sourceCalls: string[] = [], registerCalls: string[] = [];
  const serviceInstance = service({ sourceCalls, registerCalls });
  await assert.rejects(serviceInstance.register({ sourceId: receiptSourceId, workspaceId }), code('INVALID_INPUT'));
  await assert.rejects(serviceInstance.register({ sourceId: 'not-a-uuid' }), code('INVALID_INPUT'));
  assert.deepEqual(sourceCalls, []);
  assert.deepEqual(registerCalls, []);
});

test('document registration hides foreign and non-receipt sources and rejects incomplete uploads', async () => {
  for (const source of [null,
    { id: receiptSourceId, workspace_id: foreignWorkspaceId, source_type: 'receipt_image', status: 'complete' },
    { id: receiptSourceId, workspace_id: workspaceId, source_type: 'transaction_csv', status: 'complete' }]) {
    const registerCalls: string[] = [];
    const serviceInstance = service({ source, registerCalls });
    await assert.rejects(serviceInstance.register({ sourceId: receiptSourceId }), code('NOT_FOUND'));
    assert.deepEqual(registerCalls, []);
  }
  const incomplete = service({ source: { id: receiptSourceId, workspace_id: workspaceId, source_type: 'receipt_image', status: 'pending' } });
  await assert.rejects(incomplete.register({ sourceId: receiptSourceId }), code('UNAVAILABLE'));
});

test('document registration fails closed when the atomic result changes source or workspace', async () => {
  for (const invalidRecord of [record(foreignWorkspaceId), record(workspaceId, '44444444-4444-4444-8444-444444444444')]) {
    const serviceInstance = service({ registered: { record: invalidRecord, duplicate: false } });
    await assert.rejects(serviceInstance.register({ sourceId: receiptSourceId }), code('UNAVAILABLE'));
  }
});

test('document registration sanitizes persistence failures', async () => {
  const serviceInstance = createDocumentService({ workspaceId, persistence: {
    async source() { return result(null, { code: 'XX000', message: 'private database diagnostic' }); },
    async register() { return result(null); }, async detail() { return result(null); },
    async list() { return result([]); }, async review() { return result(null); },
  } });
  await assert.rejects(serviceInstance.register({ sourceId: receiptSourceId }), error =>
    code('UNAVAILABLE')(error) && error instanceof Error && !error.message.includes('private'));
});
