# Raqam — Person C handoff

**Updated:** 10 October 2026, PKT. **Owner:** the user, Person C / Person 3.  
**State:** Steps 1–2 documentation prepared; step 3 public-doc review complete, live Groq feasibility blocked by missing A-approved runtime and secure credential. AI implementation has not started; contract adoption is awaiting A/B.
**Read first:** [Person C plan](PERSON_C_PLAN.md), [numbered implementation steps](IMPLEMENTATION_STEPS.md), [PRD](../../PRD.md), [team ownership](../../TEAM_TASKS.md), [shared handoff](../../handoff.md), [build gates](../../BUILD_PLAN.md).

**Two-contributor execution:** [TWO_PERSON_EXECUTION.md](TWO_PERSON_EXECUTION.md) assigns original steps 4–20 without changing the implementation plan. C1 (user) owns provider/OCR/categories; C2 owns matching/tools/assistant. Each writes its own [C1 handoff](C1_HANDOFF.md) or [C2 handoff](C2_HANDOFF.md); C1 alone consolidates this handoff. Shared integration branch: `codex/ai-two-person`.

**Coding entry point:** [IMPLEMENTATION_STEPS.md](IMPLEMENTATION_STEPS.md). The user can request specific numbered steps; the agent must read the plan/PRD, check dependencies and report acceptance evidence before completion.

## Confirmed context

The user will build C's AI lane and asked for an extremely detailed plan before slowly implementing it. Available work time is approximately 15–17 hours; exact organizer submission cutoff is still unconfirmed. All four core AI capabilities stay in scope. A/B implementation is outside C's lane, but contracts and integrated behavior must align.

The plan covers live OCR, reviewable category/match proposals, a bounded four-tool grounded assistant, end-product behavior, source/evidence interfaces, evaluation, failure handling and demo impact. The PRD remains authoritative. Model IDs, host limits, shared type shapes and some UX choices are proposals pending live verification/team agreement; planning does not establish readiness.

## Ownership

C: `src/lib/ai/**`, `tests/ai/**`, `docs/ai/**`, subject to A's actual bootstrap layout. A owns shared schemas, routes, auth, storage/persistence, exact financial helpers/totals, approvals/uniqueness, root configuration/dependencies and integration. B owns UI/client modules, source/review/assistant screens and browser/demo work. Do not edit A/B modules without a recorded handoff.

## Task status

| Task | Status | Evidence / dependency |
| --- | --- | --- |
| C-PLAN | done | Detailed plan saved; documentation consistency/link/arithmetic/whitespace checks completed |
| C-RUNBOOK | done | 20 numbered coding steps, contract details, review protocol and cloud/repo hygiene documented; preparation checks only |
| Step 1 baseline inspection | done | Actual checkout, pre-existing dirty state, absent app scaffold/config/commands, tool versions and ownership recorded in baseline.md |
| Step 2 proposal preparation | in_review | PRD-aligned contract and synthetic example docs drafted; A/B adoption and concrete shared exports are not present in repo |
| Step 1–2 review corrections | done | Cached/live extraction examples share a complete field-object shape; contracts.md section 8 now lists proposed packages, server configuration, deadlines and durable reservation requirements for A |
| Step 3 Groq capability proof | blocked | Official docs and candidate modes recorded in GROQ_FEASIBILITY.md; no app runner, approved dependencies or nonempty secure key; zero live requests |
| Two-contributor coordination plan | done | Steps 4–20 mapped to exclusive files, dependency waves and separate handoffs; planning checks only; original implementation gates unchanged |
| C-00 contract agreement | in_review | PRD requirements traced; amount serialization, required-field policy, exact schemas/imports, tool result shapes, snapshot/cache interface and test-seam adoption await A/B |
| C-01 live feasibility | blocked | `qwen/qwen3.8-27b` and `openai/gpt-oss-20b` are public documentation candidates; account access/limits and all live behaviors remain unverified until A approves a runner and supplies secure runtime access |
| C-02 adapter | todo | C-00/C-01 and A-approved packages/runtime |
| C-03 extraction | todo | A's private source/cache path and B's review panel |
| C-04 categories | todo | Valid transaction inputs and agreed category guide |
| C-05 matching | todo | Reviewed document fields, candidate/allocation snapshots |
| C-06 assistant | todo | A's four authorized read-only tools and fact contracts |
| C-07 integration | todo | A/B routes/screens and C core operations |
| C-08 reserved evaluation | todo | Frozen configuration and independent A/B labels |
| C-09 demo/release preparation | todo | Core gates and release candidate |
| C-10 final defects/handoff | todo | Pinned release and completed checks |

No implementation task is done merely because its plan exists. Keep detailed criteria/time estimates in the plan rather than duplicating them here.

## Immediate next task

Step 1 inspection is complete. Step 2 proposal/examples/seams are documented and await A/B adoption; the checkout still has no app scaffold or executable shared schema. Step 3 reviewed current Groq documentation and recorded the public capability matrix in [GROQ_FEASIBILITY.md](GROQ_FEASIBILITY.md), but the live gate is blocked: no A-approved runner/dependencies and no nonempty secure Groq key. Next: A provides an approved runner/runtime and secure access; C then runs the bounded synthetic probes before C-02. The existing docs branch is not an agreed implementation branch; A should name the app baseline before code starts.

The user requested shared C branch `codex/ai-two-person` for this split. Use separate clones/worktrees and the single-publisher procedure in TWO_PERSON_EXECUTION.md. The original dirty planning checkout is preserved; before runtime coding, A must still provide the agreed application baseline and contract imports. Branch publication is planning delivery, not implementation acceptance.

## Checks actually completed

Steps 1–2 checks remain as recorded below. Step 3: checked only presence of the proposed Groq key without printing its value; confirmed `.env.local` is ignored and its Groq setting is empty, process environment has no key, no app manifest/lockfile/test runner exists, and neither Node `groq-sdk` nor Python `groq` is installed. Read ecosystem-primer, LangChain fundamentals/middleware guidance, and current official Groq vision/model/structured-output/tool/rate-limit pages. No dependency was installed, no live provider request was made, and no app test/build/integration/cloud check ran.

## Open dependencies and cautions

- Step 3 live proof is blocked by the absence of an A-approved runtime/runner and secure nonempty Groq key. Public docs currently classify the Qwen vision candidate as preview; account permission and quota remain unknown.
- Shared interface details are proposals until A adopts them; B must confirm rendering needs.
- Independent reserved datasets/labels and live request budget must be coordinated early.
- For eventual probes, use a one-request-per-case budget plus at most two model calls for the local tool round; no automatic retries. Check account-level budget first. Keep strict schema output and tool calling in separate requests per current Groq docs.
- Corrected fields/accepted decisions never get replaced by rerun/cache results. Version checks belong in integration.
- Assistant fact values come from deterministic authorized tools; model prose is not numerical authority.
- No runtime framework/tracing/vector store is added solely because a skill suggests one.
- Stretch is closed until the shared PRD gate passes. The core demo does not depend on stretch.
- Existing unrelated local documentation modifications remain; do not bundle or discard them.

## Suggested skills by next task

- Planning/interface updates: `spec-kit-planning`, `codebase-design`; use API designer with A if route contracts need formalization.
- Provider/agent work: `ecosystem-primer` first when revisiting framework selection; `langchain-fundamentals` and `langchain-middleware` as applicable, preserving the Groq SDK decision.
- Validated states/tool arguments: `typescript-pro`, `secure-code-guardian`.
- Meaningful module behavior tests: `tdd` after reading its supporting testing/mocking references.
- Integrated UI verification: `playwright`, coordinated with B; frontend-craft is B's UI implementation guidance.
- Implemented diff review: `code-review`; follow its actual workflow only when a diff exists.
- Continuity: `handoff`; the user requested this repo-local C handoff, which overrides the generic temporary-directory destination.

## Session log

- 10 October 2026: fixed both step 1–2 review findings. Replaced cached extraction's string placeholder with the same complete field objects/values as live output, changing only origin; explicit empty issue lists added to both. Added contracts.md section 8 with a consolidated A configuration requirements checklist covering package/runtime pins, server-only secret/model names, verification tooling, request deadline, retry/batch/tool limits and durable reservation/cache/snapshot ownership. All choices remain proposals pending A/B adoption. JSON/shape, checklist coverage, links and Git whitespace checks passed; no runtime tests or cloud/provider checks ran. Step 2/C-00 remain in_review.
- 10 October 2026: implemented requested Person C runbook steps 1–2 as documentation. Added baseline.md with actual branch/revision/origin, pre-existing dirty state, absent app scaffold/commands and tool versions. Added contracts.md tracing accepted PRD rules and marking proposed types, tool shapes, field policy, cache interface and test seams as pending A/B adoption; added synthetic development examples.md. Updated this C handoff and appended a root handoff entry. Documentation checks only; no code, tests, packages or shared A/B files changed. Step 1 inspection done; step 2 is in review awaiting actual A/B adoption evidence. Next: have A/B review/adopt the shared contract before contract-dependent implementation.
- 10 October 2026: user selected Person C, confirmed approximately 15–17 hours and retained all core AI features. Created `PERSON_C_PLAN.md` and this C-specific handoff. Proposed integration contracts and end-product behavior without changing A/B plans, PRD or application code. Verified planning documents; implementation/model access remains untested. Next: C-00 agreement and C-01 live feasibility when implementation is requested.
- 10 October 2026: user requested extremely detailed numbered implementation instructions usable by coding agents. Added `IMPLEMENTATION_STEPS.md` with 20 steps mapped to existing C/RQ tasks, concrete contract proposals, per-step coding/verification guidance, scope limits and clean cloud-shipping procedures; linked it from the plan. Documentation checks completed; no numbered step implemented, no runtime/dependency/root-config changes, and no publication/deployment. Next: steps 1–2 when requested.

- 10 October 2026: requested Person C step 3. Read repository instructions/PRD/task ownership/workflow and C plan/runbook/handoff; reviewed ecosystem-primer and applicable LangChain fundamentals/middleware guidance. Current official Groq docs list Qwen 3.8 27B for image/JSON-object/tool features (preview model), GPT OSS 20B for production and strict structured outputs, and prohibit combining tool use with Structured Outputs in one request. Added GROQ_FEASIBILITY.md with sources, a bounded synthetic probe matrix and exact readiness blockers. Checked environment-key presence without revealing values: `.env.local` Groq key empty; process key absent; no A-approved app runtime, runner or SDK installed. No model request, mocked response, dependency install or application test occurred; response duration/errors/fields are N/A. Step 3/C-01 blocked, not passed. Next: A approves runner/runtime and arranges secure key/account-limit check, then C runs the probes before C-02.

- 10 October 2026: user requested two contributors within Person C for original steps 4–20 and publication on a separate shared branch. Added TWO_PERSON_EXECUTION.md, C1_HANDOFF.md and C2_HANDOFF.md with exclusive source/test/doc ownership, the shared provider seam, unchanged predecessors/acceptance, single-publisher integration and per-person coding prompts. Updated only C coordination in this handoff. SHA-256 checks confirm original PRD/Person C plan/runbook/team documents unchanged; all 17 steps are assigned exactly once, exclusive path ownership and local links checked, and Git whitespace check passed. Live step 3 and contract adoption remain blocked/pending. No runtime implementation, dependency install, AI request or deployment.

## Entry template for later work

Date/time; C task/status; files changed; PRD/RQ criteria addressed; baseline/schema/model/prompt versions; checks actually run and result counts; integration handoff to A/B; known issues; next ready task. Redact credentials and personal financial data. Append only C's entry to the shared root handoff and leave its summary/next-action sections to A.
