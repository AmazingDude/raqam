# Raqam: remaining backend work for two agents

Updated: 10 October 2026, PKT. Requested by the user. This subdivides backend role A; frontend B and AI-engine C retain their modules. It does not change the PRD, confirm the event roster, or authorize deployment. Existing RQ IDs remain the product baseline.

## Start here

- **A1 = this Codex agent, working with the user:** data integrity, shared schema/contracts, reviewed categories/matches, platform checks and integration.
- **A2 = teammate's agent:** supporting-document services, AI proposal route wrappers and the scoped read-only assistant backend.
- **Latest user reassignment:** this agent now owns document/category service routes as well as A1 shared contracts/migrations, after the user answered "You take the routes too". The existing A2 helper modules are reused and preserved. Assistant/match-generation services retain their prior ownership until explicitly reassigned; C engines and B UI remain reserved. Claim: BA-00/01 receipt evidence/cache extension and BA-02 routes/services/tests; category wiring follows C step 9 review.
- **Latest C1 step 3 boundary:** A1 supplies pinned Groq SDK/Zod and the tested native Node TypeScript baseline only; see `docs/ai/PROVIDER_BASELINE.md`. C1 owns the feasibility runner, secure environment loading, bounded timeouts and synthetic inputs. The earlier A1 proof/tsx setup is superseded and removed; use `npm ci` after pulling. No database, routes or UI work is required for this proof.
- Start from the latest `origin/codex/raqam-backend`, which includes this plan. A1 stays on `codex/raqam-backend`. A2 creates `codex/raqam-backend-services` from that remote branch in a **separate clone or worktree**. Do not switch branches underneath another running agent in the same checkout.
- Existing evidence: 37/37 product tests, strict types/build, 16 signed-out requests, 7/7 live one-account groups and 10/10 bounded two-account isolation groups. These are not a complete release gate.
- Hosted migrations 001–005 have passing installed behavior. Do not rerun them. CLI history for SQL-editor application needs verification before future pushes. The user runs future reviewed migrations manually for speed.

## Exclusive file ownership

This map takes precedence over the older broad “A owns all backend files” assignment when coordinating A1/A2. Files outside this map retain their current owners.

| Owner | Files/modules |
| --- | --- |
| A1 only | All existing `src/lib/contracts/**`; any new document/proposal/review/assistant contract files; `supabase/migrations/**`; package/lock/config/env example; `src/proxy.ts`; shared `auth.ts`, `http.ts`, `errors.ts`, `configuration.ts`, `workspace.ts`, money/import/storage/upload helpers; existing API routes; cashbook mapping/totals/export; shared planning/setup/contracts/validation docs |
| A1 new features | `src/lib/server/reviews/**`, `src/lib/server/matches/**`, `src/app/api/reviews/**`; changes to cashbook match projection and summary/export integration |
| A1 reassigned routes/services | New `src/lib/server/documents/extraction.ts`, `src/lib/server/documents/persistence.ts`, `src/lib/server/receipt-extraction-mapping.ts`; all `src/app/api/documents/**`; after C step 9 review, `src/app/api/category-proposals/**` and its new route service |
| A2 retained helpers/services | Existing `src/lib/server/documents/source.ts`, `receipt-input.ts`, `src/lib/server/proposals/**`, `src/lib/server/assistant/**`; `src/app/api/match-proposals/**`, `src/app/api/assistant/**` |
| A1 verification | Existing tests/scripts and new tests excluding the A2 prefixes below; schema/RLS/atomicity/Storage/concurrency checks; combined release checks |
| A2 verification | `tests/backend/services-*.test.ts`, `tests/security/services-*.test.ts`, `scripts/smoke-services-*.mjs`, `docs/raqam/worklogs/A2.md` |
| Still B/C | B: product/client/components/browser tests. C: `src/lib/ai/**`, `tests/ai/**`, provider prompts/models/engines and AI evaluation. A2 calls C's adapters; it does not implement another AI engine or provider. |

A2's test filenames stay flat so the existing `npm test` globs run them. No package change is needed for those tests. A2 requests shared helper/contract/schema changes through A1; it does not copy a competing helper or silently redefine a response shape.

## Tasks and dependencies

Statuses below are assignments, not implementation claims. A1 coordinates this table; A2 records progress and measured checks in its own worklog.

| ID | Owner | RQ link | Work | Depends on | Initial status |
| --- | --- | --- | --- | --- | --- |
| BA-00 | A1 | RQ-00/05–08 | Freeze missing command/result/RPC contracts and publish the schema interface | Existing PRD/contracts | done for document/proposal foundation — executable schemas, canonical RPC/route boundaries and D13 policy published; detailed C assistant result proposals remain unadopted |
| BA-01 | A1 | RQ-05/06/07 | Document/proposal persistence schema, owner policies and immutable history | BA-00 | in_review — 006/007 hosted behavior passes; local 008 evidence/cache schema and PGlite guards pass; 008 still awaits manual hosted application and checks |
| BA-02 | A1 | RQ-05 | Document registration, retrieval, extraction orchestration and explicit field review | BA-00; BA-01 for persistence; C OCR for live extraction | in_review — owner-scoped list/register/detail/review/history/extraction routes and durable raw evidence/cache mapping are implemented locally; 9 focused checks and typecheck pass; migration 008, live Groq config and hosted route checks remain pending |
| BA-03 | A1 category; A2 match | RQ-06/07 | Category/match generation wrappers and proposal persistence/listing | BA-00/01; C engines for live generation | in_progress — shared category output guard exists; do not wire generation until C step 9 guide/version review is complete; A2 retains match-generation and assistant services |
| BA-04 | A1 | RQ-06/07/09 | Atomic category/match accept/change/reject, one-to-one constraints, correct cashbook match projection | BA-00/01; stored proposals/documents for combined checks | in_review — 007 installed; 11/11 hosted two-account synthetic groups include real competing approvals, corrections/retries/history/isolation and list/detail projection; 77 tests/build pass; integrated B/C journey pending |
| BA-05 | A2 | RQ-08 | Four scoped read-only tools and `/api/assistant` wrapper around C's bounded loop | BA-00; existing cashbook now; BA-02/04 for full document/match evidence | in_progress — A1 reviewed/integrated A2's whole-workspace summary and transaction lookup; remaining tools/route/C adapter pending |
| BA-06 | A1 | RQ-01/04/10 | Remaining Storage mutation, concurrency and session/security gates | Existing backend; new routes as they land | in_progress — 4/4 Storage mutation groups, two bounded competing-match races and 6/6 native API session groups (actual token expiry) pass; second test account is signed in, but its empty workspace is named `Dukaan`; cap script still requires the separate named workspace; browser cookie/session-switch gates pending |
| BA-07 | A1, A2 supplies evidence | RQ-10/12 | Sequential integration and full backend-to-B/C checks | Completed slices above | in_progress — 173/173 combined synthetic tests, strict typecheck, production build, 24 private route denials and B's 3 UI/9 private-read HTTP smoke pass; hosted migration 008, signed-in receipt persistence, live model, full product and release checks remain pending |

### BA-00/01 — A1 publishes the shared foundation first

1. Reuse `SupportingDocument`, `DocumentFields`, proposal shapes and `assistantToolSchemas`. Freeze request/response schemas, RPC names/parameters, review versions, retry keys, required-field acceptance and safe errors in `docs/raqam/CONTRACTS.md`. Receipt evidence/cache and route shapes are now published; category generation remains blocked on C step 9 review. Resolve material unanswered PRD choices with the user.
2. Publish explicit interfaces for document registration/extraction result/field review, proposal creation/listing and category/match decisions. Decide the date-filter/unresolved-count scope for assistant summaries explicitly; never silently total the first page.
3. Migrations 006/007 are installed per the user and pass scoped hosted behavioral checks. Do not reapply 001–007. A1 alone allocates subsequent numbers; future migrations remain manual.
4. Validate embedded PostgreSQL RLS, foreign-reference denial, malformed inputs, atomic rollback and retry/version behavior. Use non-retryable `PT409` for application conflicts.
5. Push the foundation and give A2 its exact commit, migration files and frozen interface. User applies the reviewed SQL; verify hosted behavior afterward. Do not require A2 to wait for all later review features.

### BA-02 — A1 delivers receipts; A1 category wiring follows C's review

1. Reuse the existing private-source upload/retrieval; register a supporting document only from an accessible source. No second upload convention.
2. Keep the receipt identity/evidence schema in `docs/raqam/CONTRACTS.md`; only the server reads authorized source bytes and invokes C. Preserve unknowns, originals, model/prompt/schema identity and safe failures.
3. Use the receipt-specific reservation/save/allowance RPCs from migration 008. Return busy/cache/failure states explicitly; do not add retries around C's two-attempt cap.
4. `PATCH /api/documents/{id}` reuses A1's review RPC: explicit correction/acceptance/rejection, D13 required fields, stale edits conflict and originals survive. A receipt never inserts cash.
5. A1 owns category generation/listing routes after C publishes and the team reviews the category guide/version. Do not invent the seven-label definitions or persist unreviewed output. A2 retains match-generation and assistant services.
6. Verify malformed/provider-failure cases, cross-owner IDs, reload, retries and no cash creation. Mocked tests are labeled; hosted extraction requires manually applying 008 and model settings.

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
