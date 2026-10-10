import 'server-only';
import { z } from 'zod';
import { assistantRequestSchema } from '../contracts/assistant.ts';
import type { ScopedAssistantResultTools } from '../server/assistant/tools.ts';
import type { GroqProvider, ToolConversationMessage } from './provider.ts';
import { AnswerEvidenceError, AnswerSession, type GroundedAnswer } from './answer.ts';
import { ASSISTANT_SYSTEM, ASSISTANT_VERSIONS } from './prompts/assistant.ts';
import { AssistantBoundaryError, AssistantToolBoundary, assistantToolDefinitions, assertActive, boundedExecution,
  prepareAssistantCall, type PublicToolTrace } from './tools.ts';
import type { ExecutionContext } from './tools.ts';

const outputSchema = z.strictObject({ content: z.string().max(32000).nullable(), toolCalls: z.array(z.strictObject({
  id: z.string().min(1).max(128), name: z.string().min(1).max(100), arguments: z.string().max(8000),
})).max(4), providerState: z.unknown().optional() });
const metadataSchema = z.object({ mode: z.literal('tool'), providerVersion: z.string().min(1).max(200),
  model: z.string().min(1).max(200).nullable(), promptVersion: z.literal(ASSISTANT_VERSIONS.prompt),
  schemaVersion: z.literal(ASSISTANT_VERSIONS.schema), attempts: z.number().int().min(0).max(2), durationMs: z.number().finite().nonnegative() });
export type AssistantOutcome = GroundedAnswer & { actionTrail: PublicToolTrace[];
  metadata: { requestId: string; rounds: number; attempts: number; durationMs: number;
    providers: Array<{ providerVersion: string; model: string | null; attempts: number; durationMs: number }>;
    versions: typeof ASSISTANT_VERSIONS; execution: 'request_local' } };

/** C-only operation; A owns authenticated route/identity, B owns rendering. */
export async function answerBookkeepingQuestion(input: { question: string; workspaceId: string; requestId: string;
  deadlineAtMs: number; signal?: AbortSignal }, dependencies: {
  provider: Pick<GroqProvider, 'requestToolConversation'>;
  tools: ScopedAssistantResultTools | ((context: ExecutionContext) => ScopedAssistantResultTools);
}): Promise<AssistantOutcome> {
  const question = assistantRequestSchema.parse({ question: input.question }).question;
  z.string().min(1).max(200).parse(input.workspaceId); z.uuid().parse(input.requestId);
  z.number().int().finite().parse(input.deadlineAtMs);
  const started = Date.now();
  const controller = new AbortController();
  const onAbort = () => controller.abort(); input.signal?.addEventListener('abort', onAbort, { once: true });
  if (input.signal?.aborted) controller.abort();
  const context = { deadlineAtMs: Math.min(input.deadlineAtMs, started + 50_000), signal: controller.signal };
  const evidence = new AnswerSession(input.workspaceId);
  let tools: AssistantToolBoundary | undefined;
  const messages: ToolConversationMessage[] = [{ role: 'system', content: ASSISTANT_SYSTEM }, { role: 'user', content: question }];
  const callIds = new Set<string>();
  let rounds = 0, attemptsTaken = 0, attemptsReported = 0, closed = false;
  const providers: AssistantOutcome['metadata']['providers'] = [];
  function finish(answer: GroundedAnswer): AssistantOutcome {
    closed = true;
    return { ...answer, actionTrail: tools?.trace() ?? [], metadata: { requestId: input.requestId, rounds,
      attempts: Math.max(attemptsTaken, attemptsReported), durationMs: Date.now() - started, providers,
      versions: ASSISTANT_VERSIONS, execution: 'request_local' } };
  }
  try {
    assertActive(context);
    // A can bind its authenticated factory to this exact cancellation/deadline scope.
    tools = new AssistantToolBoundary(evidence, typeof dependencies.tools === 'function' ? dependencies.tools(context) : dependencies.tools, context);
    for (; rounds < 3;) {
      assertActive(context);
      // Leave headroom inside C1's 32k envelope for tool schemas and repair text.
      if (JSON.stringify(messages).length > 23_000) return finish(evidence.fallback('execution_limit'));
      if (Math.max(attemptsTaken, attemptsReported) >= 3) return finish(evidence.fallback('execution_limit'));
      const choice = rounds === 2 || tools.executions() >= 4 ? 'none' : 'auto';
      rounds++;
      let operationAttempts = 0;
      const result = await boundedExecution(context, () => dependencies.provider.requestToolConversation({ messages,
        tools: assistantToolDefinitions, choice, versions: ASSISTANT_VERSIONS }, {
        requestId: input.requestId, deadlineAtMs: context.deadlineAtMs, signal: context.signal,
        budget: { take: () => {
          if (closed || operationAttempts >= 2 || context.signal.aborted || Date.now() >= context.deadlineAtMs || Math.max(attemptsTaken, attemptsReported) >= 3) return false;
          operationAttempts++; attemptsTaken++; return true;
        } },
      }));
      const metadata = metadataSchema.safeParse(result.metadata);
      if (!metadata.success || attemptsReported + metadata.data.attempts > 3) return finish(evidence.fallback('unavailable'));
      attemptsReported += metadata.data.attempts;
      attemptsTaken = Math.max(attemptsTaken, attemptsReported);
      providers.push({ providerVersion: metadata.data.providerVersion, model: metadata.data.model,
        attempts: metadata.data.attempts, durationMs: metadata.data.durationMs });
      if (!result.ok) return finish(evidence.fallback('unavailable'));
      const parsed = outputSchema.safeParse(result.output);
      if (!parsed.success) return finish(evidence.fallback('invalid_answer'));
      const output = parsed.data;
      if (!output.toolCalls.length) {
        try { return finish(evidence.render(JSON.parse(output.content ?? ''))); }
        catch { return finish(evidence.fallback('invalid_answer')); }
      }
      if (choice === 'none' || new Set(output.toolCalls.map(call => call.id)).size !== output.toolCalls.length ||
        output.toolCalls.some(call => callIds.has(call.id))) return finish(evidence.fallback('execution_limit'));
      // Validate the entire argument batch before executing any of it.
      for (const call of output.toolCalls) prepareAssistantCall(call.name, call.arguments);
      // Provider-specific continuation stays private and bounded; never enters public output.
      if (output.providerState !== undefined && JSON.stringify(output.providerState).length > 32000)
        return finish(evidence.fallback('invalid_answer'));
      messages.push({ role: 'assistant', content: null, toolCalls: output.toolCalls.map(call => ({ ...call,
        name: prepareAssistantCall(call.name, call.arguments).name })),
        ...(output.providerState !== undefined ? { providerState: output.providerState } : {}) });
      for (const call of output.toolCalls) {
        callIds.add(call.id);
        const observation = await tools.execute(call.name, call.arguments);
        messages.push({ role: 'tool', callId: call.id, content: JSON.stringify(observation) });
      }
    }
    return finish(evidence.fallback('execution_limit'));
  } catch (error) {
    return finish(evidence.fallback(error instanceof AnswerEvidenceError && error.reason === 'stale_results' ? 'stale_results' :
      error instanceof AssistantBoundaryError && error.reason === 'cancelled' ? 'cancelled' :
      error instanceof AssistantBoundaryError && error.reason === 'execution_limit' ? 'execution_limit' : 'unavailable'));
  } finally { closed = true; controller.abort(); input.signal?.removeEventListener('abort', onAbort); }
}
