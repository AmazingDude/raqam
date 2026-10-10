import { requireSession } from '../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../../lib/server/http.ts';
import { BackendError } from '../../../../lib/server/errors.ts';
import { z } from 'zod';
import { updateInvoiceStatus, deleteInvoice, createOrUpdateInvoice } from '../../../../lib/server/invoices.ts';
import { invoiceStatusUpdateSchema, invoiceUpsertInputSchema, invoiceDeleteSchema } from '../../../../lib/contracts/invoices.ts';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const workspace = await requireWorkspace(session);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new BackendError('INVALID_INPUT', 'Use a valid invoice ID.');
    const body = await readJson(request, 65536);

    const statusCheck = invoiceStatusUpdateSchema.safeParse(body);
    if (statusCheck.success) {
      return updateInvoiceStatus(session, workspace.id, id, statusCheck.data.status, statusCheck.data.expectedVersion);
    }

    const fullCheck = invoiceUpsertInputSchema.safeParse(body);
    if (!fullCheck.success || (fullCheck.data.id && fullCheck.data.id !== id)) throw new BackendError('INVALID_INPUT', 'Check the invoice fields and saved version.');
    return createOrUpdateInvoice(session, workspace.id, { ...fullCheck.data, id }, workspace.currency, workspace.businessName);
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const workspace = await requireWorkspace(session);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new BackendError('INVALID_INPUT', 'Use a valid invoice ID.');
    const parsed = invoiceDeleteSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Use the saved invoice version when deleting.');
    await deleteInvoice(session, workspace.id, id, parsed.data.expectedVersion);
    return { ok: true, deleted: id };
  });
}
