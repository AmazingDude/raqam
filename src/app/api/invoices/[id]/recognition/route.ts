import { z } from 'zod';
import { requireSession } from '../../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../../lib/server/workspace.ts';
import { BackendError } from '../../../../../lib/server/errors.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../../../lib/server/http.ts';
import { recognizeInvoice } from '../../../../../lib/server/payments.ts';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new BackendError('INVALID_INPUT', 'Use a valid invoice ID.');
    return recognizeInvoice(session, await requireWorkspace(session), id, await readJson(request));
  }, 201);
}
