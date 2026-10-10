import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uploadStored } from '../../src/lib/server/storage-retry.ts';

test('upload retries require a visible object, regardless of provider error format', async () => {
  assert.equal(await uploadStored(null, async () => { throw new Error('Unexpected lookup'); }), true);
  for (const error of [{ statusCode: '400' }, { statusCode: '409' }, { message: 'Response lost' }]) {
    assert.equal(await uploadStored(error, async () => ({ data: { id: 'original' }, error: null })), true);
    assert.equal(await uploadStored(error, async () => ({ data: null, error: { statusCode: '403' } })), false);
    assert.equal(await uploadStored(error, async () => ({ data: null, error: null })), false);
  }
});
