import { requireSession } from '../../../../lib/server/auth.ts';
import { jsonEndpoint } from '../../../../lib/server/http.ts';
import { CSV_TEMPLATE } from '../../../../lib/server/csv.ts';

export const dynamic = 'force-dynamic';
export async function GET(): Promise<Response> {
  const authorization = await jsonEndpoint(async () => { await requireSession(); return true; });
  if (!authorization.ok) return authorization;
  return new Response(CSV_TEMPLATE, { headers: {
    'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="raqam-pkr-template.csv"',
    'Cache-Control': 'no-store',
  } });
}
