import { createHash } from 'node:crypto';
import { z } from 'zod';
import { BackendError } from '../errors.ts';
import { identifyImage, MAX_IMAGE_BYTES } from '../uploads.ts';

const sourceRowSchema = z.strictObject({
  id: z.uuid(), workspace_id: z.uuid(), source_type: z.enum(['transaction_csv', 'receipt_image']),
  content_hash: z.string().regex(/^[0-9a-f]{64}$/), storage_path: z.string().min(1),
  status: z.enum(['pending', 'complete', 'failed']),
});
type Options = {
  workspaceId: string;
  sourceId: unknown;
  deadlineAt: number;
  signal?: AbortSignal;
  readMetadata: (sourceId: string, signal: AbortSignal) => Promise<unknown>;
  download: (storagePath: string, signal: AbortSignal) => Promise<Blob>;
};

// Private preparation seam, not a document command/result or C's adapter DTO.
// External readers must be bound to the verified session by source.ts.
export async function readReceiptInput(options: Options) {
  const { workspaceId, sourceId: requestedSourceId, deadlineAt, signal, readMetadata, download } = options;
  const sourceId = z.uuid().safeParse(requestedSourceId);
  if (!sourceId.success) throw new BackendError('NOT_FOUND', 'Receipt source not found.');
  const id = sourceId.data;
  if (!z.uuid().safeParse(workspaceId).success || !Number.isFinite(deadlineAt)) {
    throw new BackendError('UNAVAILABLE', 'Receipt request scope or deadline is unavailable.');
  }
  const unavailable = () => new BackendError('UNAVAILABLE', 'Receipt input could not be verified. Retry the upload.');
  const expired = () => new BackendError('UNAVAILABLE', 'The receipt request expired. Please retry.');
  function assertActive() {
    if (signal?.aborted || Date.now() >= deadlineAt) throw expired();
  }
  assertActive();
  const transport = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => {
    const stop = () => { transport.abort(); reject(expired()); };
    timer = setTimeout(stop, Math.min(deadlineAt - Date.now(), 2_147_483_647));
    onAbort = stop;
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
  async function load() {
    assertActive();
    let raw: unknown;
    try { raw = await readMetadata(id, transport.signal); }
    catch { assertActive(); throw unavailable(); }
    assertActive();
    if (raw === null) throw new BackendError('NOT_FOUND', 'Receipt source not found.');
    const parsed = sourceRowSchema.safeParse(raw);
    if (!parsed.success) throw unavailable();
    const source = parsed.data;
    if (source.id !== id || source.workspace_id !== workspaceId || source.source_type !== 'receipt_image') {
      throw new BackendError('NOT_FOUND', 'Receipt source not found.');
    }
    if (source.status !== 'complete') throw new BackendError('UNAVAILABLE', 'Receipt upload is incomplete. Retry the upload.');
    // Reuse the existing immutable upload identity; reject arbitrary paths/URLs.
    const prefix = `${workspaceId}/${source.content_hash}`;
    if (source.storage_path !== `${prefix}.png` && source.storage_path !== `${prefix}.jpg`) throw unavailable();
    assertActive();
    let blob: Blob;
    try { blob = await download(source.storage_path, transport.signal); }
    catch { assertActive(); throw unavailable(); }
    assertActive();
    if (!(blob instanceof Blob) || blob.size === 0 || blob.size > MAX_IMAGE_BYTES) throw unavailable();
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await blob.arrayBuffer()); }
    catch { assertActive(); throw unavailable(); }
    assertActive();
    if (bytes.byteLength !== blob.size || bytes.byteLength > MAX_IMAGE_BYTES) throw unavailable();
    const image = identifyImage(bytes);
    if (!image || blob.type !== image.mime || source.storage_path !== `${prefix}.${image.extension}` ||
      createHash('sha256').update(bytes).digest('hex') !== source.content_hash) throw unavailable();
    return { sourceId: source.id, contentHash: source.content_hash, mime: image.mime, bytes };
  }
  try {
    const image = await Promise.race([load(), stopped]);
    assertActive();
    return image;
  } catch (error) {
    if (error instanceof BackendError) throw error;
    throw unavailable();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    transport.abort();
  }
}
