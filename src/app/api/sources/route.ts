import { randomUUID } from 'node:crypto';
import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint, requireSameOrigin } from '../../../lib/server/http.ts';
import { readImageUpload } from '../../../lib/server/uploads.ts';
import { BackendError } from '../../../lib/server/errors.ts';

export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const workspace = await requireWorkspace(session);
    const image = await readImageUpload(request);
    const existing = await session.database.from('sources').select('id,status').eq('workspace_id', workspace.id).eq('source_type', 'receipt_image').eq('content_hash', image.contentHash).maybeSingle();
    if (existing.error) throw new BackendError('UNAVAILABLE', 'Source lookup failed. Please retry.');
    if (existing.data?.status === 'complete') return { sourceId: existing.data.id as string, duplicate: true };
    const path = `${workspace.id}/${image.contentHash}.${image.extension}`;
    const upload = await session.database.storage.from('raqam-sources').upload(path, image.bytes, { contentType: image.mime, upsert: false });
    const alreadyExists = upload.error && 'statusCode' in upload.error && String(upload.error.statusCode) === '409';
    if (upload.error && !alreadyExists) throw new BackendError('UNAVAILABLE', 'Image could not be stored. Please retry.');
    if (existing.data) {
      const update = await session.database.from('sources').update({ status: 'complete' }).eq('id', existing.data.id).eq('workspace_id', workspace.id);
      if (update.error) throw new BackendError('UNAVAILABLE', 'Source metadata could not be saved. Please retry.');
      return { sourceId: existing.data.id as string, duplicate: true };
    }
    const sourceId = randomUUID();
    const insert = await session.database.from('sources').insert({ id: sourceId, workspace_id: workspace.id, source_type: 'receipt_image', content_hash: image.contentHash, storage_path: path, original_name: image.originalName, status: 'complete' });
    if (insert.error?.code === '23505') {
      const concurrent = await session.database.from('sources').select('id').eq('workspace_id', workspace.id).eq('source_type', 'receipt_image').eq('content_hash', image.contentHash).maybeSingle();
      if (!concurrent.error && concurrent.data) return { sourceId: concurrent.data.id as string, duplicate: true };
    }
    if (insert.error) throw new BackendError('UNAVAILABLE', 'Source metadata could not be saved. Please retry.');
    return { sourceId, duplicate: false };
  }, 201);
}
