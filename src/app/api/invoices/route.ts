import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../lib/server/http.ts';
import { BackendError } from '../../../lib/server/errors.ts';
import { listInvoices, createOrUpdateInvoice } from '../../../lib/server/invoices.ts';
import { invoiceUpsertInputSchema } from '../../../lib/contracts/invoices.ts';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    const workspace = await requireWorkspace(session);
    return listInvoices(session, workspace.id, workspace.currency);
  });
}

export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const workspace = await requireWorkspace(session);
    const body = await readJson(request, 65536);
    const parsed = invoiceUpsertInputSchema.safeParse(body);
    if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Check the invoice fields and line items.');
    return createOrUpdateInvoice(session, workspace.id, parsed.data, workspace.currency, workspace.businessName);
  });
}
