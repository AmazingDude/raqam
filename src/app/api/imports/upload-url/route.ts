import { requireSession } from '../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../../lib/server/http.ts';
import { createImportUploadIntent } from '../../../../lib/server/import-persistence.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const workspace = await requireWorkspace(session);
    return createImportUploadIntent(session, workspace, await readJson(request, 8192));
  });
}
