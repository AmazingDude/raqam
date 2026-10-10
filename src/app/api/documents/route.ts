import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../lib/server/http.ts';
import { listDocuments, registerDocument } from '../../../lib/server/documents/persistence.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    return listDocuments(session, await requireWorkspace(session), request);
  });
}

export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    return registerDocument(session, await requireWorkspace(session), await readJson(request), request.signal);
  }, 201);
}
