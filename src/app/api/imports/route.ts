import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint, requireSameOrigin } from '../../../lib/server/http.ts';
import { registerImport } from '../../../lib/server/import-persistence.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    return registerImport(session, await requireWorkspace(session), request);
  }, 201);
}
