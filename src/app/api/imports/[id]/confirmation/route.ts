import { z } from 'zod';
import { requireSession } from '../../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../../lib/server/workspace.ts';
import { jsonEndpoint, requireSameOrigin, readJson } from '../../../../../lib/server/http.ts';
import { confirmImport } from '../../../../../lib/server/import-persistence.ts';
import { BackendError } from '../../../../../lib/server/errors.ts';

export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const id = z.uuid().safeParse((await context.params).id);
    if (!id.success) throw new BackendError('NOT_FOUND', 'Import not found.');
    const body = await readJson(request, 256 * 1024);
    return confirmImport(session, await requireWorkspace(session), id.data, body);
  });
}
