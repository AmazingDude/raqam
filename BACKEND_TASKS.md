# Raqam: remaining backend work for two agents

Updated: 10 October 2026, PKT. Requested by the user. This subdivides backend role A; frontend B and AI-engine C retain their modules. It does not change the PRD, confirm the event roster, or authorize deployment. Existing RQ IDs remain the product baseline.

## Start here

- **A1 = this Codex agent, working with the user:** data integrity, shared schema/contracts, reviewed categories/matches, platform checks and integration.
- **A2 = teammate's agent:** supporting-document services, AI proposal route wrappers and the scoped read-only assistant backend.
- **User-requested A1 setup addition:** pinned Groq/tsx and the standalone `tests/ai/live/feasibility.ts` runner are ready; see `docs/ai/FEASIBILITY.md`. C retains production AI adapters/prompts and the three-case live proof. Use `npm ci` after pulling the dependency change.
- Start from the latest `origin/codex/raqam-backend`, which includes this plan. A1 stays on `codex/raqam-backend`. A2 creates `codex/raqam-backend-services` from that remote branch in a **separate clone or worktree**. Do not switch branches underneath another running agent in the same checkout.
- Existing evidence: 37/37 product tests, strict types/build, 16 signed-out requests, 7/7 live one-account groups and 10/10 bounded two-account isolation groups. These are not a complete release gate.
- Hosted migrations 001–005 have passing installed behavior. Do not rerun them. CLI history for SQL-editor application needs verification before future pushes. The user runs future reviewed migrations manually for speed.

## Exclusive file ownership

This map takes precedence over the older broad “A owns all backend files” assignment when coordinating A1/A2. Files outside this map retain their current owners.

| Owner | Files/modules |
| --- | --- |
| A1 only | All existing `src/lib/contracts/**`; any new document/proposal/review/assistant contract files; `supabase/migrations/**`; package/lock/config/env example; `src/proxy.ts`; shared `auth.ts`, `http.ts`, `errors.ts`, `configuration.ts`, `workspace.ts`, money/import/storage/upload helpers; existing API routes; cashbook mapping/totals/export; shared planning/setup/contracts/validation docs |
| A1 new features | `src/lib/server/reviews/**`, `src/lib/server/matches/**`, `src/app/api/reviews/**`; changes to cashbook match projection and summary/export integration |
| A2 new services | `src/lib/server/documents/**`, `src/lib/server/proposals/**`, `src/lib/server/assistant/**`; `src/app/api/documents/**`, `src/app/api/category-proposals/**`, `src/app/api/match-proposals/**`, `src/app/api/assistant/**` |
| A1 verification | Existing tests/scripts and new tests excluding the A2 prefixes below; schema/RLS/atomicity/Storage/concurrency checks; combined release checks |
| A2 verification | `tests/backend/services-*.test.ts`, `tests/security/services-*.test.ts`, `scripts/smoke-services-*.mjs`, `docs/raqam/worklogs/A2.md` |
| Still B/C | B: product/client/components/browser tests. C: `src/lib/ai/**`, `tests/ai/**`, provider prompts/models/engines and AI evaluation. A2 calls C's adapters; it does not implement another AI engine or provider. |

A2's test filenames stay flat so the existing `npm test` globs run them. No package change is needed for those tests. A2 requests shared helper/contract/schema changes through A1; it does not copy a competing helper or silently redefine a response shape.

## Tasks and dependencies

Statuses below are assignments, not implementation claims. A1 coordinates this table; A2 records progress and measured checks in its own worklog.

| ID | Owner | RQ link | Work | Depends on | Initial status |
| --- | --- | --- | --- | --- | --- |
| BA-00 | A1 | RQ-00/05–08 | Freeze missing command/result/RPC contracts and publish the schema interface | Existing PRD/contracts | todo — first A1 task |
| BA-01 | A1 | RQ-05/06/07 | Document/proposal persistence schema, owner policies and immutable history | BA-00 | todo |
| BA-02 | A2 | RQ-05 | Document registration, retrieval, extraction orchestration and explicit field review | BA-00; BA-01 for persistence; C OCR for live extraction | todo — first A2 feature |
| BA-03 | A2 | RQ-06/07 | Category/match generation wrappers and proposal persistence/listing | BA-00/01; C engines for live generation | todo |
| BA-04 | A1 | RQ-06/07/09 | Atomic category/match accept/change/reject, one-to-one constraints, correct cashbook match projection | BA-00/01; stored proposals/documents for combined checks | todo |
| BA-05 | A2 | RQ-08 | Four scoped read-only tools and `/api/assistant` wrapper around C's bounded loop | BA-00; existing cashbook now; BA-02/04 for full document/match evidence | todo — unblocked scaffolding now |
| BA-06 | A1 | RQ-01/04/10 | Remaining Storage mutation, concurrency and session/security gates | Existing backend; new routes as they land | todo — can run alongside BA-02/03/05 |
| BA-07 | A1, A2 supplies evidence | RQ-10/12 | Sequential integration and full backend-to-B/C checks | Completed slices above | todo |

### BA-00/01 — A1 publishes the shared foundation first

1. Reuse `SupportingDocument`, `DocumentFields`, proposal shapes and `assistantToolSchemas`. Freeze request/response schemas, RPC names/parameters, review versions, retry keys, required-field acceptance and safe errors in `docs/raqam/CONTRACTS.md` before A2 wires writes. Resolve material unanswered PRD choices with the user.
2. Publish explicit interfaces for document registration/extraction result/field review, proposal creation/listing and category/match decisions. Decide the date-filter/unresolved-count scope for assistant summaries explicitly; never silently total the first page.
3. Prepare owner-scoped tables/functions for originals, extracted/corrected fields, proposals and history. Reserve migration 006 for document/proposal persistence and 007 for category/match approval; A1 alone allocates subsequent numbers. These are reservations, not SQL files already created/applied.
4. Validate embedded PostgreSQL RLS, foreign-reference denial, malformed inputs, atomic rollback and retry/version behavior. Use non-retryable `PT409` for application conflicts.
5. Push the foundation and give A2 its exact commit, migration files and frozen interface. User applies the reviewed SQL; verify hosted behavior afterward. Do not require A2 to wait for all later review features.

### BA-02/03 — A2 delivers receipts and proposals

1. Reuse the existing private-source upload/retrieval; register a supporting document only from an accessible source. Freeze the registration input in BA-00 rather than introducing a second upload convention.
2. Read/list documents with bounded queries. Orchestrate C's OCR on an authorized source; validate provider output and preserve unknowns, originals and model/prompt versions. Persist failures visibly and bound retries/cache behavior according to C's adapter contract.
3. Implement `PATCH /api/documents/{id}` using A1's atomic review RPC: explicit correction/acceptance/rejection, required uncertain financial fields remain unresolved, stale edits conflict and originals survive. A receipt never inserts cash.
4. Wrap C's category/match engines using scoped records. Validate every referenced transaction/document independently of the model; assign proposal IDs/ownership on the server and store suggestions separately from accepted books.
5. Reruns cannot replace accepted document/category/match decisions. Return recoverable provider errors. No service-role client, silent AI acceptance or new model/framework.
6. Verify correct/unknown/malformed/provider-failure cases, cross-owner IDs, reload, retries and absence of new cash from images. Mocked adapter tests are labeled; live OCR/generation stays pending until C's real adapter passes.

### BA-04 — A1 delivers review and reconciliation

1. Implement category/match commands under `/api/reviews` using frozen schemas. A2 owns document field review under `/api/documents/{id}`; neither edits the other's route.
2. Check ownership and current versions before decisions/retries. Validate both referenced records in the same workspace. Keep immutable actor/timestamp/previous/current values.
3. Enforce one active match per transaction and per document in the database and atomic function, including competing approvals. Rejection does not claim a cash movement was unpaid or fraudulent.
4. Update the cashbook view/mapper to return actual match status; it currently returns `unmatched`. Preserve exact cash/category totals and reviewed descriptions. Exports must show persisted match status.
5. Verify duplicate/conflicting/stale decisions, concurrent one-to-one allocation and rerun preservation, plus both-user isolation. A2 supplies document/proposal fixtures for the combined check.

### BA-05 — A2 delivers scoped tools and assistant wiring

1. Implement `list_transactions`, `get_cash_summary`, `get_review_queue`, `get_record_evidence` with existing runtime argument schemas. Caller identity/workspace comes from the verified session, never model arguments.
2. Build existing cashbook lookup/summary scaffolding immediately; finish document/match branches after their contracts and schema are available. Do not return invented empty success for an unavailable feature.
3. Reuse A1's validated arithmetic. Bound queries/cursors and validate results/evidence IDs; reject inaccessible IDs. Keep pending suggestions distinct from accepted decisions.
4. Wire `/api/assistant` to C's engine with the four scoped executors, the PRD's three-round limit and safe failure behavior. No mutable tools, arbitrary URLs or credentials in model context/logs.
5. Verify filters, exact totals beyond safe integer range, inaccessible evidence, unsupported tool names, malformed outputs, bounded loops/provider errors and source text treated as data. Live AI remains C-dependent.

### BA-06/07 — A1 closes remaining gates and integrates

- Extend known two-account evidence to Storage INSERT/UPDATE/DELETE policies using explicitly disposable synthetic fixtures; do not touch real records or broad-delete workspaces.
- Validate true concurrent workspace-cap imports and match approvals; rollback/retry behavior must be measured on managed Supabase, not inferred from local tests.
- Validate expiry/sign-out/account switching with B's browser checks, and new route isolation as each service lands. Prefer CLI/API; use computer interaction only when necessary.
- Review A2's diff/evidence, integrate completed commits sequentially, run the applicable combined tests/types/build/live check and update the root handoff. Existing passed checks are repeated only when changed behavior warrants it.
- Main integration/deployment follow the existing release instructions; this plan is published to the backend branch only. No stretch until the existing release gate passes.

## Work rhythm and sync rules

1. A1 publishes BA-00/01 first. Meanwhile A2 may scaffold tests, document-service validation and tools against existing types/clearly labeled fixtures. It must not guess production tables/RPCs or claim live AI.
2. Each agent claims one task and lists its files before edits. Commit small verified slices. A2 pushes only `codex/raqam-backend-services`; A1 pushes only `codex/raqam-backend` and owns integration.
3. A2 fetches/rebases onto A1's published foundation before wiring dependent code. Do not push to A1's branch or force-push to resolve conflicts. A1 reviews then merges/cherry-picks agreed complete commits.
4. A2 updates its worklog with changes, commands actually run, counts, limits, next action and commit SHA. Append the required root `handoff.md` entry only at a coordinated handoff after syncing, while A1 is not editing it; A1 alone updates root summary/shared task status. This serializes the only shared documentation append.
5. A2 sends the user its branch/commit and asks the user to relay integration requests; these agent assignments do not by themselves authorize cross-chat messages.

## Prompt to give the teammate's agent

> You are backend A2 for Raqam. Fetch the latest `origin/codex/raqam-backend` and use a separate checkout on `codex/raqam-backend-services`. Read AGENTS.md, handoff.md, PRD.md, BUILD_PLAN.md, TEAM_WORKFLOW.md, BACKEND_TASKS.md and docs/raqam/CONTRACTS.md. Own BA-02, BA-03 and BA-05 only, within BACKEND_TASKS.md's file map. First scaffold scoped assistant lookup/summary tests and document services using existing schemas; obtain A1's frozen BA-00/01 contract/schema commit before wiring writes. Preserve nulls/originals; images never create cash; proposals never silently become accepted records. Call C's AI adapters without editing C's modules. Do not edit shared contracts/migrations/dependencies/existing platform files or push to A1's branch. Validate each completed slice, update docs/raqam/worklogs/A2.md, coordinate the required root handoff append, commit/push your owned branch and give the user the exact commits for A1 to integrate. Use files/CLI for speed; the user runs new migrations manually. Keep secrets out of chat/logs/Git.
