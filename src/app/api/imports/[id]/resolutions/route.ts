import { z } from 'zod';
import { requireSession } from '../../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../../lib/server/workspace.ts';
import { jsonEndpoint, requireSameOrigin, readJson } from '../../../../../lib/server/http.ts';
import { readImportResolutions, resolveImport } from '../../../../../lib/server/import-persistence.ts';
import { BackendError } from '../../../../../lib/server/errors.ts';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
async function importId(context: Context): Promise<string> {
  const id = z.uuid().safeParse((await context.params).id);
  if (!id.success) throw new BackendError('NOT_FOUND', 'Import not found.');
  return id.data;
}
export async function GET(_request: Request, context: Context): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    return readImportResolutions(session, await requireWorkspace(session), await importId(context));
  });
}
export async function POST(request: Request, context: Context): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const id = await importId(context);
    const body = await readJson(request, 256 * 1024);
    return resolveImport(session, await requireWorkspace(session), id, body);
  });
}
