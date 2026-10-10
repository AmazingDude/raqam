import { z } from 'zod';

export const aiProviderSchema = z.enum(['gemini','openai','groq','claude']);
export type AIProviderName = z.infer<typeof aiProviderSchema>;
export const aiProviderCredentialInputSchema = z.strictObject({
  provider: aiProviderSchema,
  apiKey: z.string().min(8).max(512).regex(/^[\x21-\x7e]+$/),
  textModel: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
  visionModel: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
});
export const aiProviderPublicConfigSchema = z.strictObject({
  provider: aiProviderSchema, configured: z.boolean(), selected: z.boolean(),
  textModel: z.string().max(128).nullable(), visionModel: z.string().max(128).nullable(),
});
export const aiProviderListSchema = z.strictObject({ providers: z.array(aiProviderPublicConfigSchema).length(4), selected: aiProviderSchema.nullable() });
export const aiProviderMutationSchema = z.strictObject({ provider: aiProviderSchema });
export const aiProviderTestResultSchema = z.strictObject({ provider: aiProviderSchema, ok: z.boolean(), message: z.string().max(200) });

export const AI_PROVIDER_LABELS: Record<AIProviderName,string> = {
  gemini: 'Gemini', openai: 'OpenAI', groq: 'Groq', claude: 'Claude',
};
export const AI_PROVIDER_DEFAULTS: Record<AIProviderName,{textModel:string;visionModel:string}> = {
  gemini: { textModel: 'gemini-3.5-flash', visionModel: 'gemini-3.5-flash' },
  openai: { textModel: 'gpt-4.1-mini', visionModel: 'gpt-4.1-mini' },
  groq: { textModel: 'openai/gpt-oss-20b', visionModel: 'qwen/qwen3.8-27b' },
  claude: { textModel: 'claude-sonnet-4-6', visionModel: 'claude-sonnet-4-6' },
};
