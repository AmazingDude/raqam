import 'server-only';
import { z } from 'zod';
import { MAX_IMAGE_BYTES } from '../server/uploads.ts';

export const PROVIDER_LIMITS = Object.freeze({
  attempts: 2, attemptTimeoutMs: 20_000, transientBackoffMs: 250,
  imageBytes: MAX_IMAGE_BYTES, inputCharacters: 32_000, outputCharacters: 32_000,
  outputTokens: 2048, toolOutputTokens: 1024, messages: 16, tools: 4,
});
export const PROVIDER_VERSION = 'groq-provider-v1';
export const VERSION_PATTERN = /^[a-z][a-z0-9_-]{0,48}-v[1-9]\d{0,5}$/;

const configurationSchema = z.object({
  apiKey: z.string().trim().regex(/^[A-Za-z0-9_-]{1,512}$/),
  visionModel: z.literal('qwen/qwen3.8-27b'),
  textModel: z.literal('openai/gpt-oss-20b'),
});
const compatibleSchema=z.object({apiKey:z.string().trim().min(8).max(512).regex(/^[\x21-\x7e]+$/),visionModel:z.string().min(1).max(128),textModel:z.string().min(1).max(128)});
export type ProviderConfiguration = z.infer<typeof configurationSchema> & {baseURL?:string;providerVersion?:string};

// Only called when an operation runs. No build/import-time env reads or network.
export function readProviderConfiguration(environment: Record<string, string | undefined>): ProviderConfiguration | null {
  if(environment.AI_PROVIDER==='openai') {
    const parsed=compatibleSchema.safeParse({apiKey:environment.OPENAI_API_KEY,visionModel:environment.OPENAI_VISION_MODEL,textModel:environment.OPENAI_TEXT_MODEL});
    return parsed.success?{...parsed.data,baseURL:'https://api.openai.com',providerVersion:'openai-provider-v1'} as ProviderConfiguration:null;
  }
  const parsed = configurationSchema.safeParse({
    apiKey: environment.GROQ_API_KEY,
    visionModel: environment.GROQ_VISION_MODEL,
    textModel: environment.GROQ_TEXT_MODEL,
  });
  return parsed.success ? parsed.data : null;
}
