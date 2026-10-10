# C2 handoff — matching, tools and assistant

**Owner:** second AI contributor / C2; personal name pending. **Shared branch:** `codex/ai-two-person`. **Updated:** 10 October 2026, PKT.
Read [split/ownership](TWO_PERSON_EXECUTION.md), [original steps](IMPLEMENTATION_STEPS.md), [plan](PERSON_C_PLAN.md), [combined status](handoff.md), [contracts](contracts.md) and [C1 handoff](C1_HANDOFF.md). C2 edits this file; C1 consolidates shared documents.

## Assigned work

| Steps | State | Exact dependency / next action |
| --- | --- | --- |
| 14 | blocked | No adopted tool/result schemas or A's actual four scoped read functions. Once these exist, this can overlap C1's provider/OCR work. |
| 15–16 | todo | Wait for 4–5 and 14; acknowledge C1's accepted provider revision, then bounded loop and verified fact/citation blocks. |
| 11–12 | todo | Step 11 waits for integrated OCR step 8 and reviewed snapshots; step 12 also waits for 4–5. Do not bypass step 8 using fixture-only matching. |
| 13 | todo | Wait for 12, A atomic approvals/concurrency checks and B match UI. |
| 17 | todo | Own assistant items 1–4 and c2-integration.md; C1 coordinates combined items 5–6. Original predecessors 8/10/13/16 remain required. |
| 18 | todo | Own cross-cutting public-interface AI tests/report, then request C1 fixes in its files; A/B prove deployed security/session behavior. |
| 19 | todo | Own authorized-input runner/evaluation report; C1 schedules live quota; A/B independently score reserved answers. |
| 20 | todo | Provide matching/assistant evidence and own-file cleanup/checks to C1; participate in actual release smoke/demo. |

## Requests and acknowledgements

- Provider seam adoption/revision: pending C1/A; no current production import assumed.
- Four tools and fact/answer contract: pending A/B adoption.
- Requests for C1 config/index/provider/support/docs changes: none yet. Record precise requested symbols, consumers and acceptance checks here; never edit those files yourself.

## Session log

- 10 October 2026: two-person ownership plan created; all original implementation scope/gates retained. No runtime code or tests added. No live request, app check or deployment performed by this planning task.

## Entry format

Requested steps/sub-items; state; base/tested revision; changed owned files; accepted provider/contracts and model/prompt versions; focused checks/results; live versus scripted evidence; requests for C1/A/B; reviewer; next ready step. Reserved expected answers never enter app/model context.
