import { z } from 'zod';
import { requireSession } from '../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../lib/server/workspace.ts';
import { jsonEndpoint } from '../../../../lib/server/http.ts';
import { BackendError } from '../../../../lib/server/errors.ts';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    const workspace = await requireWorkspace(session);
    const id = z.uuid().safeParse((await context.params).id);
    if (!id.success) throw new BackendError('NOT_FOUND', 'Source not found.');
    const source = await session.database.from('sources').select('id,storage_path,status,source_type').eq('id', id.data).eq('workspace_id', workspace.id).maybeSingle();
    if (source.error) throw new BackendError('UNAVAILABLE', 'Source could not be loaded. Please retry.');
    if (!source.data) throw new BackendError('NOT_FOUND', 'Source not found.');
    if (source.data.source_type === 'manual_chat') throw new BackendError('INVALID_INPUT', 'This entry came from your chat history. Open Ask Raqam to read the original message.');
    if (source.data.status !== 'complete') throw new BackendError('UNAVAILABLE', 'Source upload is incomplete. Retry the upload.');
    const link = await session.database.storage.from('raqam-sources').createSignedUrl(source.data.storage_path as string, 60);
    if (link.error || !link.data) throw new BackendError('UNAVAILABLE', 'Source link could not be created. Please retry.');
    return { sourceId: id.data, signedUrl: link.data.signedUrl, expiresInSeconds: 60 };
  });
}
