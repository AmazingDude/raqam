import 'server-only';
import type { GroqProvider, ProviderContext, ProviderDependencies, ProviderResult, ImageExtractionRequest, TextProposalRequest, ToolConversationRequest } from './provider.ts';
import { createGroqProvider } from './provider.ts';
import { createGeminiProvider } from './gemini.ts';
import { createEveAssistant } from './eve.ts';

export type AIProvider = GroqProvider;

// Selection is explicit and read per operation. Provider credentials are never used to infer a fallback.
export function createAIProvider(dependencies: ProviderDependencies = {}): AIProvider {
  const environment = dependencies.environment ?? (() => process.env);
  function selected(): AIProvider {
    let settings: Record<string, string | undefined>;
    try { settings = environment(); } catch { settings = {}; }
    if (settings.AI_PROVIDER === undefined || settings.AI_PROVIDER === 'groq') return createGroqProvider({ ...dependencies, environment: () => settings });
    if (settings.AI_PROVIDER === 'gemini') return createGeminiProvider({ ...dependencies, environment: () => settings });
    return createGroqProvider({ ...dependencies, environment: () => ({}) });
  }
  return {
    requestImageExtraction: (input: ImageExtractionRequest, context: ProviderContext): Promise<ProviderResult> => selected().requestImageExtraction(input, context),
    requestTextProposal: (input: TextProposalRequest, context: ProviderContext): Promise<ProviderResult> => selected().requestTextProposal(input, context),
    requestToolConversation: (input: ToolConversationRequest, context: ProviderContext): Promise<ProviderResult> => {
      let settings: Record<string, string | undefined>;
      try { settings = environment(); } catch { settings = {}; }
      return settings.ASSISTANT_PROVIDER === 'eve'
        ? createEveAssistant({ ...dependencies, environment: () => settings }).requestToolConversation(input, context)
        : selected().requestToolConversation(input, context);
    },
  };
}
