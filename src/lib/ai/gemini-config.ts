import 'server-only';

const modelPattern = /^gemini-[A-Za-z0-9][A-Za-z0-9._-]{0,96}$/;
export function isGeminiModel(value: string): boolean { return modelPattern.test(value); }
export interface GeminiConfiguration { apiKey: string; visionModel: string; textModel: string }

// Model access is account-dependent, so C requires explicit IDs rather than guessing a default.
export function readGeminiConfiguration(environment: Record<string, string | undefined>): GeminiConfiguration | null {
  const apiKey = environment.GEMINI_API_KEY?.trim();
  const visionModel = environment.GEMINI_VISION_MODEL?.trim();
  const textModel = environment.GEMINI_TEXT_MODEL?.trim();
  // API keys are opaque. Allow visible ASCII punctuation but reject whitespace/control
  // characters so a key cannot inject another header or line into fetch.
  if (!apiKey || apiKey.length > 512 || !/^[\x21-\x7e]+$/.test(apiKey) || !visionModel || !isGeminiModel(visionModel) || !textModel || !isGeminiModel(textModel)) return null;
  return { apiKey, visionModel, textModel };
}
