# Provider implementation review and live credential smoke check

Date: 10 October 2026. Scope: C-owned Groq/Gemini provider implementation in the working tree on `codex/ai-two-person`; pending A baseline merge remains separate and uncommitted. Review only: no adapter fixes, later features, commit, push or deployment.

## Actual live evidence

Only synthetic text was sent. Keys were read privately from ignored `.env.local`; the supplied Gemini key was stored there without changing the existing Groq key. No key, raw provider error body, financial record or private service URL is included here. Model settings were injected into the probe process only, not installed as application defaults.

| Provider/probe | Actual result | Duration | Meaning |
| --- | --- | --- | --- |
| Gemini official model list | HTTP200 | 571ms | Supplied credential authenticates and can list models; this alone does not prove generation access. |
| Groq official model list | HTTP200 | 819ms | Existing local credential authenticates; both configured adapter model candidates were listed. |
| Groq public `requestTextProposal` | Success, exact synthetic canonical category proposal; one attempt | 577ms | Live adapter text/strict-schema path passed on `openai/gpt-oss-20b`. Usage:311 input/139 output/450 total tokens. |
| Gemini public `requestTextProposal` | `configuration_missing`; zero requests | 3ms | Key-format guard rejects the supplied credential locally, even with model IDs injected. |
| Direct Gemini minimal generation, `gemini-2.5-flash` | HTTP404 `NOT_FOUND` | 507ms | Listing a model did not establish generation availability. |
| Direct Gemini minimal generation, `gemini-3.8-flash` | HTTP503 `UNAVAILABLE` | 3521ms | No successful generation response. |
| One bounded retry, same current Gemini model | HTTP503 `UNAVAILABLE` | 4509ms | Retry also failed; no further retries made. |

Gemini requests used the official GenerateContent endpoint, private header authentication, `store:false`, a synthetic request for exactly `RAQAM_OK`, temperature0 and bounded output. The older model request additionally disabled thinking. The current-model two-attempt check used default thinking settings. No Gemini image/schema/tool proof succeeded or was attempted in this review. Groq image/tool modes were not reverified live in this session. These probes do not establish application integration, cloud reliability or OCR accuracy.

The opt-in probe programs and sanitized responses were written under `/tmp/raqam-provider-*.{mjs,ts,json}` and `/tmp/raqam-gemini-current-model-check.ts`. These are session-local verification artifacts, not a shipped runner. No dependencies were installed. Both application model-env pairs remain unset; passing process-injected model settings does not configure the app.

## Standards review findings

1. **P1 — Unbounded and incompletely validated tool input** (`src/lib/ai/gemini.ts:272–320`): tool mode checks counts but omits runtime message-envelope validation and the aggregate32000-character context bound. Independent scripted reproduction sent a40000-character user message and accepted success. Validate role/content/choice and total request context before spending allowance or sending a request; include continuation state and arguments in bounds.
2. **P2 — Requested tool choice is not enforced locally** (`src/lib/ai/gemini.ts:207–221`): a call under `choice:none`, or text under `choice:required`, is accepted as success. Both were reproduced with injected responses. Enforce mode constraints within the existing two-attempt allowance; reject an invalid runtime choice before transport.
3. **P2 — Key alphabet restriction excludes an authenticated key** (`src/lib/ai/gemini-config.ts:12`): punctuation in the supplied credential is rejected. Use bounded nonempty header-safe opaque validation rather than an undocumented alphabet restriction. Live authentication succeeded separately; the current adapter still made zero requests.

## Spec review findings

1. **P1 — JSON Schema is sent through OpenAPI schema fields** (`src/lib/ai/gemini.ts:263`, `269`, `276`): the converter emits JSON Schema forms, including nullable type arrays and `additionalProperties`, but uses `responseSchema` and function `parameters`. Google's reference distinguishes these from `responseJsonSchema` and `parametersJsonSchema`. Adopt the JSON-schema-capable fields or implement a genuine supported OpenAPI conversion. This is a documented wire incompatibility, not a successful live schema rejection reproduction; the local key guard blocked adapter transport.
2. The tool bounds, choice and credential defects above also violate addendum I3/I4's conformance requirements. Gemini must remain in review until corrected and tested.

Official reference checked: [GenerateContent and function schema fields](https://ai.google.dev/api/generate-content), [model listing](https://ai.google.dev/api/models). The referenced JSON-schema-capable field selection must be checked with the eventual available model and actual live schema/tool evidence.

## Checks and missing acceptance evidence

- Existing focused public-interface suite: `node --conditions=react-server --test --test-isolation=none tests/ai/gemini.test.ts tests/ai/provider.test.ts` —47/47 passed. These scripted passes do not cover the four defects above.
- `npm run typecheck` — passed. `git diff --check` — passed before this documentation update; rerun after updating handoffs.
- No lint command is configured. No new build/backend test rerun was needed for this review-only task; previous implementation evidence remains separate.
- Missing Gemini regressions: opaque credential punctuation; correct wire schema field assertions; malformed role/content/choice envelopes; aggregate and continuation bounds; both tool-choice violations; cancellation before/in flight/backoff; budget denial/outage; mixed two-attempt exhaustion; terminal auth/no fallback; truncated/missing candidates and unsupported schemas before transport. Do not describe the existing nine Gemini cases as the complete conformance matrix.
- Missing live acceptance: successful Gemini generation, canonical structured output, clean/changed/unreadable image extraction and complete authorized read-only tool continuation. A/C2 continuation acknowledgement, host configuration and integrated A/B private persistence/review flow remain pending.

Next action: fix the four C-owned adapter defects and add the missing regression coverage before claiming Gemini readiness. Groq live text success is independently established; it does not complete later extraction features or A/B integration.
