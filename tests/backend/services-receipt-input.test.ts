import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readReceiptInput } from '../../src/lib/server/documents/receipt-input.ts';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000001';
// Synthetic format signatures exercise transport integrity, not OCR/decoder accuracy.
test('A2 receipt input verifies scoped PNG/JPEG bytes without exposing storage or creating cash', async () => {
  for (const format of [
    { bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]), mime: 'image/png', extension: 'png' },
    { bytes: new Uint8Array([255, 216, 255, 1, 2]), mime: 'image/jpeg', extension: 'jpg' },
  ]) {
    const hash = createHash('sha256').update(format.bytes).digest('hex');
    const path = `${workspaceId}/${hash}.${format.extension}`;
    let reads = 0, downloads = 0;
    const input = await readReceiptInput({ workspaceId, sourceId, deadlineAt: Date.now() + 10_000,
      readMetadata: async id => {
        reads++; assert.equal(id, sourceId);
        return { id: sourceId, workspace_id: workspaceId, source_type: 'receipt_image', content_hash: hash, storage_path: path, status: 'complete' };
      },
      download: async requestedPath => { downloads++; assert.equal(requestedPath, path); return new Blob([format.bytes], { type: format.mime }); },
    });
    assert.deepEqual(Object.keys(input).sort(), ['bytes', 'contentHash', 'mime', 'sourceId']);
    assert.equal(input.contentHash, hash); assert.equal(input.sourceId, sourceId); assert.equal(input.mime, format.mime);
    assert.deepEqual(input.bytes, format.bytes);
    input.bytes[0] = 0;
    assert.notEqual(format.bytes[0], 0);
    assert.equal(reads, 1); assert.equal(downloads, 1);
  }
});
