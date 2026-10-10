import 'server-only';

export { createAIProvider } from './factory.ts';
export type { AIProvider } from './factory.ts';
export { createGroqProvider } from './provider.ts';
export { createGeminiProvider } from './gemini.ts';
export { extractReceipt, createExtractionCacheIdentity } from './extraction.ts';
export { proposeCategories } from './categories.ts';
export { RECEIPT_EXTRACTION_PROMPT, RECEIPT_EXTRACTION_PROMPT_VERSION, RECEIPT_EXTRACTION_SCHEMA_VERSION } from './prompts/extraction.ts';
export { CATEGORY_GUIDE, CATEGORY_GUIDE_VERSION, CATEGORY_PROMPT, CATEGORY_PROMPT_VERSION, CATEGORY_SCHEMA_VERSION } from './prompts/categories.ts';
export type { ReceiptExtraction, ReceiptExtractionInput, ExtractionResult, ExtractionField, ExtractionFieldState, ExtractionIssue, ExtractionCacheIdentityInput } from './extraction.ts';
export type { CategoryBatchInput, CategoryBatchResult, CategoryProposalItem, CategoryTransactionSnapshot } from './categories.ts';
export type {
  GroqProvider, ProviderContext, ProviderDependencies, ProviderClock,
  ProviderResult, ProviderMetadata, ProviderTelemetry, ProviderFailureReason,
  ImageExtractionRequest, TextProposalRequest, ToolConversationRequest,
  ToolConversationMessage, PromptVersions, ToolName,
} from './provider.ts';
