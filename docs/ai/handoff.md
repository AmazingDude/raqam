# Raqam — Person C handoff

**Updated:** 10 October 2026, PKT. **Owner:** the user, Person C / Person 3.  
**State:** Person C steps 1 and 2 documentation prepared; AI implementation not started. Contract adoption is awaiting A/B.  
**Read first:** [Person C plan](PERSON_C_PLAN.md), [numbered implementation steps](IMPLEMENTATION_STEPS.md), [PRD](../../PRD.md), [team ownership](../../TEAM_TASKS.md), [shared handoff](../../handoff.md), [build gates](../../BUILD_PLAN.md).

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
| C-00 contract agreement | in_review | PRD requirements traced; amount serialization, required-field policy, exact schemas/imports, tool result shapes, snapshot/cache interface and test-seam adoption await A/B |
| C-01 live feasibility | todo | Secure Groq access and actual model/limits needed |
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

Person C steps 1 and 2 were requested. Step 1's repository inspection is complete. Step 2's proposal/examples/seams are documented and ready for A/B review, but shared agreement is not complete: the checkout has no application scaffold or executable shared schema, and no A/B adoption evidence. Once A records the bootstrap layout/adopted contracts and B confirms renderable states, map them to actual exports and update this status. The existing docs branch is not an agreed implementation branch; A should name the app baseline before C code starts. C-01's live capability proof can proceed independently only when requested and secure Groq access is available.

Suggested future branch: `codex/ai-workflows`, based on A's agreed baseline. Current planning files were created on the existing `docs/rules-and-team-split` branch; no branch switch or new commit occurred. Inspect dirty work and isolate C files before implementing.

## Checks actually completed

This task: read-only Git/remote/status/log/revision checks; repository file/config inventory; inspected PRD sections 6–8, team ownership/workflow, Person C plan/runbook/handoff; read spec-kit-planning, codebase-design and TDD seam/test/mocking guidance; checked installed Node/npm/pnpm/Bun/Python/Git versions. Documentation edits are recorded separately from these inspections. No test suite/build/lint/typecheck exists in the repo; none was run. No live model, app integration, browser, persistence, cloud or deployment check was run.

## Open dependencies and cautions

- Account/model access, exact quota, image caps, host timeout and bootstrap dependencies are unverified.
- Shared interface details are proposals until A adopts them; B must confirm rendering needs.
- Independent reserved datasets/labels and live request budget must be coordinated early.
- Bound all retries, tool loops, context and request duration. Do not combine schema-output and tool modes without verified support.
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

## Entry template for later work

Date/time; C task/status; files changed; PRD/RQ criteria addressed; baseline/schema/model/prompt versions; checks actually run and result counts; integration handoff to A/B; known issues; next ready task. Redact credentials and personal financial data. Append only C's entry to the shared root handoff and leave its summary/next-action sections to A.
