import { z } from 'zod';
import { requireSession } from '../../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../../lib/server/workspace.ts';
import { jsonEndpoint } from '../../../../../lib/server/http.ts';
import { documentHistory } from '../../../../../lib/server/documents/persistence.ts';
import { BackendError } from '../../../../../lib/server/errors.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    const id = z.uuid().safeParse((await context.params).id);
    if (!id.success) throw new BackendError('NOT_FOUND', 'Document not found.');
    return documentHistory(session, await requireWorkspace(session), id.data, request);
  });
}
