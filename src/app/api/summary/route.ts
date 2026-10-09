import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint } from '../../../lib/server/http.ts';
import { readCashbook } from '../../../lib/server/cashbook.ts';
import { calculateCashSummary } from '../../../lib/server/summary.ts';
import { BackendError } from '../../../lib/server/errors.ts';

export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    if ([...new URL(request.url).searchParams].length) throw new BackendError('INVALID_INPUT', 'Summary currently covers the whole workspace; filters are not supported.');
    const workspace = await requireWorkspace(session);
    const snapshot = await readCashbook(session, workspace);
    return calculateCashSummary(snapshot.records, workspace.id, snapshot.unresolvedImportRowCount);
  });
}
