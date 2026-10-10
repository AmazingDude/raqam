import { requireSession } from '../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../../lib/server/http.ts';
import { scopedDocumentService } from '../../../../lib/server/documents/service.ts';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    const service = scopedDocumentService(session, await requireWorkspace(session), request.signal);
    return service.detail((await context.params).id);
  });
}
export async function PATCH(request: Request, context: Context): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const service = scopedDocumentService(session, await requireWorkspace(session), request.signal);
    return service.review((await context.params).id, await readJson(request));
  });
}
