import { requireSession } from '../../../lib/server/auth.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../lib/server/http.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { readTaxReadinessProfile, saveTaxReadinessProfile } from '../../../lib/server/tax-readiness.ts';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    const workspace = await requireWorkspace(session);
    return readTaxReadinessProfile(session, workspace);
  });
}

export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const body = await readJson(request, 12 * 1024);
    const workspace = await requireWorkspace(session);
    return saveTaxReadinessProfile(session, workspace, body);
  });
}