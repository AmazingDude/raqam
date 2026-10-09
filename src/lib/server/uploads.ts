import { createHash } from 'node:crypto';
import { BackendError } from './errors.ts';
import { readRequestBytes } from './http.ts';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // initial app guard, not measured provider capacity
export function identifyImage(bytes: Uint8Array): { mime: 'image/png' | 'image/jpeg'; extension: 'png' | 'jpg' } | null {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return { mime: 'image/png', extension: 'png' };
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { mime: 'image/jpeg', extension: 'jpg' };
  return null;
}
export async function readImageUpload(request: Request) {
  const contentType = request.headers.get('content-type');
  if (!contentType?.startsWith('multipart/form-data;')) throw new BackendError('INVALID_INPUT', 'Upload a JPEG/PNG file as multipart form data.');
  const body = await readRequestBytes(request, MAX_IMAGE_BYTES + 8192);
  let form: FormData;
  try { form = await new Response(new Uint8Array(body), { headers: { 'Content-Type': contentType } }).formData(); }
  catch { throw new BackendError('INVALID_INPUT', 'Invalid multipart upload.'); }
  const entries = [...form.entries()];
  const file = form.get('file');
  if (entries.length !== 1 || !(file instanceof File) || file.size === 0 || file.size > MAX_IMAGE_BYTES || !file.name.trim() || file.name.length > 255) {
    throw new BackendError('INVALID_INPUT', 'Provide one file named file, up to 2 MiB.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = identifyImage(bytes);
  if (!image || file.type !== image.mime) throw new BackendError('INVALID_INPUT', 'File contents must match JPEG or PNG format.');
  return { ...image, bytes, contentHash: createHash('sha256').update(bytes).digest('hex'), originalName: file.name };
}
