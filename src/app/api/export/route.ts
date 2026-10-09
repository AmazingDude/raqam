import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint } from '../../../lib/server/http.ts';
import { readCashbook } from '../../../lib/server/cashbook.ts';
import { exportCashbook } from '../../../lib/server/export.ts';
import { BackendError } from '../../../lib/server/errors.ts';

export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  let csv = '', unresolved = 0;
  const result = await jsonEndpoint(async () => {
    const session = await requireSession();
    if ([...new URL(request.url).searchParams].length) throw new BackendError('INVALID_INPUT', 'Export currently covers the whole workspace; filters are not supported.');
    const workspace = await requireWorkspace(session);
    const snapshot = await readCashbook(session, workspace);
    csv = exportCashbook(snapshot.records, workspace.id);
    unresolved = snapshot.unresolvedImportRowCount;
    return true;
  });
  if (!result.ok) return result;
  return new Response(csv, { headers: {
    'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="raqam-cashbook.csv"',
    'Cache-Control': 'no-store', 'X-Raqam-Unresolved-Import-Rows': String(unresolved),
  } });
}
