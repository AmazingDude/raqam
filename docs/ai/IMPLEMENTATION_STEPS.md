# Person C — agent-ready implementation steps

**Date:** 10 October 2026, PKT. **Owner:** Person C (the user). **Status:** runbook prepared; steps not implemented.  
**Purpose:** give a coding agent enough procedure, contracts, tests and integration criteria to implement a requested numbered step without reconstructing the conversation.  
**Product authority:** [PRD](../../PRD.md). **Architecture and experience:** [Person C plan](PERSON_C_PLAN.md). **Progress:** [C handoff](handoff.md). **Ownership:** [TEAM_TASKS](../../TEAM_TASKS.md), [AGENTS](../../AGENTS.md), [team workflow](../../TEAM_WORKFLOW.md).

The numbered steps below decompose the existing C-00–C-10 tasks; they are not another product specification. If a requirement conflicts with the PRD or a newer explicitly accepted shared contract, stop the conflicting part, record the discrepancy and adapt this document. Do not silently broaden scope to make a step convenient.

## A. How to instruct the coding agent

Use this prompt, changing only the requested step numbers:

> Implement Person C steps 1 and 2 from `docs/ai/IMPLEMENTATION_STEPS.md`. First read AGENTS.md, PRD.md, TEAM_TASKS.md, docs/ai/PERSON_C_PLAN.md and docs/ai/handoff.md. Inspect the actual repository and accepted contracts. Complete only the requested steps and their authorized verification; do not implement A/B modules or later steps. Cross-check the result against the PRD, the plan and each step's acceptance criteria. Preserve existing changes and all frontend reference/archive files. Update C's handoff with files, checks, results, dependencies and the next ready step. If a prerequisite is missing, complete independent work and report the precise blocker; do not fake passing integration. Do not commit, push or deploy unless I request it.

“Implement step 8” means integrate/check C's OCR with A/B's existing code, not take over their unfinished modules. “Implement steps 4 and 5” authorizes C's adapter and its failure checks, not dependency/configuration changes assigned to A. A handoff or user instruction can explicitly transfer a file; record that transfer before editing.

### Every step uses this execution protocol

1. Read the current C handoff and the requested step. Check prerequisite statuses against actual files/evidence, not labels alone.
2. Inspect `git status --short`, the current branch/revision and the applicable instructions. Identify unrelated dirty files and preserve them. No destructive reset, broad checkout, cleanup or blanket staging.
3. State requested steps, planned C-owned files and required A/B inputs. Record `in_progress` in C's handoff; don't rewrite shared summary/board rows.
4. Read the named skills and their task-relevant supporting references. Use current provider documentation when APIs/model capabilities need verification; record the pinned versions actually used.
5. Implement one vertical behavior at a time. For meaningful financial/agent invariants, write a failing public-interface test, make it pass, then proceed to the next behavior. Do not write implementation-mirroring tests or bulk imaginary tests.
6. Validate inputs and provider/tool results at runtime, even where TypeScript types compile. Keep model output as `unknown` until parsed and checked.
7. Run focused checks using the project's actual configured commands; run type/lint/build when the step changes runtime code and those checks exist. Do not install a second test runner to avoid a failing existing one.
8. Inspect the final diff for scope, accidental secrets, unsupported defaults, ownership violations and plan drift. Compare acceptance items one by one.
9. Mark module checks and joint integration checks separately. Use `in_review` until the required reviewer/integrated criteria pass; record `blocked` with exact missing input where applicable.
10. Update C's handoff and append a short C-only root handoff entry after completed work. Report outcome, files, checks/limitations and next step. No automatic publication/deployment.

### Review record per completed step

Record: step + C/RQ/F IDs; baseline and final revision if committed; contract/model/prompt/guide versions; changed files; checks and exact outcomes; live versus scripted provider; development versus reserved data; A/B integration dependency and reviewer; known limitations; next ready step. A check not run is explicitly `not run`, never passed.

### Skill use

- Planning/consistency: `spec-kit-planning`; interface depth: `codebase-design`.
- Framework reconsideration: `ecosystem-primer` first, then applicable agent skill. Current runtime stays Groq SDK; no framework installation implied.
- Provider/output validation: `typescript-pro` with type-guards reference, `secure-code-guardian` with input-validation reference, `langchain-middleware` concepts.
- Behavior checks: `tdd`, including `tests.md` and `mocking.md`; agreed public seams below catch real errors.
- A's route agreement: `api-designer` principles within Raqam's applicability rules. B's screen coordination: `frontend-craft`; no C editing of B's screens.
- Integrated browser checks: `playwright`; actual implemented diff review: `code-review` when invoked, following that skill's review workflow.
- Continuation: `handoff`, saved repo-locally because the user requested it.

## B. Stable step map and dependencies

| Step | Deliverable | Existing task | Required predecessors / external input |
| --- | --- | --- | --- |
| 1 | Inspect baseline, isolate C lane, record runnable commands | C-00 / RQ-00 | None; inspect repository |
| 2 | Agree concrete contracts and public test seams | C-00 / RQ-00 | 1; A/B adoption |
| 3 | Prove live vision/schema/tool capabilities | C-01 / RQ-02 | Secure Groq access; can overlap 2 using C-local synthetic data |
| 4 | Server-only provider adapter and validated configuration | C-02 | 2, 3; A-approved dependencies/runtime |
| 5 | Enforce failures, retry/deadline budget and telemetry | C-02 | 4 |
| 6 | Receipt extraction and exact field proposals | C-03 / RQ-05 | 2, 4, 5; exact helpers |
| 7 | OCR cache identity and stale-result behavior | C-03 | 6; A's durable operation/cache interface |
| 8 | Integrated receipt review acceptance | C-03 / RQ-05 | 6, 7; A upload/persistence and B review screen |
| 9 | Category proposal engine | C-04 / RQ-06 | 2, 4, 5; validated transactions/guide |
| 10 | Integrated category decision/rerun checks | C-04 | 9; A review backend and B controls |
| 11 | Deterministic match candidate preparation | C-05 / RQ-07 | 8; reviewed document/transaction snapshots |
| 12 | Semantic match ranking and ambiguity handling | C-05 | 11; 4, 5 |
| 13 | Integrated match review/concurrency acceptance | C-05 | 12; A atomic approvals and B candidate UI |
| 14 | Four scoped tool adapters and verified fact registry | C-06 / RQ-08 | 2; A's four actual scoped read functions |
| 15 | Bounded assistant investigation loop | C-06 | 4, 5, 14 |
| 16 | Grounded answer blocks and evidence validation | C-06 | 14, 15 |
| 17 | Integrated assistant and end-to-end journey | C-07 / RQ-05–09 | 8, 10, 13, 16; A/B core and deployed candidate |
| 18 | Cross-cutting AI security/failure acceptance | C-07/C-08 / RQ-10 | Runtime features; A/B access/persistence checks |
| 19 | Independent reserved live evaluation | C-08 / RQ-10 | 17, 18; frozen versions and A/B gold labels |
| 20 | Clean shipping handoff, cloud smoke and demo evidence | C-09/C-10 / RQ-10–12 | 19; A's release/deployment + B's demo |

Follow the original 15-hour budget plus <=2-hour repair buffer in plan section 12. These finer steps split that budget; they do not add twenty new hour-long tasks. Steps 9 and 14 may progress while OCR UI integration is pending if their inputs are agreed. Successful isolated modules do not establish full core completion.

## C. Coding contract details to adopt in step 2

Names below are a **concrete proposal**. A owns the actual shared schema files. If A's accepted contract uses equivalent different names, record the import mapping in `docs/ai/contracts.md` and use it; do not create duplicate competing production types. Until adopted, contract-dependent steps remain pending, while C-local feasibility can proceed.

### Canonical input records

| Shape | Required fields / invariant |
| --- | --- |
| Transaction snapshot | `id`, `version`, `date` (validated YYYY-MM-DD), `description`, `direction`, exact `amountMinor` string, `currency`, nullable reference, accepted category and review status, active accepted match, CSV source locator |
| Reviewed document snapshot | `id`, `version`, source/hash, original extraction, reviewed values, explicit required-field review status, active match; matching uses corrected reviewed values |
| Evidence locator | Source ID + authorized record ID + source kind; CSV uses row locator, document uses field locator; never an arbitrary URL |
| Operation context | Request ID, trusted workspace context, input snapshot, absolute deadline, AbortSignal, configured versions; not constructed from model arguments |
| Exact helper | Accepted parsing/formatting/comparison helpers from A; normalization returns valid exact value or an explicit issue, never guessed zero |

JSON money example: `"450000"` minor units with `currency: "PKR"` means PKR 4,500.00. Nonnegative value plus separate direction. String constraints/range follow A's exact parser; BigInt stays internal and is serialized as a string. The illustrative fixture's net may be signed; transaction amounts remain nonnegative. A decimal-string alternative is valid if equally exact and used consistently everywhere.

### C's proposed callable surface

```text
extractDocument(input: AuthorizedImageInput, deps: ExtractionDependencies)
  -> Promise<ExtractionOutcome>
proposeCategories(input: CategoryBatchInput, deps: ProposalDependencies)
  -> Promise<CategoryBatchOutcome>
proposeMatches(input: ReviewedMatchInput, deps: ProposalDependencies)
  -> Promise<MatchOutcome>
answerBookkeepingQuestion(input: ScopedQuestionInput, deps: AssistantDependencies)
  -> Promise<AssistantOutcome>
```

Dependencies include the provider interface, validators/exact helpers, request budget/clock and authorized external operations as needed. Cache/operation reservation can be wrapped by A rather than exposed to every model function. Choose one orchestration placement in step 2; do not reserve the same operation both in route and C. No C function receives an unrestricted Supabase admin client.

### Proposed provider interface

Three explicit operations: image extraction request; text proposal request; local-tool conversation request. Request includes model/settings, schema or tool mode, deadline/signal and version metadata. Return a typed envelope containing raw output as unknown, actual duration/usage when available and safe provider request identity. A scripted test adapter replaces the external provider at this seam; internal C functions remain real.

Do not require every provider mode to have the same output parser. Tool calls carry provider call IDs and argument strings; structured proposals carry JSON objects. Schema output and tool use are separate verified request modes.

### Extraction outcome

Each field has `rawText` (string/null), `normalizedValue` (string/null), `state` (`observed`, `missing`, `unreadable`, `ambiguous`), issue codes and document-field evidence locator. Include merchant, date, total, currency and reference. Required review fields come from A's adopted policy. Outcome includes source identity/version, `proposed` or `needs_review`, blockers/warnings and provenance. C cannot return `accepted`.

### Category outcome

One item per requested eligible record: transaction ID/version, category ID from the agreed guide or uncategorized, `proposed`/`needs_review`, short rationale, evidence refs and guide/model/prompt versions. Invalid batch structure yields an explicit invalid/partial result; absent items do not disappear. Accepted decisions are skipped with a separately reported skip reason when policy permits, not re-proposed silently.

### Match outcome

Document ID/version, candidate snapshot, full eligible count, displayed/omitted counts, outcome reason, candidate list and optional recommendation ID. Per candidate: transaction ID/version, exact compatibility booleans, date gap from validated code, reference agreement/conflict state, semantic rationale, supporting and conflicting refs. Recommendation ID must be among supplied compatible candidates; a tie or missing corroboration has no recommendation. All remain user-review proposals.

### Assistant fact and answer contract

A tool-result fact becomes a server-registered `factId` tied to tool-call ID, snapshot, filter scope, type (`money`, `count`, `date`, `text`), exact value/currency and source references. Fact IDs are opaque identifiers, not arithmetic formulas. Numeric facts are registered only from A's deterministic results or an explicitly agreed exact helper on complete scoped records.

Final answer blocks should be constrained:

- `fact`: fact ID + allowed label/template ID. Code obtains/formats value from the registry.
- `records`: record IDs returned by tools + allowed heading ID; names/amounts come from verified records.
- `explanation`: approved template ID + existing evidence references; template wording explains pending, ambiguous, missing-data or scope status.
- `notice`: approved partial/stale/out-of-scope/limit template; no invented business claim.

Core defaults avoid unrestricted financially assertive model prose. If free prose is later added, it needs a validation strategy beyond checking that citations exist; a correct citation can still support an incorrect sentence. Source-backed quotation/templates are the reliable first implementation.

Assistant outcome includes answer scope/snapshot, status (`answered`, `partial`, `needs_clarification`, `unavailable` under A's adopted enum), validated blocks, source refs, public trace and actual model/request metadata. B renders all text safely and resolves source locators via A. Record IDs, URLs and transaction references in prose do not authorize data access.

### Operation/cache interface requested from A

Agree atomic reservation and completed-result lookup, success/failure recording and input-version validation. Stable identity includes workspace/content/input versions and processing versions. Distinguish cache miss from cache outage. A owns durable state, leases/expiry or another safe recovery policy. C cannot mark success or approval from a stale input. Reuse extraction fields without replacing separately persisted corrections. Background progress/polling needs A's actual host-compatible implementation.

### Agreed public test seams

| Seam | C checks | It does not establish |
| --- | --- | --- |
| Extraction operation | Unknown preservation, semantic normalization, valid source refs, error outcome | Actual OCR accuracy without live images; private storage isolation |
| Category operation | Guide-valid proposals, ID integrity, abstention and rerun behavior | Independent semantic correctness without labeled live evaluation |
| Match operation | Compatibility, competing candidates, evidence and unsupported outcomes | Atomic approval/uniqueness without A's real backend |
| Assistant operation | Tool allowlist/bounds, facts/citations, partial/abstention behavior | Deployed auth/tool ownership without A's integration checks |
| External provider seam | Request-budget/deadline/failure behavior | App-wide persistence or live provider reliability from scripted tests |

Record explicit adoption of these seams in step 2 before applying the TDD skill. If the user/team has already approved equivalent interfaces, preserve that approval rather than ask again. No tests are written during this planning session.

## Step 1 — establish the real baseline and clean C workspace

**Read:** AGENTS, TEAM_TASKS, PRD sections 4/7/8, plan sections 3/12/13. **Skills:** spec-kit-planning, codebase-design. **Allowed changes:** `docs/ai/baseline.md`, C handoff. No application bootstrap.

1. Locate the actual Raqam checkout from the Git remote, not a similarly named parent folder. Record branch, HEAD, origin and dirty filenames. Do not run an automatic pull that could mix incomplete team changes.
2. Inventory application files with `rg --files`, excluding archived references. Inspect existing package manifest/lockfile, TypeScript settings, test setup and deployment settings if present. At this writing, the repo has planning/reference files and no app scaffold.
3. Record actual package manager, pinned Node/package versions, server runtime, import alias and exact commands for focused tests, typecheck, lint and production build. Missing items stay missing; do not invent `npm test` success.
4. Identify A-owned schema/helper/route paths and B's client contracts. Request the baseline if unavailable; C can record contracts/feasibility requirements without building A's scaffold.
5. Agree a C branch or separate checkout based on A's baseline. Never transfer all current dirty docs automatically. List existing unrelated modifications and keep them intact.
6. Create one short baseline record with observed revision, available commands, path map, external dependencies and blockers. Exclude credentials/machine-specific config.

**Acceptance:** actual baseline and ownership documented; no unauthorized A/B edits, dependency install, stash/drop, deleted files or claim of implementation. **Blocked path:** absent scaffold blocks runtime coding, not documentation and standalone feasibility design. **Cross-check:** baseline reflects the repo rather than the prior plan's proposed paths.

## Step 2 — adopt the contracts and integration examples

**Read:** plan section 4, runbook section C, PRD section 7/F03–F07. **Skills:** codebase-design, TypeScript, API designer where useful; TDD seam requirements. **Allowed changes:** `docs/ai/contracts.md`, `docs/ai/examples.md`, C handoff. A edits actual shared schema files.

1. Resolve each proposed shape to A's accepted exported types/helper imports. Record schema version, exact import paths and a compact compatibility table. Don't leave a production-facing type import as a placeholder.
2. Explicitly settle money serialization, date interpretation, required document review fields, source locator shape, lifecycle/business status separation and accepted-decision protection.
3. Freeze the four public operations and injected capabilities. Agree whether A's wrapper or C orchestrates operation reservation/cache; persistence remains A's implementation.
4. Agree tool argument caps/filter semantics, pagination/completeness, fact keys and snapshot checking. Tool arguments cannot supply trusted owner identity.
5. Provide clean, unknown-field, ambiguous-match, provider-error, cached and stale JSON examples using synthetic values. B confirms these support editable review/source/assistant states.
6. Give A a requirements list for package pins, server-only environment values, request deadline and operation reservation. Obtain actual accepted choices rather than edit its files.
7. Record public test seams and prior/new explicit approval. Copy no reserved labels into examples.

**Acceptance:** all production-needed decisions have an accepted version/import map; B's minimum render states are covered. If A/B adoption is absent, contract preparation is complete but the agreement step stays `in_review`/`blocked`. **Cross-check:** no type/state/API shape contradicts PRD; no duplicate schema in C becomes a second source of truth.

## Step 3 — prove actual Groq capabilities before breadth

**Read:** plan section 5, PRD RQ-02 acceptance. **Skills:** ecosystem-primer and applicable agent fundamentals/middleware concepts; current official Groq docs. **Allowed changes:** `tests/ai/live/feasibility.ts` (or agreed runner path), development-only synthetic inputs, `docs/ai/feasibility.md`.

1. Use A-approved runtime/dependencies if available. If not, request the minimal approved runner setup; do not create a second manifest/service. Live access is server/local runner only.
2. Validate that a key is supplied through the agreed secure environment without printing its value. Inspect account-visible model permissions/limits; record only nonsecret settings.
3. Run three fresh English printed image inputs: clean; changed layout; unreadable required total. Use PRD vision candidate after verifying documentation/account access. Preserve the raw source for independent comparison.
4. Validate extracted fields and unknowns. Record source ID, model, request mode/settings, prompt/schema version, duration and error type. Do not score yourself as an independent evaluator.
5. Separately test schema output for a text proposal and local tool calling with one harmless read-only fixture tool. The tool/schema modes remain separate.
6. Record working supported modes and proposed image/batch/time limits for A/B. Exit nonzero on failed live proof; output a failure record rather than a canned extraction.
7. Coordinate quota usage and reserve later evaluation/demo capacity. Never loop until success without a cap.

**Acceptance:** actual image and tool/schema evidence exists, including unresolved-field behavior. Missing credentials/capability blocks the live gate; scripted output cannot pass it. **Cross-check:** candidate model IDs are configurable, no silent provider switch, no unsupported-image promises.

## Step 4 — implement the server-only provider and configuration module

**Read:** plan sections 3/5, accepted contracts. **Skills:** TypeScript, codebase-design, secure-code-guardian. **Files:** `src/lib/ai/provider.ts`, `config.ts`, `index.ts` when ready; provider public-interface tests.

1. Import adopted shared types; keep provider transport/internal model parsing private. Export only the agreed callable interface, not a Groq client usable by B.
2. Add a server-only protection compatible with A's pinned Next.js/test setup. Avoid a barrel file that mixes server provider code into client imports. B uses shared safe types from A instead.
3. Load/validate required server settings lazily when server work runs. Application build/typecheck must not contact Groq or require real credentials merely to import a module. Missing runtime settings produce a safe configuration error.
4. Configure vision/text model IDs, prompt/schema versions, allowed mode/settings, per-operation limits and the agreed key name. Do not prefix secrets with `NEXT_PUBLIC_` or expose values through `next.config` public configuration.
5. Implement the three explicit provider operations from section C. Respect requested modes and return raw output as unknown with safe metadata for the operation parser.
6. Inject provider/clock/budget at external seams. The production adapter uses Groq; tests replace the external provider, not internal C logic.
7. Use actual installed SDK types; verify options against pinned version. Send no image/storage URL in public error metadata.

**Acceptance:** public interface compiles, a scripted request returns the envelope and secrets cannot enter client output. No import-time inference or extra service/framework. **Cross-check:** only approved package/runtime imports; A's lockfile unchanged by C.

## Step 5 — make failures, deadlines and retries bounded

**Read:** plan section 5 and risk table; provider seam. **Skills:** TDD, secure-code-guardian. **Files:** provider/config changes; `tests/ai/provider.test.ts`; optional small private budget helper.

1. Choose one retry owner. Verify the SDK's default retry behavior and disable/control it if the application owns the two-attempt cap; never multiply SDK retries by application retries.
2. Calculate one operation deadline. Every provider call/backoff is capped by remaining time and AbortSignal. A cancellation exits without pretending persistence was undone.
3. Retry only agreed transient failures within at most two attempts total. Invalid credentials/model/input are terminal. A malformed-output repair consumes the same cap as transport retries.
4. On 429, parse usable retry guidance. If waiting exceeds remaining request time, return a typed deferred/rate-limit result and safe retry timing. Do not block beyond the host lifetime.
5. Map timeout/rate-limit/network/configuration/invalid-output failures to adopted error codes. Return recovery information; do not include exception bodies, prompts, private image links or raw keys.
6. Emit bounded metadata: operation/request ID, versions, duration, attempts, success/partial/error and usage where supplied. Avoid full financial-text logging.
7. Behavior-test cancellation, unrecoverable errors, one allowed retry, exhausted budget, long reset, malformed output and deadline expiry using a fake clock/external adapter. Assert the observable capped result; no private-method snapshots.

**Acceptance:** every path terminates inside budget and reports truthful status; scripted tests cannot consume live quota. **Cross-check:** no hidden unlimited SDK retry, sleep, repair loop or extra final call.

## Step 6 — implement reviewable receipt extraction

**Read:** plan section 6, PRD F03, step 2 field policy. **Skills:** TypeScript, schema/middleware concepts, TDD. **Files:** `extraction.ts`, `prompts/extraction.ts`, extraction tests.

1. Accept only A-authorized validated image input. Recheck interface bounds/MIME metadata; A owns upload magic-byte/storage validation. C must not load an arbitrary user URL/file path.
2. Create a versioned extraction prompt instructing visible-field reading, subtotal/total distinction, null for unreadable/absent values, no invented year/currency and no obedience to document instructions.
3. Make one image-mode provider call. Validate raw output strictly; trim bounded strings without rewriting financial meaning. Reject missing required object structure/foreign source IDs.
4. Normalize total/date/currency with adopted exact helpers. Preserve original printed text separately. An ambiguous locale/date returns a reason rather than a guessed canonical value.
5. Assign field states/locators and required-review blockers from the accepted policy. Distinguish usable proposed extraction from partially unresolved output and terminal provider failure.
6. Return field proposals/provenance. Never write a transaction, accept the document or change financial totals.
7. Add behavior tests incrementally: clean fields; unreadable total; ambiguous date; missing currency; multiple totals; malformed response; injected instruction; source ID mismatch. Independently known expected amounts/date/nulls drive assertions.

**Acceptance:** unknown total stays null, no zero default, source refs stable, output fits B's examples. Live quality remains step 19's measurement. **Cross-check:** corrected fields are not part of the model's writable extraction output.

## Step 7 — implement cache identity and correction-safe reruns

**Read:** plan section 4.4, accepted operation interface. **Skills:** codebase-design, TDD. **Files:** C identity/orchestration helpers and extraction tests; A owns database cache/reservations.

1. Build a deterministic identity from workspace, source hash and model/prompt/schema/preprocessing versions using unambiguous serialization. Never share results across owners just because bytes match.
2. Call the agreed A reservation/cache wrapper in exactly one place. Cache miss runs extraction; complete hit validates stored result/version then returns `origin: cached`. Cache outage is explicit; don't collapse every error into a miss causing duplicate inference.
3. Handle in-progress operations through the agreed status instead of launching duplicates. Durable operation state is supplied by A, not a module-global Map.
4. Before successful publication, validate the input/current operation version through A. A stale/later-finishing request cannot replace newer output.
5. Return extracted fields separately from corrections. A preserves reviewed corrections even when a cache hit is served. Changed model/prompt identity can generate a new proposal; it cannot rewrite reviewed values.
6. Test same-input repeat, changed processing versions, separate owner, stale completion and correction preservation through the public operation/reservation interface.

**Acceptance:** no repeated completed OCR on identical identity; no reviewed-field overwrite; actual durable deduplication tested with A at step 8. **Cross-check:** never label process-local deduplication as cross-instance safety.

## Step 8 — prove the integrated receipt review slice

**Read:** plan section 10.1, PRD F01/F03. **Skills:** Playwright with B; TDD for C regressions. **Files:** C fixes/tests and `docs/ai/integration.md`; A/B retain route/UI ownership.

1. Confirm A's deployed upload/extraction/result/review paths and B's source/field screen exist. Record route contracts, environment and candidate revision; no direct browser key or Groq call.
2. Upload a fresh supported synthetic receipt through the signed-in UI. Confirm actual live/cached origin and source ID; source viewing stays private.
3. Inspect field proposals beside the source. Correct one field and confirm required fields; reload. Check A's persisted corrected values and review history through the app's public flow.
4. Reupload/retry identical content. Verify reused output without duplicate evidence or reverted corrections. Record actual cache status and provider work if observable safely.
5. Use unreadable-total input; required completion remains blocked and recovery is visible. Trigger scripted provider timeout/429 in the test environment; existing books/source remain available.
6. Compare transaction count/exact cash totals before and after receipt operations. They remain unchanged. A supplies the authoritative before/after values.
7. Ask A/B for fixes in their modules; fix C-owned defects only. Record proof procedures/screenshots with synthetic data and no credentials/private links.

**Acceptance:** upload -> live extraction -> review/correction -> persistent reload works; unknowns/cache/failures preserve books. No passing status if only mocks work. **Cross-check:** field and lifecycle UI agree with actual C statuses, not a hardcoded successful example.

## Step 9 — implement category proposals

**Read:** plan section 7, PRD F04/F06, accepted guide. **Skills:** TypeScript, TDD. **Files:** `categories.ts`, `prompts/categories.ts`, category tests; optional guide file under C if A agrees guide ownership.

1. Import the accepted canonical category IDs/version. Preserve all seven PRD labels; don't add tax/accounting classifications or a new chart of accounts.
2. Validate input transactions and cap batch size. Separate accepted-category records and report skipped decisions according to policy; routine runs only propose eligible records.
3. Prompt with immutable supplied IDs, exact descriptors/direction, category definitions/counterexamples and authorized reviewed evidence if supplied. A transfer/debit/credit alone does not determine purpose.
4. Request verified text schema mode. Parse unknown output and check guide membership, input ID membership, duplicate IDs, per-record coverage and evidence membership.
5. Ambiguous purpose yields uncategorized/needs-review with a concise reason. No confidence percentage substitutes for accepted review.
6. Return per-record proposals and provenance; A stores them. Do not mutate accepted categories or summaries inside C.
7. Add tests for explicit service/software/travel/utilities; owner movement; unclear transfer; unrelated merchant; invalid category; missing/foreign/duplicate ID; accepted-category skip. Batch truncation cannot silently drop records.

**Acceptance:** eligible records have a proposal or explicit unresolved outcome; guide and reviewed decisions remain intact. **Cross-check:** output reason is specific to supplied data and does not invent a vendor, invoice or economic purpose.

## Step 10 — verify category review and reruns with A/B

**Read:** plan sections 7/10.2, PRD F04/F06/F08. **Skills:** Playwright and focused C regression tests. **Files:** C fixes, integration evidence, handoff.

1. Run real category preparation from B's action through A's authenticated route. Compare displayed IDs/values/status to C output.
2. Accept one category, change another and reject one. Reload and verify decisions persist through the public app.
3. Rerun AI on the same records. Confirm accepted values are not replaced by a new suggestion. Change an underlying reviewed description and confirm new proposal input versions are explicit.
4. Compare A's cash inflow/outflow/net before/after review; unchanged. Reviewed-category totals/remainder change consistently and reconcile to the same cash totals.
5. Attempt a malformed/foreign-ID result in the test path; A/C reject it and B shows recovery rather than a hidden missing row.
6. Ensure deliberate batch acceptance only happens after proposals are visible. B owns those controls; C supplies eligibility/status.

**Acceptance:** persisted decision/rerun/remainder behavior works jointly. **Cross-check:** pending proposals are absent from accepted-category reporting and assistant accepted-category filters.

## Step 11 — implement deterministic matching candidates

**Read:** plan section 8, PRD F05, adopted reviewed-field policy. **Skills:** codebase-design, TypeScript, TDD. **Files:** `matching.ts` preparation functions and matching tests.

1. Validate reviewed document/transaction snapshots and active allocation state. Missing required reviewed financial fields returns a blocked review outcome without semantic inference.
2. Normalize comparisons through A's exact helpers. Exact currency/amount compatibility is a prerequisite for ordinary supported candidates. No inferred FX, tolerance, rounding, split allocation or settlement status.
3. Examine the full supplied capped transaction pool. Exclude active allocations; preserve legitimate equal-valued distinct records. Candidate IDs must remain original IDs.
4. Calculate date gap and reference comparison in code. Date is a ranking feature, not an undocumented hard cutoff. Don't merge merchant normalization with numeric/date validation.
5. Record candidate counts, snapshot and deterministic features. Zero compatible records gets an explicit reason; differing currency/amount or possible split stays unresolved/unsupported.
6. Test equal amounts, different direction context, missing currency/date, exact mismatch, all allocated candidates, delayed settlement dates and no candidates. Do not infer cash direction solely from “invoice” versus “receipt.”

**Acceptance:** compatibility is exact and reproducible; no plausible gold candidate silently excluded by arbitrary dates. **Cross-check:** downstream semantic ranking cannot resurrect incompatible or already allocated candidates.

## Step 12 — implement semantic ranking and explicit ambiguity

**Read:** plan sections 8/10.3. **Skills:** schema/middleware concepts, TypeScript, TDD. **Files:** matching module/prompt and tests.

1. Send only compatible authorized candidates to the text model with document context, validated comparison features, immutable IDs and instructions to expose uncertainty/contradictions.
2. Ask for candidate-specific semantic relation, supporting/conflicting evidence and a recommendation only when corroboration distinguishes a candidate. Never describe the recommendation as confirmed.
3. Parse schema, validate every ID/ref against input, reapply deterministic compatibility and ensure recommendation belongs to the returned supported candidates.
4. Require meaningful corroboration beyond amount. When a model rationale claims reference equality, verify it from code. Model descriptions cannot overwrite conflict flags.
5. Preserve all plausible competitors before choosing display top three. Return omitted/count flags; no artificial uniqueness caused by display truncation.
6. If tied/weak/contradictory, return needs-review with no recommendation. If strongest, return a proposal plus remaining concerns and alternatives. Persist/approve nowhere in C.
7. Test merchant alias with exact reference, amount-only false match, two plausible candidates, contradiction, model foreign ID and stale input. Live semantic performance is separately scored in step 19.

**Acceptance:** evidence explains candidate strength and ambiguity stays unresolved. **Cross-check:** no unmeasured probability or fraud/nonpayment assertion, and no model-generated evidence locator is trusted without membership checks.

## Step 13 — verify atomic match review integration

**Read:** PRD F05/F08, plan section 8. **Skills:** Playwright with B; A's deterministic/concurrency checks. **Files:** C fixes/tests and integration evidence.

1. Through B's candidate comparison, inspect amount/reference/date evidence and open both CSV/document sources.
2. Confirm a supported semantic match via A. Reload and verify one accepted relationship, persistent decision history and unchanged cash totals.
3. Reject a recommendation; choose another only through A's valid review operation. Rerun preserves accepted allocation; corrections invalidate old proposals.
4. Change a reviewed document value while a proposal runs. Old snapshot cannot appear newly actionable or be accepted as current.
5. A tests concurrent confirmations for the same transaction/document and invalid cross-owner IDs. C records A's actual evidence; a scripted candidate exclusion is not a database race test.
6. Show a tied case and unsupported split/currency mismatch. B displays the reason and leaves it unresolved; no automatic allocation or duplicate-payment accusation.

**Acceptance:** proposal -> review -> atomic persisted match works; zero double allocations in A's check. **Cross-check:** accepted matches and pending match proposals remain separate in tools/export/UI.

## Step 14 — implement scoped tool dispatch and the fact registry

**Read:** PRD F07/tool contract, plan section 9, section C here. **Skills:** secure-code-guardian, TypeScript, codebase-design, TDD. **Files:** `tools.ts`, `answer.ts` registry portion, tool/assistant tests.

1. Import A's adopted tool schemas and bound implementations. Register exactly `list_transactions`, `get_cash_summary`, `get_review_queue`, `get_record_evidence` with clear use descriptions.
2. Validate unknown name/JSON argument payload before execution. Enforce bounded IDs/date range/filters/cursors/limits and reject extra ownership/SQL/path/URL arguments. Owner context is closed over by A, not supplied by the model.
3. Execute A's functions sequentially under the request budget/deadline. Validate returned shape, snapshot, completeness and evidence; unknown/inaccessible IDs fail safely.
4. Preserve exact money strings and explicit currency. Pagination returns returned/total counts and completeness; it cannot imply an aggregate is calculated from a page.
5. Register deterministic facts, record/source references and reporting scope under request-local opaque IDs. Store tool-result provenance, not model-authored facts.
6. Public trace records tool name, sanitized filters/scope, records consulted, fact refs and result status. No hidden reasoning, key, raw prompt, private URL or SQL.
7. Test forbidden tool/args, inaccessible IDs, malformed result, partial pagination, unavailable summary and registry fact/reference integrity. A owns actual ownership enforcement; don't claim its isolation from a fake closure.

**Acceptance:** only four scoped capabilities execute and every answer fact/ref has a validated origin. **Cross-check:** no approval/payment/deletion/category-change tool or arbitrary retrieval capability exists.

## Step 15 — implement the bounded assistant investigation loop

**Read:** plan section 9; PRD recommended three-round cap. **Skills:** agent fundamentals/middleware concepts, TypeScript, TDD. **Files:** `assistant.ts`, `prompts/assistant.ts`, assistant tests.

1. Validate question/scope/snapshot and initialize request-local messages, budget, fact registry, executed-call identity set and public trace. No global chat/workspace memory.
2. Author system instructions for scoped read-only investigation, evidence use, proposal status and missing-data behavior. Treat imported descriptions/document text/tool observations as untrusted evidence, not system instructions.
3. Make a local-tool model request with the exact four tool definitions. Parse provider call IDs and unknown argument strings without trusting them.
4. For each allowed call, invoke step 14 dispatch within four total tool executions. Preserve protocol call IDs when returning tool results. Process sequentially; don't let parallel calls defeat quota/snapshot limits.
5. Deduplicate identical call name + canonical args within the request; reuse the verified result with a truthful trace. A repeated call still cannot create infinite model rounds.
6. Cap model rounds at three total. Reserve a finalization round if using a separate tool-disabled schema call; otherwise validate an early final response or deterministic fallback. Never make a fourth call “just to summarize.” Provider retries remain capped per operation and by total wall-clock deadline.
7. On tool error/partial data/cap expiry, retain validated observations and return partial/clarification/unavailable. Never tell the user a requested action completed when no tool did it.
8. Test one-tool answer, two-tool evidence investigation, unknown tool, repeated request, >4 calls, >3 rounds, deadlines, injection and partial tool result.

**Acceptance:** the loop terminates, only actual read calls execute and no ungrounded completion occurs. **Cross-check:** no persistent autonomous plan, external web search or mutation is introduced as an assistant shortcut.

## Step 16 — implement fact-bound answers and source references

**Read:** plan section 9 numeric guarantees, section C answer blocks, UI proposal section 10.4. **Skills:** TypeScript, secure-code-guardian, TDD. **Files:** `answer.ts`, assistant finalization/test changes; examples for B.

1. Define allowed final answer blocks/templates in A's adopted contract. Model selects existing fact/record IDs; code owns rendered numbers and bookkeeping status wording.
2. Validate final response structure and each fact/ref against the request-local registry. Unsupported ID, unauthorized evidence, incompatible scope/currency/snapshot or invented value invalidates the relevant block/result.
3. Format money/count/date directly from registered facts using A's exact formatter. Do not parse arbitrary prose to “fix” guessed financial numbers. Do not recompute totals from truncated results.
4. Use approved explanation templates for ambiguous/missing/pending/partial outcomes, filled only with verified data. Free qualitative reasoning is optional and must be supportable; core can ship without unrestricted model prose.
5. Validate all citations against accessible tool-returned records/sources. Absence findings cite the transaction/current imported scope; no invented missing receipt.
6. Include reporting scope, snapshot/version, live/cache metadata and actual public action trail. Pending category/match statuses remain pending in wording.
7. Support schema finalization only as a separate tool-disabled request within the three-round budget. If no round remains or JSON is invalid, deterministic fact blocks/clarification are the fallback.
8. Test fabricated amount, fabricated count, correct number with wrong scope, unsupported citation, proposal mislabel, truncated list and valid summary/review answers. Provide B examples for answered/partial/unavailable/source-open states.

**Acceptance:** displayed financial values are exclusively verified facts and unsupported claims cannot pass merely by including a citation. **Cross-check:** no hidden thoughts, dangerous HTML, arbitrary generated links, profit/fraud/tax claims or invented balance.

## Step 17 — verify the assistant and complete product journey

**Read:** PRD F01–F08, plan sections 9/10/11. **Skills:** Playwright with B. **Files:** C fixes and integration evidence; A/B own routes/screens/export.

1. Confirm B's question/answer/evidence UI consumes adopted blocks; A's route resolves workspace and current snapshot before invoking C.
2. Ask a scoped summary question, accepted-category question, unresolved receipt question and evidence lookup. Compare visible numbers to A's exact source data and open references through the real authorized viewer.
3. Ask for unavailable balance/profit/tax/payment/mutation. Response gives supported scope/next action without a fabricated answer or action.
4. Test a paginated/incomplete query and changed data snapshot. UI says partial/stale as applicable, not “all records checked.” Resolve relative date wording visibly from agreed timezone/range.
5. Run the complete signed-in flow from import through receipt/category/match review, summary/question, export/reload. Check that supporting documents never double count cash.
6. Record current deployed revision, model/prompt versions, actual outputs and joint checker. Fix C issues; report A/B issues with the smallest reproducible case.

**Acceptance:** all four AI features work in A/B's actual flow with usable evidence and exact answers. **Cross-check:** local runner/mocked interface success cannot replace deployed journey evidence.

## Step 18 — run the cross-cutting AI failure and isolation checks

**Read:** plan section 14 matrix, PRD F01 and failure gates. **Skills:** secure-code-guardian, TDD; Playwright with B. **Files:** `tests/ai/**`, C fixes, evidence.

1. Combine actual operations with scripted external provider failures: timeout, long 429 reset, malformed structure, truncated output, cancellation and foreign/duplicate input IDs. Each returns safe bounded state.
2. Repeat uploads/AI preparation and run an older request finishing late. Accepted values/current results persist; A's snapshots/reservations reject stale publication.
3. Inject instructions in receipt text, transaction description and tool observation. Policy/tool allowlist/owner context remains server-authored; no arbitrary resource access.
4. A executes two-user read/write/source/tool/export isolation through real deployed routes. C verifies that its capabilities don't accept model-supplied owner IDs and that fact refs can't expose private data.
5. B runs account-switch/sign-out/reload states. No previous user's assistant answer/source remains visible under another session.
6. Inspect public errors and browser bundle/import graph for provider secret exposure. Logs contain bounded redacted metadata, not inputs/images/signed links.
7. Distinguish tested backend enforcement from C test-adapter assumptions. Record commands/procedures and actual failures.

**Acceptance:** failure preservation and bounds pass; A/B's real isolation evidence exists before release. **Cross-check:** no provider failure treated as empty valid financial data, no failed request rewriting books, no fake security pass from module-only tests.

## Step 19 — run independent live evaluation and assess gates

**Read:** plan section 14, PRD section 9 and RQ-10. **Skills:** spec consistency; live evaluation uses real production interface. **Files:** C live runner, redacted `docs/ai/evaluation.md`, frozen version manifest; A/B gold ownership.

1. Freeze repository candidate, contracts, prompt/schema/guide versions, model/settings and dataset IDs. Confirm six development/twelve reserved packets and six reserved assistant questions are independently checked.
2. Ensure runner passes only authorized test inputs into the app; never expected labels/generator/scoring hints. Live tests are explicit and not invoked by ordinary unit tests/build.
3. Schedule all runs under observed quota with demo reserve. Track request origin so live/cached/scripted outputs can't be mixed in a quality headline.
4. A/B score pre-correction outputs. OCR exact critical fields/readable denominator and unreadable abstentions are separate. Category correctness and abstention coverage are separate. Matching recommendation precision/recall and candidate coverage are separate.
5. Assistant scoring checks exact facts, correct accessible references/scope and justified abstention for six questions. A safe abstention is reported alongside completeness; it is not a fully answered query.
6. Capture provider failures, corrections/rejections, latency sample size and result distribution. Mark undefined precision as not applicable, not 100%.
7. Compare PRD targets (OCR >=90% readable fields; categories >=85% explicit records; match precision >=90%, recall >=80%; exact assistant facts/reference or abstention) and deterministic/access gates. These are prototype gates, not bank-grade validation.
8. Repair critical failures. Tuning on reserved failures means those cases are reused; disclose and seek fresh independent final cases. Never silently shrink denominators or report corrected values as raw AI accuracy.

**Acceptance:** independent scored report with denominators/versions and truthful gate status. **Cross-check:** no self-graded model result, no real customer/savings claim from synthetic packets, no unrun suite called passed.

## Step 20 — hand off clean code for cloud shipping and demo

**Read:** plan sections 11/16/17; hygiene/cloud sections D/E below; PRD RQ-11/12. **Skills:** actual diff review, handoff; Vercel skill only if a deployment action is separately requested. **Files:** C code/tests/docs and final C handoff; infrastructure remains A's.

1. Check only C's diff against baseline and adopted contracts. Remove C-created dead scaffolds/debug paths only when clearly unused and safe; do not remove preserved references, other team changes or test evidence.
2. Run focused AI tests, actual type/lint/production build and agreed joint smoke checks. Failures in A/B modules get reproducible reports; don't suppress type errors or disable checks to force a build.
3. Verify no runtime import of tests/fixtures/docs/archive/helper scripts and no client import of provider secrets. Keep mock/live evaluation opt-in and outside production imports.
4. Give A exact dependency/environment/runtime/request-size/deadline requirements, current model/prompt/schema manifest and cold-start result. A applies host config and deploys when authorized.
5. On A's preview/release, jointly test cold invocation, live OCR, bounded error recovery, source review, question evidence and account switching. Record actual URL/revision/time without keys or personal passwords.
6. B rehearses the PRD five-minute story twice with A/C. C reserves actual Groq quota and supplies measured results, short architecture explanation, known limitations and model/skill/code attribution.
7. Label saved/cached/replayed outputs; keep an honest backup ready. Pin release revision and configuration in C handoff and A's submission record.
8. Mark C complete only with module + integration + evaluation evidence. Deployment/submission remain A's authorized actions; no push/deploy implied by requesting this step's code preparation.

**Acceptance:** clean focused C contribution, no runtime leakage/artifacts, cloud-tested evidence and actionable A/B handoff. **Cross-check:** release, deck, measurements and prompt/model versions represent the same product; no stretch dependency or unresolved critical financial/access bug.

## D. Repository hygiene that every coding step must enforce

### Layout and dependency discipline

- Runtime code only in the accepted `src/lib/ai/**`; meaningful C tests in `tests/ai/**`; C planning/results in `docs/ai/**`. Don't add duplicate apps, package manifests, lockfiles, frameworks or a Python service.
- Use the repository's existing naming, formatting and shared types. No generic utils dumping ground, speculative plugin system, unrestricted tool executor or parallel schema source.
- C requests dependencies/required script changes from A with package, reason, version and expected use. A alone applies manifest/lockfile/root-config changes unless explicitly handed off.
- Keep runtime prompts/version metadata with C runtime code; keep evaluation expectations out of runtime directories/imports. Large/raw local provider dumps go to an agreed ignored artifact directory; share a redacted compact results table with reproducibility metadata.
- No empty future files, debug routes, temporary screenshots, binary result dumps, node_modules, `.next`, `.vercel`, coverage or downloaded packages in commits. Existing `.gitignore` covers many build/secret paths; A owns any additions.
- Generated artifacts are not needed for TypeScript source control. Existing archived frontend/reference ZIPs and all members are intentionally retained and must not be deleted or modified as “cleanup.” They stay under docs, never public/runtime imports.

### Secret and data discipline

- Groq key is server-only and never in example payloads, NEXT_PUBLIC variables, browser bundles, logs, tests, source or screenshots. A's `.env.example` contains names/placeholders only.
- Don't read/print environment files to prove presence. Validate values internally and report setting names/status only.
- Commit only deliberately synthetic development examples and redacted measurements. Reserved answer labels/generators stay in A/B-controlled evaluation paths outside application context.
- Never store original financial/private source data in `public/`. Source viewing uses A's authorized Storage flow. Signed links/bytes are not exported in assistant prose.
- Don't turn provider errors into unbounded raw text passed through to users.

### Git and review discipline

Before/after changes use `git status --short`, `git diff --check` and focused `git diff` on changed C paths. These are verification, not runtime tests. Before a requested commit inspect both staged and unstaged scope; stage explicit files, never `git add .` on this dirty planning checkout.

Don't reset, force-push, clean unknown untracked files or auto-drop someone else's stash. Resolve concurrent shared-contract changes with A; adapt C with a minimal diff. Root handoff additions are append-only C entries; summary and next-action belong to A. Keep deployment configuration changes in A's lane.

## E. Cloud-hosting readiness contract with A

C prepares this contract; A owns actual configuration/deployment. Vercel remains a candidate, not an assumed provisioned account. A's selected host and pinned versions decide exact settings.

| Concern | C implements/reports | A verifies/configures |
| --- | --- | --- |
| Runtime | Server-only provider; no browser/local OS subprocess/service requirement | Compatible Next.js server runtime and SDK/Node version |
| Build | No import-time calls/key requirement; no fixture/docs runtime imports | Reproducible lockfile install, type/lint/build on clean clone |
| Credentials | Validated secret setting names and safe missing-config failure | Preview/production server env scopes, rotation/access controls |
| Request size | One-image/bounded batch/input limits; metadata rather than source bytes in JSON result | Upload transport/body/memory limits and private source retrieval |
| Base64 overhead | Include actual encoding overhead in request-size measurements if used | App cap below usable host/provider limits; supported retrieval mode |
| Time | Absolute deadline, cancellation, capped retries/tool rounds | Deployed route duration and end-to-end allowance; measured safety margin |
| Durable state | Versioned cache/reservation identity; no process-local truth | Database operation state/idempotency/expiry and atomic stale checks |
| Async processing | No fire-and-forget work after response | Durable queue/progress/resume only if measured operation size requires it |
| Bundle | Minimal runtime imports and one supported SDK | Function tracing/deploy artifacts exclude unrelated references/tests where necessary |
| Privacy | No shared/global workspace answer cache or private URLs in output | Auth, database/Storage policies, data caching and route resource checks |
| Observability | Request/version/status/duration/attempts; redacted metadata | Logs retention/access and cloud error diagnostics |
| Release | Frozen C configuration/tests/measurements | Candidate revision, deployment URL and final submission |

Current official Next.js documents `server-only` protection and server/client environment separation. Follow the pinned app's supported mechanism rather than copying examples blindly. [Next.js server/client documentation](https://nextjs.org/docs/app/getting-started/server-and-client-components).

Function payload/duration limits depend on host configuration and plan. Inspect actual limits and set app caps from measured end-to-end requests; a provider's image limit is not a safe app upload limit. [Vercel function limits](https://vercel.com/docs/functions/limitations), [duration configuration](https://vercel.com/docs/functions/configuring-functions/duration).

The Groq TypeScript SDK documents built-in retries and configurable timeout/retry behavior. Verify the installed SDK and make its behavior part of our single bounded budget. [Official Groq TypeScript SDK](https://github.com/groq/groq-typescript).

### Cloud smoke procedure

1. A builds from a clean checkout with the committed lockfile and documented nonsecret setup; record command results.
2. Confirm build does not require inference/real financial fixtures and ordinary tests don't call Groq.
3. Deploy the candidate through A's chosen authorized workflow. Don't expose personal credentials for judge access.
4. Start a fresh session/cold function and run a small fresh receipt plus supported question. Record actual latency/model/version/origin.
5. Test missing/invalid provider config and timeout behavior in a safe test environment; cloud errors preserve records and disclose recovery.
6. Repeat operation and correct fields; verify durable state across requests/reload. Process restarts do not erase reviewed data.
7. Verify private source and assistant/tool isolation with two users; B verifies account switch and current-scope rendering.
8. Inspect deployment bundle/imports for accidental secrets/test fixtures and broad runtime file inclusion. A narrows tracing/config only if required; don't delete archives to reduce a function bundle.
9. Pin release/config and preserve compact evidence. A/B's submission artifacts refer to that same release.

## F. Exact cross-check checklist for the coding agent

At the end of every requested batch report these as pass/fail/not applicable/not run, with evidence:

- Requested steps only; each predecessor actually satisfied or blocker explicit.
- PRD F/RQ requirements mapped; all relevant acceptance items verified.
- Existing Person C plan's invariant, loop/retry caps, output scope and UI states preserved.
- Actual shared contract version/imports used; no second money/state/record schema.
- C-owned file scope respected; A/B needed changes described rather than silently implemented.
- Unknowns/nulls, exact money/currency/date policy and evidence membership validated.
- No accepted record/match/correction silently replaced; stale/cache behavior explicit.
- Assistant capability allowlist and fact-bound numbers preserved when relevant.
- Focused meaningful tests pass; type/lint/build results reported where available.
- Live/model quality and deployed integration are never inferred from scripted tests.
- Repo/cloud hygiene reviewed; secrets/private fixtures/build artifacts excluded.
- C handoff updated with versions, procedure/results, limitations and next step.

If the agent discovers this runbook missed a real edge case, document the narrow correction, trace it to the PRD, implement within authorized C scope and add a meaningful regression. A shared/product change remains coordinated. “Perfect code” means observable criteria backed by checks, not an agent assertion that nothing can go wrong.

## G. First implementation requests and stopping points

- **“Implement steps 1 and 2.”** Inventory + accepted contract preparation. No application scaffold or live/provider code. Agreement can remain pending while independent documentation is completed.
- **“Implement step 3.”** Real capability proof only, using an approved runtime and secure access. No fake pass if credentials are absent.
- **“Implement steps 4 and 5.”** Provider/config/budget behavior once contracts/packages exist.
- **“Implement steps 6–8.”** OCR + cache + actual receipt-review integration; do not build missing A/B pieces.
- **“Implement steps 9 and 10.”** Categories + persistent review/rerun proof.
- **“Implement steps 11–13.”** Matching candidates/ranking + atomic-review integration evidence.
- **“Implement steps 14–17.”** Four tools, bounded loop, grounded answers and integrated journey.
- **“Implement steps 18–20.”** Cross-cutting checks, independent evaluation and clean release handoff. Commit/push/deploy still need a direct request if not already authorized.

### Runbook preparation record

Prepared using the installed planning/interface/testing skills and previously reviewed AI/TypeScript/security guidance. Current official Next.js/Vercel/Groq SDK documentation was checked for server-only, runtime limits and retry considerations on 10 October 2026. Documentation links, step mapping, dependencies, ownership and consistency are verified before handoff completion. No implementation, dependency installation, live provider request, product test, Git publication or deployment occurs in this preparation task.
