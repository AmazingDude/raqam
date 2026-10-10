import { requireSession } from '../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../../lib/server/http.ts';
import { BackendError } from '../../../../lib/server/errors.ts';
import { createAIProvider } from '../../../../lib/ai/factory.ts';
import { proposeExpenseNote } from '../../../../lib/ai/expense-note.ts';
import { selectedAIEnvironment } from '../../../../lib/server/ai-provider-credentials.ts';
import { createEveBudget } from '../../../../lib/ai/eve-budget.ts';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
const requestSchema = z.strictObject({ note: z.string().trim().min(1).max(3000) });
const dailyBudget = createEveBudget();

export async function POST(request: Request): Promise<Response> {
  return jsonEndpoint(async () => {
    const session = await requireSession();
    requireSameOrigin(request, session.configuration.APP_URL);
    const workspace = await requireWorkspace(session);
    const parsed = requestSchema.safeParse(await readJson(request, 8192));
    if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Enter a short expense note to prepare a draft.');
    const release = dailyBudget.acquire(process.env.EXPENSE_AI_DAILY_REQUEST_LIMIT);
    if (!release) throw new BackendError('UNAVAILABLE', 'Expense AI is busy or its daily allowance is exhausted. Save the note manually and try again later.');
    try {
      const environment = await selectedAIEnvironment(session, workspace);
      const provider = createAIProvider({ environment: () => environment });
      const now = Date.now();
      const fields = await proposeExpenseNote(parsed.data.note, provider, {
        requestId: crypto.randomUUID(), deadlineAtMs: now + 22_000, signal: request.signal,
        budget: { take: () => true },
      });
      return { workspaceId: workspace.id, fields, evidenceText: parsed.data.note, provider: environment.AI_PROVIDER ?? 'groq' };
    } catch (error) {
      if (error instanceof BackendError) throw error;
      throw new BackendError('UNAVAILABLE', 'The expense suggestion could not be verified. Your note is preserved; enter or correct fields manually.');
    } finally {
      release();
    }
  });
}
