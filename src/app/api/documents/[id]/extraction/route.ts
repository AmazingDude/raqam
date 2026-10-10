import { z } from 'zod';
import { requireSession } from '../../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../../../lib/server/http.ts';
import { extractDocument } from '../../../../../lib/server/documents/extraction.ts';
import { BackendError } from '../../../../../lib/server/errors.ts';
import { selectedAIEnvironment } from '../../../../../lib/server/ai-provider-credentials.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return jsonEndpoint(async () => {
    const deadlineAtMs = Date.now() + 50_000;
    const session = await requireSession({ refreshTokens: true });
    requireSameOrigin(request, session.configuration.APP_URL);
    const id = z.uuid().safeParse((await context.params).id);
    if (!id.success) throw new BackendError('NOT_FOUND', 'Document not found.');
    const workspace=await requireWorkspace(session);
    const environment=await selectedAIEnvironment(session,workspace);
    return extractDocument(
      session,
      workspace,
      id.data,
      request,
      await readJson(request),
      { deadlineAtMs },
      {environment:()=>environment},
    );
  });
}
