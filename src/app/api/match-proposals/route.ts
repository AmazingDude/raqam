import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../lib/server/http.ts';
import { generateMatchProposals, listMatchProposals } from '../../../lib/server/matches.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    return listMatchProposals(session, await requireWorkspace(session), request);
  });
}

export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    return generateMatchProposals(session, await requireWorkspace(session), request, await readJson(request));
  });
}
