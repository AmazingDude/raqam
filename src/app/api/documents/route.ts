import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../lib/server/http.ts';
import { scopedDocumentService } from '../../../lib/server/documents/service.ts';

export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    const service = scopedDocumentService(session, await requireWorkspace(session), request.signal);
    return service.list(new URL(request.url).searchParams);
  });
}
export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const service = scopedDocumentService(session, await requireWorkspace(session), request.signal);
    return service.register(await readJson(request));
  }, 201);
}
