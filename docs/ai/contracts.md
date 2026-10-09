# Person C step 2 — proposed shared AI contracts

**Status:** documented proposal based on the accepted PRD; A/B have not adopted the detailed shapes.  
**Executable shared-schema owner:** Person A (integrator).  
**Purpose:** align A, B and C before app code is wired. This document is not an executable schema or competing product specification. A's accepted types and helpers become canonical.

## 1. Requirements already accepted in the PRD

| Rule | PRD source | Consequence |
| --- | --- | --- |
| Imported CSV rows establish cash movement; documents are evidence | F02/F03, section 7 | OCR never creates a transaction or changes cash totals |
| Exact money, explicit currency, unknown is not zero | F02/F06 | C uses A's exact parser/formatter; never floating-point money |
| Original and corrected fields are distinct | F03 and section 7 | C returns suggestions; A persists owner corrections separately |
| AI categories/matches stay proposals | F04/F05 and section 7 | C never returns accepted; A owns review decisions |
| Match allocation is one-to-one | F05 and section 7 | C proposes; A enforces active uniqueness atomically |
| Assistant has four scoped read-only tools | F07 and section 7 | No model-supplied owner scope or mutation tool |
| Financial totals are deterministic | F06/F07 | Assistant numbers come from tools, not model calculation |
| Private evidence is owner-scoped | F01/F07 | A authorizes source access; C returns typed references, not arbitrary URLs |
| Bounded retries/tool loop, source text is untrusted | F03/F07 | Enforce in code; receipt text cannot alter instructions/tools |

## 2. Proposed common input model

These field-level examples are proposals. A must map them to its actual shared exports at bootstrap. If A chooses equivalent names, record the mapping in this document; do not define a duplicate production schema in C.

### Transaction snapshot

- Opaque transaction ID and current version.
- Validated date in the adopted unambiguous format.
- Original description and, where applicable, reviewed description as distinct values.
- Direction in/out separate from a nonnegative exact amount.
- Explicit currency, optional reference.
- Current accepted category ID/status and active accepted match ID.
- Existing source ID, source kind and CSV row locator.

**Amount proposal only:** integer minor units serialized as a decimal string. Example: "450000" plus PKR represents PKR 4,500.00. A may choose an exact decimal string or another lossless representation. One convention and shared helper must be used by import, DB, API, AI, UI, totals, tools and export. Unknown/unparseable amounts stay unresolved; never coerce to zero. Do not use JavaScript floating point for money.

### Reviewed document snapshot

- Opaque document ID, version, source ID/hash and review status.
- For merchant, document date, total, currency and reference, retain original extraction and reviewed value separately, each with its own state/source-field locator.
- Match proposals consume corrected/reviewed values and the current document version.
- PRD says merchant/date/total are extracted; currency/reference may be present; uncertain required financial fields prevent completion. It does not prescribe exact required-field policy or locale interpretation.
- Proposed match-readiness gate: unambiguous date, total and explicit or owner-confirmed currency. Missing merchant/reference stays visible and weakens evidence. This is **not accepted** until A/B confirm it. Never use upload time as printed date or silently infer a missing receipt currency from workspace currency.

### References and operation context

- Evidence reference is typed: source ID, record ID, source kind and CSV-row or document-field locator. A resolves authorization; B opens the viewer. No arbitrary URL/path in model inputs or results.
- A binds authenticated workspace, deadline/cancellation and current input snapshots outside model arguments. C receives scoped input and specific capability functions, not a privileged database client.
- Outcome metadata may include request ID, input version, model/prompt/schema/category-guide versions, duration, live/cache origin and safe warnings. No secret, private image URL, raw provider exception or prompt in public output/log.
- A owns authoritative IDs, DB persistence, decision history, durable operation reservation/cache, leases and stale-write rejection. C defines versioned cache identity. An in-memory map is not durable idempotency.

## 3. State and error distinction

PRD domain states proposed, accepted, rejected and needs_review remain separate from the provider operation lifecycle. A possible lifecycle to adopt is queued -> running -> completed/failed/cancelled. A completed extraction can contain a needs_review proposal. Provider failure is not an empty successful proposal. An imported cash transaction remains imported even when uncategorized/unmatched. C returns proposals; A records acceptance/rejection.

Suggested reason codes for A/B review: missing_field, unreadable_field, ambiguous_date, currency_unknown, currency_mismatch, amount_mismatch, multiple_candidates, insufficient_evidence, unsupported_allocation, stale_input, provider_timeout, provider_rate_limited, invalid_model_output, tool_limit_reached. A chooses the canonical enum and API error envelope. Public recovery messages are actionable; raw provider errors stay server-side and redacted.

## 4. C module's proposed public interface

Four operations hide vendor request formats and return validated outcomes. These names are descriptive, not current imports.

    extractDocument(authorizedImage, dependencies) -> ExtractionOutcome
    proposeCategories(transactionBatch, dependencies) -> CategoryBatchOutcome
    proposeMatches(reviewedDocumentAndCandidates, dependencies) -> MatchOutcome
    answerBookkeepingQuestion(scopedQuestion, dependencies) -> AssistantOutcome

Inject the provider adapter, trusted clock/deadline/cancellation, request budget, adopted schemas/exact helpers and only the authorized capabilities required for that operation. Treat raw model output as unknown until runtime parsed and semantically validated. C returns results; it does not persist/approve. A's authenticated route verifies owner, loads scoped data, invokes C, checks snapshot and persists proposals. B renders the adopted response states and invokes A's route. C must not implement A/B code.

### Outcome contract

- Extraction: merchant/date/total/currency/reference represented as observed, missing, unreadable or ambiguous; raw text and normalized value/null; reason and source-field locator; proposal/review-needed state; source/version and provider provenance. No accepted review or cash transaction mutation.
- Category batch: one proposal or explicit skip/error for each eligible supplied transaction ID/version; canonical category/uncategorized; proposal/review-needed status; concise record-grounded reason and valid references. Reject foreign/duplicate IDs; protect accepted decisions per A's policy.
- Match: reviewed document version, candidate snapshot, candidate/omitted counts and reason; candidates only from supplied IDs; exact amount/currency checks from code; date gap/reference result from code; semantic rationale and valid supporting/conflicting references. A tie has no recommendation. No tolerance, FX or inferred split payment.
- Assistant: scope/snapshot, validated answer/fact/record/template blocks, accessible references, public executed-tool trail and bounded provenance. Exact values are selected from deterministic A tool results and formatted by code. No hidden reasoning or ungrounded financial claims.

## 5. Four tool names fixed by PRD; detailed schema pending

| Tool | Bounded argument proposal | Required result |
| --- | --- | --- |
| list_transactions | Date range, category/review/match filters, cursor and capped limit | Scoped exact rows, IDs/source refs, returned/total counts and completeness |
| get_cash_summary | Date range and explicit reporting scope | Deterministic inflow/outflow/net and accepted category totals/remainder with contributing IDs/currency |
| get_review_queue | Review kind/reason, cursor and capped limit | Pending rows/reasons/refs and scoped counts/completeness |
| get_record_evidence | Capped list of transaction/document IDs | Authorized originals/corrections/decisions/locators; no arbitrary storage URL |

No tool accepts owner/workspace ID, SQL, URL/path or mutation intent. A authenticates and binds scope for every call, and checks each ID. C validates the model's allowlisted tool name/arguments/results. Use the PRD's three-round cap and the agreed bounded tool-call budget; show incomplete pages rather than claiming the complete set has been checked.

### Numeric fact registry (proposal)

An assistant numeric fact is registered from actual tool output with an opaque fact ID, value/currency or count, query scope, snapshot and source IDs. The model may select a fact ID and approved template; code renders its value. Missing aggregates or partial results require clarification/abstention. The model does not sum truncated rows. This internal C/A seam is a proposal, not an added PRD tool; A/B must agree its route/UI representation.

## 6. Idempotency, cache and stale results

- OCR identity: owner/workspace + source hash + model/prompt/schema/preprocessing versions.
- Category identity: owner/workspace + eligible input IDs/versions + guide/model/prompt/schema versions.
- Match identity: owner/workspace + reviewed document version + candidate snapshot + allocation version + model/prompt/schema versions.
- Assistant answer reuse is request-local until a snapshot-aware policy exists.
- A owns durable operation reservation/cache and validates snapshots before persistence/acceptance. Agree one reservation location (route or C wrapper) to avoid double reservation.
- Identical OCR reuse cannot overwrite corrections. Late/stale outputs are nonactionable. Cache outage is distinguishable from a miss. Failure preserves books/source.

## 7. Proposed public test seams — not yet approved

The TDD skill requires agreement on seams before implementation tests. The user's request authorizes preparation of this proposal; it is not evidence that A/B accepted it. No tests are added or run in this step.

| Public seam | It should catch | It cannot establish |
| --- | --- | --- |
| extractDocument | Unknown preservation, exact normalization, field refs, partial/error behavior | Live OCR accuracy or private-storage authorization |
| proposeCategories | Guide labels, item coverage, reasons/abstention | Independent semantic quality without blinded labels |
| proposeMatches | Compatibility, competing candidates, evidence/unsupported outcomes | Atomic DB uniqueness without A's actual approval path |
| answerBookkeepingQuestion | Tool allowlist/bounds, validated facts/refs, partial/abstention | Deployed auth/owner isolation without actual routes |
| Provider adapter | Deadline/retry/error mapping and redaction with scripted external response | Live provider accuracy |

Test through the public C operation. Replace only external systems (Groq, clock, authorized A capabilities at their seam); don't test C private helpers or over-mock C internals. Record actual accepted export paths/shape before tests use these seams.

## 8. Configuration requirements for A — pending decisions

This is the configuration handoff requested by implementation step 2. It is a **proposal for A's review**, not evidence of accepted packages, provisioned accounts or deployment settings. A owns the manifest/lockfile, shared contracts, environment template, routes and hosting configuration. C consumes A's choices; B receives safe result types only.

| Requirement | C's proposed requirement / reason | Decision and evidence A must record |
| --- | --- | --- |
| Package manager and Node runtime | One package manager/lockfile and a supported server runtime for the selected Next.js app; local tool versions in baseline.md are observations only | Chosen package manager, exact supported Node version, baseline revision and install/build commands; pending |
| Runtime package pins | Use the existing app versions of Next.js/TypeScript and Zod; add groq-sdk for server inference and server-only protection compatible with the chosen stack if not already supplied. Reuse existing Clerk/Supabase integrations; no second framework/service | Exact approved versions, canonical schema/helper exports and server-only mechanism; all pending bootstrap. C will not install or edit dependency files |
| Verification tooling | Use A's chosen test runner, lint/typecheck/build scripts; ordinary tests/build must not call Groq | Actual script names, runner/version and live-runner opt-in mechanism; pending |
| Groq secret | Proposed name GROQ_API_KEY; required only for live server/approved local-runner inference. Never NEXT_PUBLIC, committed data, public config or logs; import/build must not perform inference | Secret name and secure server runtime provisioning for local/preview/release. Record presence/status, never value; pending |
| Model configuration | Proposed server-only names GROQ_VISION_MODEL and GROQ_TEXT_MODEL. Candidate model IDs remain those in the PRD, subject to step 3's account/capability proof. Keep prompt/schema/guide versions in versioned C configuration | Accepted names/model IDs and supported request modes per model after live proof; pending. No credentials or settings are assumed from the coding agent's model access |
| Request deadline | A passes an absolute operation deadline and cancellation signal. Proposed per-provider attempt cap is 20 seconds, at most two attempts including repairs; all calls/backoff/tools must fit the single outer deadline | Actual host/route duration, end-to-end timeout and time reserved for validation/persistence/response; pending. C uses the smaller of remaining operation budget and attempt cap, never resets the outer deadline |
| Assistant/batch limits | Plan starting controls: three model rounds, four tool executions, one image per OCR request and up to ten category records per call. Input/output caps are validated server configuration, not user/model overrides | Approve or revise caps against measured latency/quota and host payload/memory constraints; image byte/dimension limit and retrieval mode pending |
| Retry and organization quota | One retry owner; SDK and application attempts share a total budget. Long 429 reset beyond the deadline returns a recoverable outcome. Serialize/persist shared-budget coordination as needed | SDK retry/timeout settings, quota coordinator and actual account limits; pending step 3. Do not multiply hidden SDK retries by application retries |
| Operation reservation placement | Recommendation: A's authenticated route wrapper owns durable reservation/cache lookup and publication; C defines identity and returns proposals. Reserve once, not in both route and module | Adopt wrapper placement or record an equivalent explicit handoff; canonical reservation/result interface and storage implementation pending |
| Durable cache and stale publication | Workspace-scoped versioned identity, atomic in-progress reservation, completed-result lookup, failure recovery, and snapshot check before publishing. Cache hit returns complete extraction, preserving separate owner corrections | Lease/expiry or recovery policy, cache-miss versus outage handling, snapshot/version tokens and atomic stale-write rejection; pending. In-memory state is insufficient across deployment instances |
| Cloud execution | Bounded synchronous work only when measured duration fits. No fire-and-forget inference after response; persisted progress/resume if required | Selected host/runtime and whether synchronous calls suffice or A supplies durable progress/queue; pending |

Before C's provider code starts, A should return a recorded baseline/contract version and the accepted package/runtime/environment decisions. Before route integration, A must also settle deadline, reservation and snapshot interfaces; B must acknowledge the result/error states. This checklist does not authorize modifying A's files or claim cloud readiness.

## 9. Adoption record

| Decision | Current evidence/status |
| --- | --- |
| PRD entity meanings, invariants, domain states and four tool names | Accepted in existing PRD sections 6–7 |
| A/B/C work lanes | Accepted in TEAM_TASKS/TEAM_WORKFLOW; paths await scaffold |
| Concrete TypeScript fields/amountMinor candidate | C proposal; no shared schema exists |
| Document required fields/date/currency policy | Open; needs A/B agreement consistent with F03 |
| Tool arguments/results/pagination | Names accepted in PRD; wire shapes pending |
| Fact registry/answer blocks | C proposal, not existing shared requirement |
| Operation/cache/snapshot interface | PRD behavior required; implementation interface pending A |
| Package pins, server environment, request deadline and reservation placement | Requirements proposed in section 8; A's accepted choices/evidence pending |
| Public test seams | C proposal, not accepted by A/B |

Do not mark C-00 contract agreement done until A's canonical schema/version/imports and decisions are recorded and B confirms the renderable states. This repository contains no app scaffold or evidence of A/B adopting the concrete proposals. No message was sent to teammates.
