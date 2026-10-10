import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readReceiptInput } from '../../src/lib/server/documents/receipt-input.ts';
import { BackendError } from '../../src/lib/server/errors.ts';
import { MAX_IMAGE_BYTES } from '../../src/lib/server/uploads.ts';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000001';
const otherId = '30000000-0000-4000-8000-000000000001';
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
const hash = createHash('sha256').update(bytes).digest('hex');
const row = { id: sourceId, workspace_id: workspaceId, source_type: 'receipt_image', content_hash: hash,
  storage_path: `${workspaceId}/${hash}.png`, status: 'complete' };
const code = (expected: string) => (error: unknown) => error instanceof BackendError && error.code === expected;
const options = () => ({ workspaceId, sourceId, deadlineAt: Date.now() + 10_000,
  readMetadata: async (): Promise<unknown> => ({ ...row }), download: async () => new Blob([bytes], { type: 'image/png' }) });

test('A2 receipt input rejects inaccessible sources and incomplete uploads before Storage reads', async () => {
  for (const [metadata, expected] of [
    [null, 'NOT_FOUND'], [{ ...row, id: otherId }, 'NOT_FOUND'], [{ ...row, workspace_id: otherId }, 'NOT_FOUND'],
    [{ ...row, source_type: 'transaction_csv' }, 'NOT_FOUND'], [{ ...row, status: 'pending' }, 'UNAVAILABLE'],
    [{ ...row, status: 'failed' }, 'UNAVAILABLE'], [{ ...row, content_hash: 'bad' }, 'UNAVAILABLE'],
    [{ ...row, storage_path: `${workspaceId}/../${hash}.png` }, 'UNAVAILABLE'],
    [{ ...row, storage_path: `https://example.com/${hash}.png` }, 'UNAVAILABLE'],
    [{ ...row, storage_path: `${otherId}/${hash}.png` }, 'UNAVAILABLE'],
    [{ ...row, owner_subject: 'forged' }, 'UNAVAILABLE'],
  ] as const) {
    let downloads = 0;
    await assert.rejects(readReceiptInput({ ...options(), readMetadata: async () => metadata,
      download: async () => { downloads++; return new Blob([bytes], { type: 'image/png' }); } }), code(expected));
    assert.equal(downloads, 0);
  }
  let reads = 0;
  for (const invalid of ['not-an-id', { sourceId, workspaceId: otherId }]) {
    await assert.rejects(readReceiptInput({ ...options(), sourceId: invalid,
      readMetadata: async () => { reads++; return row; } }), code('NOT_FOUND'));
  }
  assert.equal(reads, 0);
});
test('A2 receipt input rejects oversized, altered, mislabeled and unsupported stored bytes', async () => {
  for (const blob of [new Blob([], { type: 'image/png' }), new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], { type: 'image/png' }),
    new Blob([bytes], { type: 'image/jpeg' }), new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    new Blob([new Uint8Array([...bytes, 9])], { type: 'image/png' })]) {
    await assert.rejects(readReceiptInput({ ...options(), download: async () => blob }), code('UNAVAILABLE'));
  }
  await assert.rejects(readReceiptInput({ ...options(), readMetadata: async () => ({ ...row, storage_path: `${workspaceId}/${hash}.jpg` }) }), code('UNAVAILABLE'));
});
test('A2 receipt failures are sanitized and do not become successful empty extraction', async () => {
  for (const reader of ['metadata', 'download']) {
    const input = options();
    const failed = async (): Promise<never> => { throw new Error('private provider diagnostic'); };
    if (reader === 'metadata') input.readMetadata = failed; else input.download = failed;
    await assert.rejects(readReceiptInput(input), error => code('UNAVAILABLE')(error) && error instanceof Error && !error.message.includes('private'));
  }
});
test('A2 receipt sanitizes typed errors from external metadata and image readers', async () => {
  for (const reader of ['metadata', 'download']) {
    for (const errorCode of ['UNAVAILABLE', 'NOT_FOUND'] as const) {
      const input = options();
      const failed = async (): Promise<never> => { throw new BackendError(errorCode, 'private storage diagnostic'); };
      if (reader === 'metadata') input.readMetadata = failed; else input.download = failed;
      await assert.rejects(readReceiptInput(input), error => code('UNAVAILABLE')(error) &&
        error instanceof Error && error.message === 'Receipt input could not be verified. Retry the upload.');
    }
  }
  class FailedBlob extends Blob {
    override async arrayBuffer(): Promise<ArrayBuffer> { throw new BackendError('UNAVAILABLE', 'private bytes diagnostic'); }
  }
  await assert.rejects(readReceiptInput({ ...options(), download: async () => new FailedBlob([bytes], { type: 'image/png' }) }),
    error => code('UNAVAILABLE')(error) && error instanceof Error && !error.message.includes('private'));
});
test('A2 receipt snapshots request scope, budget, signal and readers before awaiting metadata', async () => {
  const controller = new AbortController();
  const replacedController = new AbortController(); replacedController.abort();
  let finish!: (value: unknown) => void;
  let downloads = 0;
  const input = { ...options(), signal: controller.signal,
    readMetadata: (): Promise<unknown> => new Promise(resolve => { finish = resolve; }),
    download: async () => { downloads++; return new Blob([bytes], { type: 'image/png' }); },
  };
  const reading = readReceiptInput(input);
  input.workspaceId = otherId;
  input.sourceId = otherId;
  input.deadlineAt = Date.now() - 1;
  input.signal = replacedController.signal;
  input.readMetadata = async () => { throw new Error('mutated metadata reader'); };
  input.download = async () => { throw new Error('mutated download reader'); };
  finish({ ...row });
  const result = await reading;
  assert.equal(result.sourceId, sourceId);
  assert.equal(result.contentHash, hash);
  assert.equal(downloads, 1);
});
test('A2 receipt deadline/cancellation rejects late input and prevents download after expired metadata', async () => {
  const controller = new AbortController(); controller.abort();
  let reads = 0, downloads = 0;
  await assert.rejects(readReceiptInput({ ...options(), signal: controller.signal,
    readMetadata: async () => { reads++; return row; } }), code('UNAVAILABLE'));
  assert.equal(reads, 0);
  let finish!: (value: unknown) => void;
  const pending = readReceiptInput({ ...options(), deadlineAt: Date.now() + 20,
    readMetadata: () => new Promise(resolve => { finish = resolve; }),
    download: async () => { downloads++; return new Blob([bytes], { type: 'image/png' }); } });
  await assert.rejects(pending, code('UNAVAILABLE'));
  finish(row);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(downloads, 0);
  const inflight = new AbortController();
  const downloading = readReceiptInput({ ...options(), signal: inflight.signal, download: () => new Promise(() => {}) });
  await new Promise(resolve => setImmediate(resolve));
  inflight.abort();
  await assert.rejects(downloading, code('UNAVAILABLE'));
});
test('A2 receipt rejects expired or invalid request scope before reading private metadata', async () => {
  let reads = 0;
  for (const extra of [
    { workspaceId: 'invalid-workspace' }, { deadlineAt: Number.NaN },
    { deadlineAt: Number.POSITIVE_INFINITY }, { deadlineAt: Date.now() - 1 },
  ]) {
    await assert.rejects(readReceiptInput({ ...options(), ...extra,
      readMetadata: async () => { reads++; return row; } }), code('UNAVAILABLE'));
  }
  assert.equal(reads, 0);
});
test('A2 receipt propagates cancellation and deadline to private transport readers', async () => {
  const controller = new AbortController();
  let metadataSignal: AbortSignal | undefined;
  const reading = readReceiptInput({ ...options(), signal: controller.signal,
    readMetadata: async (_id, signal) => {
      metadataSignal = signal;
      return new Promise(() => {});
    } });
  assert.ok(metadataSignal);
  assert.equal(metadataSignal.aborted, false);
  controller.abort();
  await assert.rejects(reading, code('UNAVAILABLE'));
  assert.equal(metadataSignal.aborted, true);

  let downloadSignal: AbortSignal | undefined;
  const downloading = readReceiptInput({ ...options(), deadlineAt: Date.now() + 20,
    download: async (_path, signal) => {
      downloadSignal = signal;
      return new Promise(() => {});
    } });
  await assert.rejects(downloading, code('UNAVAILABLE'));
  assert.ok(downloadSignal);
  assert.equal(downloadSignal.aborted, true);
});
