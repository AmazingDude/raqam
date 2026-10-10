# C2 handoff — matching, tools and assistant

**Current integration status (10 October 2026, latest main):** Assistant provider, four scoped read-only tools, bounded loop, fact registry, endpoint and UI are integrated; focused assistant checks pass 29/29. Match candidate generation/review is integrated with bounded provider-backed semantic evidence, strict candidate/evidence validation and stale-snapshot fencing; signed-in and live quality acceptance remain open. Signed-in cross-account/reload and reserved evaluation remain open; formal C2 interface acknowledgement is still unrecorded.

**Owner:** second AI contributor / C2; personal name pending. **Shared branch:** `codex/ai-two-person`. **Updated:** 10 October 2026, PKT.
Read [split/ownership](TWO_PERSON_EXECUTION.md), [original steps](IMPLEMENTATION_STEPS.md), [plan](PERSON_C_PLAN.md), [combined status](handoff.md), [contracts](contracts.md) and [C1 handoff](C1_HANDOFF.md). C2 edits this file; C1 consolidates shared documents.

## Assigned work

| Steps | State | Exact dependency / next action |
| --- | --- | --- |
| 14 | implemented; local acceptance checks pass | Fresh `origin/main` has the four actual authenticated read functions and canonical argument schemas. Added request-local validation of allowlisted numeric facts, evidence/scope/source bounds, unique opaque IDs and trace references. Public fact/snapshot/provider metadata now validates against the exact response. Hosted isolation and full product acceptance remain with A/B. |
| 15–16 | locally verified; integrated gates remain open | Existing engine provides sequential allowlisted dispatch, deduplication, a 3-round/4-execution cap, deterministic code-rendered numeric text and citation checks; the fact registry now binds known numeric values to verified results. Assistant API/fact tests pass. Provider revision and signed-in result/source UI evaluation remain pending. |
| 11–12 | locally implemented; live/hosted acceptance open | Provider-backed semantic candidate comparison uses the adopted bounded text-proposal interface, validates full candidate IDs/evidence and stale versions, and abstains on ties/invalid output. Eight focused matcher tests pass; live model quality and signed-in persistence/reload remain pending. |
| 13 | in progress; full acceptance pending | Fresh A2 match route/listing and B live review controls now exist and invoke the atomic review RPC. Verify only after step 12 and managed two-account persistence/reload/account-switch evidence; local PGlite checks are not a substitute. |
| 17 | in_review | Assistant implementation and A2 wiring are integrated; hosted end-to-end checks and reserved evaluation remain open. |
| 18 | todo | Own cross-cutting public-interface AI tests/report, then request C1 fixes in its files; A/B prove deployed security/session behavior. |
| 19 | todo | Own authorized-input runner/evaluation report; C1 schedules live quota; A/B independently score reserved answers. |
| 20 | todo | Provide matching/assistant evidence and own-file cleanup/checks to C1; participate in actual release smoke/demo. |

## Requests and acknowledgements

- Provider seam adoption/revision: pending C1/A; the server assistant still uses the accepted Groq provider path, but this task did not revise provider configuration.
- Four tools are implemented as authenticated A functions. A adopted the bounded numeric fact metadata in `docs/raqam/CONTRACTS.md` for this integration; richer template-selected answer blocks remain unadopted.
- Requests for C1 config/index/provider/support/docs changes: none yet. Record precise requested symbols, consumers and acceptance checks here; never edit those files yourself.

## Session log

- 10 October 2026: two-person ownership plan created; all original implementation scope/gates retained. No runtime code or tests added. No live request, app check or deployment performed by this planning task.
- 10 October 2026: implemented C2 Step 14's local validation/fact-registry slice in the fresh-main integration. Exact source and A2 interface revisions are recorded in root `handoff.md`; 34 backend/security tests and strict typecheck pass. Steps 13 and 15–17 remain open for their managed/live prerequisites; no C1/C4 files changed and no live provider/account request was made.

## Entry format

Requested steps/sub-items; state; base/tested revision; changed owned files; accepted provider/contracts and model/prompt versions; focused checks/results; live versus scripted evidence; requests for C1/A/B; reviewer; next ready step. Reserved expected answers never enter app/model context.
