# Provider integration addendum — existing steps 2 and 4–8 plus Gemini

Date: 10 October 2026. Owner: C1. Status: proposed execution details for user review; documentation only.

Read IMPLEMENTATION_STEPS.md and PERSON_C_PLAN.md first. They remain the original implementation plan. This addendum maps existing unfinished integration work and adds the user's requested Gemini adapter; it does not replace or renumber steps, mark team agreement, or authorize implementation of A/B modules. Gemini is an explicitly requested extension to the existing Groq runtime choice; the PRD still records Groq. Groq remains the default recommendation until the team selects a verified alternative. No automatic provider fallback is proposed.

## 1. Actual baseline and what changes

C step3 live feasibility passed using the existing synthetic receipts. C steps4–5 now implement the Groq provider and safe failures; the review defect for null budgets/outer requests is fixed. All38 provider tests, strict typecheck and build passed after that fix. These are not live verification of the new adapter or integrated AI routes.

The checkout is `codex/ai-two-person`, HEAD75a4c61 with the pending uncommitted A4b1782c merge. New C source/tests remain untracked; preserve the pending merge, earlier work, ignored environment, frontend archive and references. No commit/push/deploy is part of this plan.

A's installed runtime is Next16.4.0, TypeScript5.9.3, Zod4.6.5, Groq SDK1.6.0, server-only0.0.1 and Node>=22.18.0. Native fetch and the existing Node test runner are available. No Gemini SDK is installed. Do not install one or edit manifests merely to add this adapter.

Existing callable interface: createGroqProvider returns requestImageExtraction, requestTextProposal and requestToolConversation. Requests carry explicit versions; context carries a request UUID, absolute deadline, optional cancellation and account allowance. Output remains unknown until validated. A's ApiErrorCode, source reference, image guard, proposal and four tool argument schemas are canonical. See PROVIDER_CONTRACT.md for exact behavior.

## 2. Ownership and dependency map

| Work | Existing step/task | Owner and expected files | Completion evidence |
| --- | --- | --- | --- |
| Agree actual provider/outcome/context seam | Step2/C-00, A BA-00 | C1: docs/ai/contracts.md, PROVIDER_CONTRACT.md; A1: canonical shared contract files; C2/B acknowledge in their own handoffs | Named exports, version and acknowledgement recorded; no fictional adoption |
| Private runtime model/provider configuration | Steps3–4/C-01/C-02 | C1 defines/validates settings in src/lib/ai; A1 controls env example/runtime/deployment configuration | Selected provider has valid settings; missing settings fail closed; no key in client output |
| Add Gemini transport | Explicit extension of steps3–5/C-01/C-02 | C1: src/lib/ai/gemini.ts, C-owned common seam/config/factory, tests/ai/gemini.test.ts and conformance tests | Three modes and bounded behavior pass scripted tests; live capability status reported separately |
| Runtime route context and translation | Existing integration responsibilities, A BA-00 and document/proposal services | A1 owns shared helpers/contracts; A2 owns document/proposal/assistant wrappers per BACKEND_TASKS.md; C supplies adapters | Owner-scoped bytes/context, trusted deadline, safe API failures and no secrets verified by A |
| Reviewable extraction engine | Step6/C-03 | C1: extraction.ts, prompts/extraction.ts, extraction tests | Original step6 acceptance including unknowns, exact normalization and field evidence |
| Cache/rerun identity and reservation | Step7/C-03 | C1: C identity helper/tests; A owns durable reservation/persistence | Provider/model included in identity; no correction overwrite; concurrent/durable evidence comes from A |
| Upload → extraction → reviewed reload | Step8/C-03 | C1: integration.md/C tests; A2 backend; B screens/browser checks | Original step8 signed-in, persisted, private, live/cached and failure gates pass |

No redivision of C2's matching/tools/assistant ownership. C1 owns edits to provider/config/index and shared provider test support; C2 consumes the acknowledged seam. B imports safe domain types and uses backend APIs rather than provider runtime modules.

## 3. Execution order using the original runbook

### I1 — reconcile the concrete interface (existing step2)

1. Compare PROVIDER_CONTRACT.md and actual exports with A's canonical v0.1 contracts and latest BA-00 work. Check the actual branch/revision, not a statement that another person finished a task.
2. Publish C's current operation/result/error/context shapes. Keep transport failures C-local and map to existing safe API codes; do not add competing shared enums.
3. Ask A to adopt the feature extraction outcome, required-review field policy and evidence locator/version shapes from the original runbook. A stores canonical domain types; C implements the feature parser against those adopted exports.
4. Record which printed fields need raw text versus normalized values, how absent/unreadable/ambiguous differ, and how source evidence is located. A's current DocumentFields is a normalized payload, not the complete field-level extraction evidence contract. Do not imply it already supports every runbook field.
5. A/C2 acknowledge the actual transport version; B confirms recoverable failure/partial/field rendering. Until acknowledgement, C's interface remains an implementation proposal, not broad adoption.

Acceptance: documented adopted-versus-pending list with exact exports and owner decisions. Independent Gemini preparation can proceed before outcome adoption; extraction contract-dependent code waits.

### I2 — configure an explicitly selected provider (steps4–5 extension)

Proposed server-only environment names, not values to commit:

```dotenv
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_VISION_MODEL=
GROQ_TEXT_MODEL=
GEMINI_API_KEY=
GEMINI_VISION_MODEL=
GEMINI_TEXT_MODEL=
```

1. Preserve createGroqProvider and its existing tests/import paths. Add createAIProvider for application callers; propose AIProvider as the common three-operation type with a compatibility alias for the existing GroqProvider name. Move shared C types into a C-owned file if necessary, without importing a Groq implementation from Gemini.
2. Resolve the provider lazily when operations run. Before A introduces AI_PROVIDER, preserve the existing Groq default for compatibility; an explicitly invalid value fails configuration validation. Never infer selection from whichever secret happens to exist.
3. Validate only the selected provider's credentials/model settings. A Gemini deployment must not require a Groq key; a Groq deployment must not require a Gemini key.
4. Extend safe provenance with explicit provider identity and adapter version; retain model, prompt/schema versions and original request ID. Update C tests/callers together, then obtain A/C2 acknowledgement before dependent wiring.
5. A1 adds placeholders/validation to A-owned env/config only when implementing their handoff. Actual keys go in ignored local env/host secret settings. C never adds NEXT_PUBLIC provider secrets or edits A's configuration under this plan.

Acceptance: default Groq compatibility, explicit Gemini selection, rejected invalid selector, no import-time credentials/network, empty-settings build, no silent fallback. A owns runtime provisioning; C owns adapter validation.

### I3 — implement Gemini behind the same interface (new provider, steps3–5 gates reused)

**Implementation status:** the server-only REST adapter, selection factory, bounded conversation state and scripted conformance tests now exist; see [GEMINI_PROVIDER.md](GEMINI_PROVIDER.md). Keep live access and A/C2 acknowledgement gates below open.

Implemented design: server-only native fetch to Google’s documented Gemini GenerateContent REST endpoint, authenticated with x-goog-api-key and explicit `store:false`. Google documents that GenerateContent does not store requests by default, and the adapter also sends the explicit setting. This avoids an unapproved package install and SDK retry multiplication. If the selected model/API requires the official SDK, request an A-owned pinned dependency change rather than installing it implicitly. The exact REST API/version and models must be capability-checked before implementation is marked live-ready; do not copy a Groq wire request to Google.

1. Recheck official Gemini REST reference, model access and selected account limits. Record the API surface, exact model IDs, date and three supported modes. Use a model listing/account check and small synthetic probe if a private key and reserved budget are available. No guessed model default or promise of free-tier access. Missing key blocks live acceptance, not scripted preparation.
2. Implement a private Gemini request/response codec in gemini.ts. Keep HTTP status/body unknown until runtime validation. Use a fixed Google origin and a validated model identifier; no caller-supplied endpoint, storage URL or API-key query string.
3. Image extraction: reuse A's PNG/JPEG byte signature guard and2MiB limit; encode authorized bytes inline. Send the versioned prompt and supported JSON mode/schema. Decode only the intended candidate/output, reject truncation/blocked output, locally validate schema and preserve null unknowns. No file upload service or OCR-generated transaction.
4. Text proposal: convert the supplied Zod schema to the selected API's supported JSON Schema subset. Validate compatibility before sending; reject unsupported conversions rather than drop financial/business validation. A's local Zod validation remains authoritative; provider schema constraints alone are insufficient.
5. Local tools: translate A's selected four tool declarations and canonical argument schemas into Google's request shape. Map function argument objects to the current normalized argument-string interface. Preserve identity and argument validation; never execute a call inside the adapter.
6. Check provider conversation continuation requirements explicitly. If the model supplies call IDs or opaque thought signatures/state, preserve the required bounded server-side continuation data. Do not synthesize a fake provider ID or discard state to force Groq's message shape. Propose the smallest provider-neutral continuation extension with A/C2 before implementation; bound/validate it, exclude it from telemetry/public errors, and test a complete call → authorized local fixture → final response round. Do not use a global process-only conversation cache to claim cloud portability. Gemini tool mode stays unavailable until its continuation contract/proof passes; image/text availability can be recorded separately.
7. Reuse the observable step5 policy: one absolute caller deadline, min20s/remaining per attempt, at most two actual requests including malformed repair, cancellable waits, safe retry timing, sanitized failures. Native fetch contributes no automatic retries; any helper must not add hidden attempts. Error status/retry metadata decoding follows actual Gemini responses, including bounded RetryInfo where documented.
8. Handle safety blocks, missing candidate/content, invalid arguments, malformed JSON and truncated output explicitly. Do not disguise blocked or absent data as an empty successful extraction. Only agreed recoverable format failures get one repair; terminal provider rejection does not loop.
9. Preserve actual usage when supplied; no fabricated request ID/usage or cross-provider token comparability claim. Do not record credentials, raw prompts, financial documents or continuation state in logs.

Acceptance: Gemini conforms to all three public modes without weakening Groq, retry/deadline/cancellation, canonical schemas or read-only behavior. Each live capability has its own real evidence. No automatic Groq→Gemini fallback: that could exceed the total attempt cap and change data destinations unexpectedly.

### I4 — verify through public interfaces (steps4–5 acceptance)

Use the existing Node runner with an injected external fetch/clock/allowance. Keep production codecs/retry logic real.

- Run the same conformance scenarios against both adapters: lazy configuration, unknown fields, malformed envelope/budget, strict canonical proposals, valid/foreign tool calls, terminal authentication/input errors, transient recovery, two-attempt exhaustion, invalid-output repair, cancellation, absolute deadline and redaction.
- Add Gemini protocol cases: inline image encoding, schema incompatibility before network, blocked/truncated/missing candidates, function argument object conversion, call identity/continuation preservation, complete readonly tool round, and oversized continuation rejection.
- Add factory cases for explicit selection, unrelated missing credential, invalid selector, no fallback after429/auth failure and safe provider provenance. Assert network request counts and original deadlines through public results.
- Keep current38 Groq regressions passing; share test scenarios only where behavior is genuinely identical. Do not replace a real adapter with a scripted business result.
- Proposed focused command once files exist: node --conditions=react-server --test --test-isolation=none tests/ai/provider.test.ts tests/ai/gemini.test.ts tests/ai/provider-conformance.test.ts. Also npm run typecheck and build with both providers' credential/model vars empty. No lint command exists; report that fact.

No present test count is evidence that Gemini works. Live probes reuse only controlled synthetic receipt/tool fixtures, require actual credentials/quota, and must not consume reserved evaluation labels or run repeated bulk calls.

### I5 — A runtime wiring and cloud context (existing A integration work)

C delivers the acknowledged three-mode factory and feature operation contracts. A1/A2 implement their own modules:

1. Authenticate via existing Clerk/Supabase ownership boundaries, fetch authorized source bytes and scoped record snapshots, then call C. No client-controlled owner/workspace trust.
2. Determine the actual hosting allowance and reserve time for validation/persistence/response. Pass one absolute deadline and abort signal into C; do not restart the deadline or blindly retry the adapter from a route.
3. Own durable account/operation reservation, cache lookup and result publication once. Preserve concurrent request/version checks and reviewed corrections.
4. Translate C failures/partial extraction into canonical route lifecycle and safe response envelopes. Existing books/sources remain available on errors; no raw model/exception/secret response.
5. Supply the four owner-scoped readonly executors for C2's assistant later; no unrestricted database/admin client handed to C.

Acceptance belongs to A's public API/auth/persistence tests, not C's adapter mocks. No fixed cloud duration is invented here. A wrappers need step6 feature outcomes to persist meaningful field proposals; provider plumbing alone is not a finished OCR route.

### I6 — continue the original steps6–8

After I1's outcome policy is adopted, implement original step6 without a replacement plan: versioned visible-field prompt, original printed text, exact A normalization helpers, unknown/ambiguous blockers, evidence/provenance, no approvals or book writes. Gemini-specific encoding remains inside its adapter.

For original step7, include provider identity along with workspace/source hash/model/prompt/schema/preprocessing versions in cache identity. Provider changes cannot serve a previous provider's output as new live inference or overwrite corrections. A owns the durable wrapper.

For original step8, run the signed-in upload→extraction→review→reload flow with A/B using the selected verified provider. Cover cache, unreadable total, timeout/429, private sources and unchanged cash totals. If demonstrating both providers, record separate runs/provenance; do not imply that two providers improve accuracy without measurement.

## 4. Order, gates and clean shipping

Recommended order: I1/I2 interface preparation → I3/I4 Gemini and provider factory → original step6 → A route/durable wiring + step7 → original step8 with B. A may prepare wrappers while C tests the adapter against the acknowledged seam; do not edit the same files concurrently. C2 can inspect published types but does not edit C1 provider files.

Gate before step6: adopted extraction/evidence policy and stable callable seam. Gate before Gemini live claim: selected model/account access, real image/schema/tool-continuation evidence. Gate before integrated completion: real A/B private persisted flow. Gemini can remain unavailable while the verified Groq lane continues; this addition must not stall the core cashbook slice.

Repository hygiene: preserve all unrelated changes and frontend references; no new app, framework, SDK, migrations or shared config by C. No keys in commits/browser output. Original PRD/Person C plan/runbook remain unchanged. Record changed files, actual commands/results and outstanding owner decisions in C1/C handoffs. Baseline merge is already pending; do not commit/push/deploy until explicitly requested. Planning checks establish document consistency only.

## 5. Official references and remaining decisions

Documentation checked10 October2026:

- [Gemini REST/JavaScript getting started](https://ai.google.dev/gemini-api/docs/generate-content): REST endpoint and header authentication; native fetch recommendation above is our project design decision.
- [Structured output](https://ai.google.dev/gemini-api/docs/structured-output): supported schema subset; local domain validation remains necessary.
- [Function calling](https://ai.google.dev/gemini-api/docs/function-calling): manual function-call protocol; exact selected API/model continuation must be checked.
- [Thinking and signatures](https://ai.google.dev/gemini-api/docs/thinking): GenerateContent may attach opaque signatures to parts. The adapter preserves bounded response parts as provider state; A/C2 acknowledgement and live round-trip proof remain pending.
- [Logging and storage](https://ai.google.dev/gemini-api/docs/logs-datasets): GenerateContent defaults to no request storage; the adapter sends `store:false`. Interactions stores by default and is not used by this stateless implementation.
- [API key management](https://ai.google.dev/gemini-api/docs/api-key): private server environment and API-key handling.

Pending decisions: exact Gemini model/API and live quota; smallest continuation extension if needed; A/C2 seam acknowledgement; A/B extraction policy adoption; actual host duration; durable cache/reservation ownership contract. Nothing in this file asserts these are already resolved. The user requested to inspect this plan first; no runtime code/configuration/dependency changes are made in this planning turn.
