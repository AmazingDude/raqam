import { randomUUID } from 'node:crypto';
import { createAIProvider } from '../../../lib/ai/index.ts';
import { assistantRequestSchema } from '../../../lib/contracts/assistant.ts';
import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../lib/server/http.ts';
import { BackendError } from '../../../lib/server/errors.ts';
import { createScopedAssistantTools } from '../../../lib/server/assistant/tools.ts';
import { runAssistant } from '../../../lib/server/assistant/engine.ts';
import { acquireAssistantRequest } from '../../../lib/server/assistant/request-budget.ts';
import { selectedAIEnvironment } from '../../../lib/server/ai-provider-credentials.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const parsed = assistantRequestSchema.safeParse(await readJson(request, 8 * 1024));
    if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Ask a question between 1 and 1000 characters.');
    const workspace = await requireWorkspace(session);
    const environment=await selectedAIEnvironment(session,workspace);
    const deadlineAt = Date.now() + 45_000;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]);
    const tools = createScopedAssistantTools(session, workspace, { deadlineAt, signal });
    const release = acquireAssistantRequest(session.subject);
    try {
      return await runAssistant({ question: parsed.data.question, workspaceId: workspace.id, requestId: randomUUID(),
        deadlineAt, signal, provider: createAIProvider({environment:()=>environment}), tools });
    } finally { release(); }
  });
}
