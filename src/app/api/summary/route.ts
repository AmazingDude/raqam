import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint } from '../../../lib/server/http.ts';
import { readCashbook } from '../../../lib/server/cashbook.ts';
import { calculateCashSummary } from '../../../lib/server/summary.ts';
import { BackendError } from '../../../lib/server/errors.ts';
import { cashSummaryRangeSchema } from '../../../lib/contracts/cashbook.ts';

export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    const params = new URL(request.url).searchParams;
    const keys = [...params.keys()];
    if (keys.some((key, index) => keys.indexOf(key) !== index)) throw new BackendError('INVALID_INPUT', 'Use each summary date filter once.');
    const range = cashSummaryRangeSchema.safeParse(Object.fromEntries(params));
    if (!range.success) throw new BackendError('INVALID_INPUT', 'Use valid YYYY-MM-DD dates in a non-reversed range.');
    const workspace = await requireWorkspace(session);
    const snapshot = await readCashbook(session, workspace);
    return calculateCashSummary(snapshot.records, workspace.id, snapshot.unresolvedImportRowCount, range.data);
  });
}
