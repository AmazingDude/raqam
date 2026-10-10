import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../lib/server/http.ts';
import { listWorkspacePayments, linkWorkspacePayment } from '../../../lib/server/payments.ts';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    return listWorkspacePayments(session, await requireWorkspace(session));
  });
}

export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    return linkWorkspacePayment(session, await requireWorkspace(session), await readJson(request));
  }, 201);
}
