import 'server-only';
import type { GroqProvider, ProviderContext, ProviderMode, ProviderResult, ProviderTelemetry, PromptVersions } from './provider.ts';

const runtime = globalThis as typeof globalThis & { __raqamProviderCapacityV1?: { active: number } };
// All factory-created providers/features share one slot in this server process.
// A distributed deployment needs a shared database reservation from Person 1.
function capacity() { return runtime.__raqamProviderCapacityV1 ??= { active: 0 }; }

export function withSharedProviderCapacity(provider: GroqProvider, onTelemetry?: (event: ProviderTelemetry) => void): GroqProvider {
  async function run(mode: ProviderMode, versions: PromptVersions | undefined, context: ProviderContext, work: () => Promise<ProviderResult>): Promise<ProviderResult> {
    const state = capacity();
    if (state.active >= 1) {
      const result: ProviderResult = {
        ok: false,
        error: { code: 'UNAVAILABLE', reason: 'budget_unavailable', message: 'Another AI request is running. Keep your draft and retry when it finishes.', retryable: true, retryAfterMs: null },
        metadata: { requestId: typeof context?.requestId === 'string' ? context.requestId : null, mode, model: null, providerVersion: 'shared-provider-capacity-v1', promptVersion: versions?.prompt ?? null, schemaVersion: versions?.schema ?? null, attempts: 0, durationMs: 0, providerRequestIds: [], usage: null },
      };
      try { onTelemetry?.({ outcome: 'failure', reason: result.error.reason, metadata: result.metadata }); } catch { /* Telemetry cannot affect capacity. */ }
      return result;
    }
    state.active += 1;
    try { return await work(); }
    finally { state.active -= 1; }
  }
  return {
    requestImageExtraction: (input, context) => run('image', input?.versions, context, () => provider.requestImageExtraction(input, context)),
    requestTextProposal: (input, context) => run('text', input?.versions, context, () => provider.requestTextProposal(input, context)),
    requestToolConversation: (input, context) => run('tool', input?.versions, context, () => provider.requestToolConversation(input, context)),
  };
}
