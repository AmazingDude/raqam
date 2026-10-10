import { z } from 'zod';
import { requireSession } from '../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../../lib/server/http.ts';
import { BackendError } from '../../../../lib/server/errors.ts';
import { readTransaction, reviewTransaction } from '../../../../lib/server/cashbook.ts';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
async function transactionId(context: Context) {
  const parsed = z.uuid().safeParse((await context.params).id);
  if (!parsed.success) throw new BackendError('NOT_FOUND', 'Transaction not found.');
  return parsed.data;
}
export async function GET(_request: Request, context: Context): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    return readTransaction(session, await requireWorkspace(session), await transactionId(context));
  });
}
export async function PATCH(request: Request, context: Context): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    return reviewTransaction(session, await requireWorkspace(session), await transactionId(context), await readJson(request));
  });
}
