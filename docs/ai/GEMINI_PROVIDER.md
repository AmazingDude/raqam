# Gemini provider adapter

**Owner:** C1. **Code:** `src/lib/ai/gemini.ts`, `gemini-config.ts`, `factory.ts`. **Status:** scripted regression fixes applied; key listing authenticated; generation returned404/503 and remains unverified. A/C2 adoption pending.

## Request and privacy behavior

`createAIProvider` selects Gemini only when the server environment explicitly sets `AI_PROVIDER=gemini`. An absent selector preserves the existing Groq default. Invalid selectors fail closed. It does not infer a provider from available keys or fall back after provider failure. `createGeminiProvider` remains available for isolated server tests.

Gemini uses Google's stateless `generateContent` REST API at the fixed Google origin with `x-goog-api-key`; requests explicitly set `store:false`. No SDK or dependency was installed. The selected model IDs come from `GEMINI_VISION_MODEL` and `GEMINI_TEXT_MODEL`, and are syntactically validated only. There are no guessed defaults. A supplied API key without both model settings does not enable calls.

- Image mode sends only the authorized, signature-checked PNG/JPEG bytes inline with the prompt. A's2MiB limit applies. It uses JSON response mode and transmits A's optional schema using Google's JSON Schema response field; received data is locally validated with the caller's Zod schema.
- Text mode converts the supplied Zod schema to the supported JSON Schema subset and uses Google's JSON Schema response field, then locally validates against the original Zod schema. Unsupported constructs fail before network use.
- Tool mode declares only A's selected canonical read-only tools, sends Google's JSON Schema function-parameter field, validates the request envelope and total input size, enforces the requested tool choice, validates arguments and returns proposed calls without executing them. `providerState` contains bounded Gemini model parts for stateless continuation and remains server-side. Groq rejects Gemini continuation state.

Every provider request uses one original caller deadline, cancellable fetch and timer races, an attempt timeout capped at20s, at most two attempts total including format repair, bounded 250ms transient backoff, and safe 429 deferral when no usable retry guidance exists. Safety/recitation blocks fail terminally. API keys, prompts, images, tool arguments and continuation state are excluded from metadata and error text. Usage is reported only when a valid provider count exists.

## Verification performed

- `node --conditions=react-server --test --test-isolation=none tests/ai/gemini.test.ts tests/ai/provider.test.ts`: **51/51** scripted provider-interface tests passed before adding extraction tests. Coverage includes image bytes, schema mapping, tool continuation, request bounds, requested tool choice, opaque key syntax, retries/deadlines and Groq regressions.
- `npm run typecheck`: passed using A's strict TypeScript settings.
- `npm test`: **38/38** A backend/security tests passed.
- `GROQ_API_KEY= GROQ_VISION_MODEL= GROQ_TEXT_MODEL= GEMINI_API_KEY= GEMINI_VISION_MODEL= GEMINI_TEXT_MODEL= npm run build`: passed. Sandbox subprocess execution could not parse TypeScript `--showConfig`; the same configured build passed on retry with normal subprocess permissions. Empty AI settings were used, and no model request occurred.
- Gemini model listing authenticated (HTTP200). Minimal generation returned404 on one listed model and503 twice on a current candidate; no live Gemini generation, OCR/schema/tool proof passed. Route integration and cloud verification were not run. Scripted tests are not live provider evidence; see integration.md and PROVIDER_LIVE_REVIEW.md.

## Decisions and limits

The user explicitly requested a Gemini adapter, so the additional provider is C's implementation proposal alongside the PRD's selected Groq runtime. Groq remains the default. A must own approved environment placeholders/host secret configuration and route wiring. A/C2 must acknowledge the `providerState` continuation extension before dependent application use; B confirms error/partial-result presentation. Do not change A's `.env.example`, package/lock/configuration or application routes from C's lane.

The model setting regex confirms only an identifier shape; it does not establish generation access, quota, capabilities or performance. The key authenticated for model listing, but generation remains unavailable. Keep Gemini out of the judge demo until minimal generation, structured schema, image and tool-continuation proofs pass and A/C2 acknowledge continuation state.
