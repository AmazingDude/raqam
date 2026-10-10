import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../lib/server/http.ts';
import { reviewProposal, readProposalReviews } from '../../../lib/server/reviews/proposals.ts';

export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    return readProposalReviews(session, await requireWorkspace(session), request);
  });
}
export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    return reviewProposal(session, await requireWorkspace(session), await readJson(request));
  });
}
