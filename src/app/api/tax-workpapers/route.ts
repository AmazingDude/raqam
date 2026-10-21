import { requireSession } from '../../../lib/server/auth.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../lib/server/http.ts';
import { BackendError } from '../../../lib/server/errors.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { readTaxWorkpaperCase, saveTaxWorkpaperCase } from '../../../lib/server/tax-workpaper.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    const workspace = await requireWorkspace(session);
    const search = new URL(request.url).searchParams;
    if (search.size !== 1 || !search.has('taxYear')) {
      throw new BackendError('INVALID_INPUT', 'Select a tax year.');
    }
    return readTaxWorkpaperCase(session, workspace, { taxYear: search.get('taxYear') });
  });
}

export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const body = await readJson(request, 12 * 1024);
    const workspace = await requireWorkspace(session);
    return saveTaxWorkpaperCase(session, workspace, body);
  });
}
