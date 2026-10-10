import { requireSession } from '../../../lib/server/auth.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../lib/server/http.ts';
import { createWorkspaceSchema, getOwnedWorkspace, mapWorkspaceRow } from '../../../lib/server/workspace.ts';
import { BackendError } from '../../../lib/server/errors.ts';

export const dynamic = 'force-dynamic';
export async function GET(): Promise<Response> {
  return jsonEndpoint(async () => getOwnedWorkspace(await requireSession()));
}
export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const body = createWorkspaceSchema.safeParse(await readJson(request));
    if (!body.success) throw new BackendError('INVALID_INPUT', 'Provide only a businessName of 1–200 characters.');
    const { data, error } = await session.database.from('workspaces').insert({ owner_subject: session.subject, business_name: body.data.businessName, currency: 'PKR' }).select('id,owner_subject,business_name,currency').single();
    if (error?.code === '23505') throw new BackendError('CONFLICT', 'Your workspace already exists. Reload it.');
    if (error) throw new BackendError('UNAVAILABLE', 'Workspace could not be saved. Please retry.');
    return mapWorkspaceRow(data);
  }, 201);
}
