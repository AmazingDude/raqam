import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyImage, readImageUpload, MAX_IMAGE_BYTES } from '../../src/lib/server/uploads.ts';

// Only format signatures are tested here; this does not establish readable OCR.
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const upload = (bytes: Uint8Array, type: string, extra = false): Request => {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type }), 'synthetic.png');
  if (extra) form.append('ownerSubject', 'someone_else');
  return new Request('https://raqam.example/api/sources', { method: 'POST', body: form });
};
test('upload guard checks content signature, declared MIME and a single file field', async () => {
  assert.equal(identifyImage(new TextEncoder().encode('<script>bad</script>')), null);
  assert.equal((await readImageUpload(upload(png, 'image/png'))).extension, 'png');
  await assert.rejects(() => readImageUpload(upload(png, 'image/jpeg')));
  await assert.rejects(() => readImageUpload(upload(png, 'image/png', true)));
  await assert.rejects(() => readImageUpload(upload(new Uint8Array(MAX_IMAGE_BYTES + 1), 'image/png')));
});

test('same uploaded bytes have stable identity regardless of original filename', async () => {
  const first = await readImageUpload(upload(png, 'image/png'));
  const form = new FormData(); form.append('file', new Blob([png], { type: 'image/png' }), 'renamed.png');
  const second = await readImageUpload(new Request('https://raqam.example/api/sources', { method: 'POST', body: form }));
  assert.equal(first.contentHash, second.contentHash);
});
