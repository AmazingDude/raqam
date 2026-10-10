import { requireSession } from '../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../../lib/server/http.ts';
import { generateInvoiceDraft } from '../../../../lib/server/invoice-ai.ts';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session=await requireSession();
    requireSameOrigin(request,session.configuration.APP_URL);
    const workspace=await requireWorkspace(session);
    return generateInvoiceDraft(await readJson(request,65536),workspace.currency,request.signal);
  });
}
