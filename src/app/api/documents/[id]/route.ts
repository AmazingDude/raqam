import { z } from 'zod';
import { requireSession } from '../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../../lib/server/http.ts';
import { readDocument, reviewDocument } from '../../../../lib/server/documents/persistence.ts';
import { BackendError } from '../../../../lib/server/errors.ts';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

async function documentId(context: Context) {
  const parsed = z.uuid().safeParse((await context.params).id);
  if (!parsed.success) throw new BackendError('NOT_FOUND', 'Document not found.');
  return parsed.data;
}

export async function GET(request: Request, context: Context): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    return readDocument(session, await requireWorkspace(session), await documentId(context), request.signal);
  });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    return reviewDocument(session, await requireWorkspace(session), await documentId(context), await readJson(request), request.signal);
  });
}
