import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../lib/server/http.ts';
import { generateCategoryProposals, listCategoryProposals } from '../../../lib/server/categories.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    return listCategoryProposals(session, await requireWorkspace(session), request);
  });
}

export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    return generateCategoryProposals(session, await requireWorkspace(session), request, await readJson(request));
  });
}
