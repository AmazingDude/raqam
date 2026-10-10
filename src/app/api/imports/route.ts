import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../lib/server/http.ts';
import { registerImport, registerStagedImport } from '../../../lib/server/import-persistence.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const workspace = await requireWorkspace(session);
    if (request.headers.get('content-type')?.split(';')[0]?.trim() === 'application/json') {
      return registerStagedImport(session, workspace, await readJson(request, 8192), request.signal);
    }
    return registerImport(session, workspace, request);
  }, 201);
}
