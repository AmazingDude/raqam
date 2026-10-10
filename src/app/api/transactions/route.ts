import { z } from 'zod';
import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint } from '../../../lib/server/http.ts';
import { BackendError } from '../../../lib/server/errors.ts';
import { mapCashbookRow } from '../../../lib/server/cashbook-mapping.ts';

export const dynamic = 'force-dynamic';
const querySchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.uuid().optional() });
export async function GET(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    const workspace = await requireWorkspace(session);
    const params = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!params.success) throw new BackendError('INVALID_INPUT', 'Use a limit of 1–50 and optional record cursor.');
    let query = session.database.from('cashbook_records').select('id,workspace_id,source_id,source_row,date,original_description,description,direction,amount_minor,currency,reference,category,category_status').eq('workspace_id', workspace.id).order('id').limit(params.data.limit + 1);
    if (params.data.cursor) query = query.gt('id', params.data.cursor);
    const result = await query;
    if (result.error) throw new BackendError('UNAVAILABLE', 'Cashbook could not be loaded. Please retry.');
    const rows = result.data ?? [], page = rows.slice(0, params.data.limit);
    const items = page.map(mapCashbookRow);
    return { items, nextCursor: rows.length > params.data.limit ? items.at(-1)?.id ?? null : null };
  });
}
