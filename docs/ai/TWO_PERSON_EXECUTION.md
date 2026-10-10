# Person C — two-contributor execution of steps 4–20

**Date:** 10 October 2026, PKT. **Shared branch:** `codex/ai-two-person`.
**C1:** the user. **C2:** the user's second AI contributor; personal name to record in C2's handoff.
**Purpose:** allocate the existing implementation steps to two people with exclusive file ownership. This is a coordination overlay, not a replacement implementation plan.

Read [AGENTS](../../AGENTS.md), [PRD](../../PRD.md), [team assignments](../../TEAM_TASKS.md), [team workflow](../../TEAM_WORKFLOW.md), [Person C plan](PERSON_C_PLAN.md), [original implementation steps](IMPLEMENTATION_STEPS.md), [contracts](contracts.md), [combined C handoff](handoff.md), this document, and your own handoff before code changes.

## 1. Authority and unchanged scope

- The PRD, original Person C plan, numbered steps, acceptance criteria, dependency graph, financial invariants and release gates remain unchanged. The step numbers below reference those documents; implement every instruction in the original requested step.
- Both contributors work inside Person C's AI lane. They do not replace project Person A/platform or Person B/UI. A keeps shared schemas, exact helpers, dependencies/root configuration, auth, persistence, routes, approvals, migrations, project integration and deployment. B keeps UI/client code and browser/demo responsibilities.
- This overlay assigns internal C ownership and the shared C branch publication process. It does not approve proposed shared contracts, dependency pins or runtime capabilities.
- Current baseline is `f95ddfc` on fetched `origin/main`. It contains planning/reference documents, no app manifest/runner. Step 2/C-00 adoption is in review; step 3/C-01 live proof is blocked by absent approved runner and empty Groq configuration. See [feasibility](feasibility.md). Do not mark these gates passed because a second contributor joined.
- The original approximately 15–17-hour effort estimate remains an estimate, not a new two-person deadline or promise of halving time. Work on the next genuinely unblocked task; retain all four core AI features and the existing stretch gate.

## 2. Feature lanes and the shared seam

| Contributor | Feature ownership | Delivery responsibility |
| --- | --- | --- |
| C1 — you | Provider/configuration, bounded provider failures, OCR/extraction/cache identity, categories | Original steps 4–10; provider seam consumed by C2; live quota coordination; combined C handoff and C-branch publication |
| C2 — second contributor | Deterministic/semantic matching, four read-only tools, fact registry, bounded assistant and grounded answers | Original steps 11–16; cross-cutting checks and evaluation harness/report; assistant portion of integration |
| Both, one named editor per file | Combined acceptance, failures, evaluation and release | Original steps 17–20 subdivided below; A/B keep independent scoring, real access/atomicity checks and release ownership |

C1 owns the existing proposed provider's three modes: image extraction, text proposal and local-tool conversation. C2 consumes that interface through injected dependencies. Both import A's canonical domain types; neither invents another shared money/error/tool schema.

Before runtime feature work, record A's actual baseline/runtime/import map in contracts.md and freeze the provider seam: request modes, raw unknown response envelope, safe metadata, model/settings and version inputs, deadline/AbortSignal handling, error shape, retry/repair budget consumption and tool-call IDs. C1 records it; C2 acknowledges the exact revision in C2_HANDOFF.md. Proposed names remain proposals until adopted. Provider tests and feature tests replace the external adapter at this seam; feature logic stays real.

## 3. Exclusive file ownership

These paths follow the original proposed layout. They become implementation paths only after A confirms the scaffold. If A chooses equivalent paths, C1 records the mapping here before either creates runtime files. Do not pre-create empty files or a second app.

| Owner | Exclusive paths | Rule for the other contributor |
| --- | --- | --- |
| C1 | `src/lib/ai/provider.ts`, `src/lib/ai/config.ts`, `src/lib/ai/index.ts`, `src/lib/ai/validation.ts` | Import the adopted public interface; request provider/config/export changes from C1 |
| C1 | `src/lib/ai/extraction.ts`, `src/lib/ai/categories.ts`, `src/lib/ai/prompts/extraction.ts`, `src/lib/ai/prompts/categories.ts` | Review/report defects; C1 edits implementation and prompt versions |
| C1 | `src/lib/ai/identity.ts`, `src/lib/ai/budget.ts` only if justified by the original steps | Shared identity/budget helpers have one editor; C2 requests changes, never copies an alternate retry/identity implementation |
| C1 | `tests/ai/provider.test.ts`, `tests/ai/extraction.test.ts`, `tests/ai/categories.test.ts` | C1 owns edits, including regression fixes discovered by C2 |
| C1 | `tests/ai/support/**`, `tests/ai/fixtures/ocr/**`, `tests/ai/fixtures/categories/**`, `tests/ai/live/feasibility.ts` and its development receipt inputs | Shared test adapter/helpers have one owner; no reserved answers in these paths |
| C2 | `src/lib/ai/matching.ts`, `src/lib/ai/prompts/matching.ts`, `src/lib/ai/tools.ts`, `src/lib/ai/assistant.ts`, `src/lib/ai/answer.ts`, `src/lib/ai/prompts/assistant.ts` | Review/report defects; C2 edits feature code and prompt versions |
| C2 | `tests/ai/matching.test.ts`, `tests/ai/tools.test.ts`, `tests/ai/assistant.test.ts`, `tests/ai/answer.test.ts`, `tests/ai/failure-isolation.test.ts` | Cross-cutting tests exercise public interfaces without editing C1 tests/code |
| C2 | `tests/ai/fixtures/matching/**`, `tests/ai/fixtures/assistant/**`, `tests/ai/live-evaluation.ts` | Own development inputs and authorized-input evaluation runner; never copy reserved labels into application context |
| C1 | `docs/ai/C1_HANDOFF.md`, `docs/ai/handoff.md`, `docs/ai/contracts.md`, `docs/ai/examples.md`, `docs/ai/baseline.md`, `docs/ai/feasibility.md`, `docs/ai/integration.md`, `docs/ai/release.md`, `docs/ai/model-manifest.md`, `docs/ai/TWO_PERSON_EXECUTION.md` | C2 writes requests/evidence in its own handoff or c2-integration.md; C1 consolidates shared documents |
| C2 | `docs/ai/C2_HANDOFF.md`, `docs/ai/c2-integration.md`, `docs/ai/evaluation.md` | C1 supplies its evidence via its own handoff; C2 assembles evaluation data with A/B's independent scores |
| C1 append only | Root `handoff.md`, C's own session entries | A still owns root summary/next action; C2 requests a C1 append |
| Existing A/B owners | Every manifest/lockfile/root config, shared domain schema/helper, API route, auth/storage/database module, UI/client module, global styling and browser suite | Neither C1 nor C2 edits these without an explicit recorded handoff |

Other AI files are unassigned until C1 records a justified path and one owner in this overlay. New files must fit an existing requested step. Renaming/moving another owner's path also requires a recorded transfer. File maps do not authorize generic utilities, frameworks, vector stores or new services.

Prompt versions live with the prompt's owner. C1's config/manifest references the approved exported versions; C2 requests registration updates rather than editing config or keeping a second conflicting manifest. Feature-specific validators remain in their owned modules unless A's canonical schemas or C1's existing shared validator already provide them.

## 4. Step-by-step assignment

The original step remains the coding specification. The rows below add only who edits, where progress/evidence goes and what the next handoff needs. All step-specific skills and acceptance checks in IMPLEMENTATION_STEPS.md still apply.

| Original step | Editor / accountable owner | Files / evidence | Required gate and handoff |
| --- | --- | --- | --- |
| 4 — server-only provider/config | C1 | provider.ts, config.ts, index.ts, validation.ts as needed; provider.test.ts; C1_HANDOFF.md | Steps 2 and 3 plus A-approved runtime/dependencies. Freeze the three-mode seam; C2 records consumption acknowledgement. Compile and scripted envelope evidence, no import-time inference. |
| 5 — bounded failures/deadlines/retries | C1 | provider/config and justified budget helper; provider.test.ts | Step 4. Demonstrate one retry owner, cancellation, terminal errors, total attempt/repair caps, safe telemetry and long-429 behavior. Hand C2 the accepted error/budget semantics. |
| 6 — reviewable extraction | C1 | extraction.ts, prompts/extraction.ts; extraction.test.ts; OCR fixtures | Steps 2, 4, 5 and A's exact helpers. Preserve unknowns/raw fields and return reviewable proposals without cash mutations. Supply B compatible outputs through examples.md. |
| 7 — OCR cache/rerun identity | C1 | extraction/identity helper and extraction tests | Step 6 plus A's adopted durable reservation/cache/snapshot interface. Preserve corrections; A owns persistence and stale publication. Hand over observed cache/version behavior. |
| 8 — integrated receipt review | C1 leads with A/B; C2 peer-checks | C1 fixes OCR/provider; integration.md; C2 notes in C2_HANDOFF.md | Steps 6–7, A's upload/private storage/review persistence, B's screen. Original live/reload/cache/unknown/unchanged-cash criteria must pass before step 11. |
| 9 — categories | C1 | categories.ts, prompts/categories.ts; categories.test.ts; category fixtures | Steps 2, 4, 5 plus valid transactions/accepted guide. All eligible IDs covered or explicitly unresolved/skipped; no accepted-decision replacement. |
| 10 — category review/reruns | C1 leads with A/B | C1 category fixes/tests; integration.md | Step 9 plus A review and B controls. Record persisted decisions and authoritative unchanged cash totals/reconciled category remainder. |
| 11 — deterministic matching | C2 | matching.ts; matching.test.ts; matching fixtures | Step 8 passed and reviewed snapshots available. Exact compatibility/full capped pool/allocation features; no tolerance/FX/split assumption. |
| 12 — semantic matching/ambiguity | C2 | matching.ts, prompts/matching.ts; matching.test.ts | Step 11 plus steps 4–5 provider seam. Validate candidate/evidence IDs, corroboration and competing candidates; no fabricated uniqueness or approval. |
| 13 — match integration/atomicity | C2 leads with A/B | C2 matching fixes/tests; c2-integration.md | Step 12, A atomic approval and B candidate UI. A supplies actual concurrency/ownership results; C2 reports them without claiming fake race checks. C1 links accepted evidence in integration.md. |
| 14 — scoped tools/facts | C2 | tools.ts and registry in answer.ts; tools.test.ts / answer.test.ts | Step 2 adopted plus A's four real scoped read functions. This may overlap C1's 4–10 work once its own inputs exist. Validate allowlist/args/results/fact origins; no privileged DB client. |
| 15 — bounded assistant loop | C2 | assistant.ts, prompts/assistant.ts; assistant.test.ts | Steps 4, 5, 14. Preserve IDs, three total model rounds/four tool executions, no separate unbudgeted final call; only actual read operations. |
| 16 — fact-bound answers | C2 | answer.ts, assistant finalization; answer/assistant tests; examples in C2_HANDOFF.md | Steps 14–15. Exact financial values from registered facts; valid scoped citations, template wording, partial/fallback states. C1 copies adopted B examples into examples.md. |
| 17 — integrated assistant/full journey | C2 owns assistant portion; C1 owns combined acceptance record | C2 checks original items 1–4 in c2-integration.md; C1 coordinates items 5–6 in integration.md; each fixes own modules | Steps 8, 10, 13, 16 and deployed A/B core. Jointly test full import/review/summary/assistant/export/reload flow; C1 declares overall step status only when all original acceptance evidence exists. |
| 18 — cross-cutting failure/isolation | C2 owns AI test matrix/report; C1 owns provider/OCR/category repairs | C2 failure-isolation.test.ts and c2-integration.md; C1 updates only its modules/tests and combined integration record | Runtime features ready. C2 checks original items 1–3 and C-side 4/6; A tests real two-user routes/persistence/atomicity, B tests session UI/bundles. Both verify item 7's evidence distinction. One failing requirement keeps the step open. |
| 19 — independent evaluation | C2 owns runner/report; C1 owns live schedule/config manifest | C2 live-evaluation.ts and evaluation.md; C1 model-manifest.md and feasibility/quota notes | Steps 17–18, frozen candidate and A/B's independent labels. C2 prepares authorized-input runner and raw evidence; C1 reserves quota and schedules calls; A/B score all features independently. Neither AI contributor claims independent self-grading. |
| 20 — shipping/demo handoff | C1 owns final C handoff/release record; C2 supplies matching/assistant evidence | C1 release.md, combined handoff/model manifest; C2 own handoff and c2-integration.md; each cleans/fixes only their paths | Step 19 plus A release/deployment and B demo. Both run relevant checks; C1 coordinates combined checks, cloud smoke, quota and attribution. A deploys/merges main; no release claim without actual evidence. |

Steps 17–20 are one original step each, with disjoint sub-assignments. C1 aggregates statuses for 17/20; C2 supplies the consolidated report for 18/19 and C1 reflects it in the combined handoff. A/B-dependent acceptance always remains pending until A/B provide actual checks.

## 5. Dependency waves and useful parallel work

1. **Readiness:** C1 coordinates A's baseline/import map and secure step 3 proof; C2 reviews the tool/result/answer contracts with A/B. Record proposals distinctly from adoption. No runtime feature code is currently ready in this checkout.
2. **Provider foundation and tools:** after adoption, C1 implements 4 then 5; C2 can implement 14 when A's scoped read functions exist. Step 14 does not waive step 2 or real-tool prerequisites. While tools are missing, C2 can prepare a review in its own handoff; no fake integrated acceptance.
3. **Extraction and assistant:** after 4–5, C1 implements 6 then 7 then verifies 8 with A/B; C2 implements 15 then 16 after 14. They touch separate modules/tests and consume the same frozen provider seam.
4. **Categories and matching:** C1 implements 9 then verifies 10. After step 8 actually passes, C2 implements 11 then 12 then verifies 13. C2 chooses its next ready matching/assistant slice based on A/B availability; it cannot work on both at once or skip prerequisites.
5. **Combined product:** original 17 waits for 8, 10, 13, 16. Then complete the cross-cutting 18 checks, freeze and independently evaluate at 19, and ship the verified C contribution at 20 through A/B's release process.

Do not move step 11 ahead of integrated OCR merely because fixture matching is possible. Do not call steps 8/10/13/17 complete with mocks. Prompt tuning on reserved cases requires honest disclosure and fresh independent final cases per step 19.

## 6. How two people use the shared branch without simultaneous edits

The shared branch is `codex/ai-two-person`. It is the common base and destination for both people's work. Each person uses a separate clone/worktree; never two agents or editors in the same directory.

**Recommended workflow:** create a short personal task branch from the latest shared branch, such as `codex/c1-step-04-05` or `codex/c2-step-14`. C1 coordinates review and publishes completed C slices into the shared branch sequentially. A still owns integration to main and project release. A code agent does not commit/push merely because this plan describes how humans publish.

Fresh checkout example (local-only secrets must be configured privately on each machine):

```bash
git clone https://github.com/AmazingDude/raqam.git
git -C raqam switch --track origin/codex/ai-two-person
```

From a clean, existing clone:

```bash
git fetch origin
git switch --track origin/codex/ai-two-person
```

If the local branch already exists, use `git switch codex/ai-two-person`. Inspect dirty state first; do not reset/clean/stash another person's work to follow these examples.

Before a personal task branch starts, fetch and fast-forward your clean shared branch, then branch from it. Before a task is integrated, bring the current shared baseline into the task branch without force-pushing another person's history, resolve any interface drift with the owner, run the requested checks, and record the exact tested revision. C1 publishes one reviewed slice at a time, reruns the combined smoke as applicable, and tells the other person the new revision. Both update from that revision before claiming a dependent task.

**If both humans insist on committing directly to the same branch:** use separate clones, agreed exclusive paths, and an explicit publication turn. The other person's working tree may be dirty during a turn; it must not be pulled automatically. Before your turn, integrate the latest remote in your own checkout, run checks, and publish a small reviewed commit. A rejected push means the remote advanced: fetch and reconcile normally; never force-push. Task branches avoid this unnecessary contention.

Exclusive paths prevent planned same-file conflicts; a single publisher prevents concurrent branch updates. They do not guarantee semantic compatibility if provider contracts change. Review the seam and run combined checks after integration.

## 7. Claims, reviews, transfers and evidence

- During task coding, C1 records progress in C1_HANDOFF.md and C2 in C2_HANDOFF.md. During C-branch integration, C1 alone consolidates docs/ai/handoff.md and C-owned root session entries. Neither rewrites the other's handoff row during ordinary work.
- Before coding, record requested steps, ownership, base revision, planned files, prerequisites and actual commands in your own handoff. Use `todo`, `in_progress`, `in_review`, `blocked`, `done` as defined in the team workflow.
- The other contributor reviews your actual diff and relevant test evidence without editing your source. Provider/OCR/category defects go to C1; matching/assistant defects go to C2. Cross-feature fixes are two separate reviewed diffs, not one person editing all files.
- A file transfer requires original owner acknowledgement and C1's ownership-map update before the new editor starts. No concurrent rename, global formatting pass, broad replacement or shared helper extraction.
- A provider/seam change requires C2 consumer review, A agreement if a public schema/root dependency changes, updated interface/version record, and checks of both lanes. C2 never adds another provider client or retry loop as a workaround.
- C1 coordinates all live requests across both people. Ordinary tests use scripted external failures, not Groq. Live evaluation is opt-in, separately labeled and scheduled against observed limits with demo reserve.
- Keep expected reserved answers under A/B control. C2's live runner accepts inputs only; evaluation scores enter the report through A/B, not model context. Review after coding is not independent semantic evaluation.
- Neither edits/reformats the original PRD, PERSON_C_PLAN.md, IMPLEMENTATION_STEPS.md or TEAM_TASKS/TEAM_WORKFLOW merely to fit this split. Scope changes require the user's decision. All archived frontend sources remain preserved.

## 8. Agent prompts

### C1 prompt — provider foundation first

> I am C1. Implement Person C steps 4 and 5 from docs/ai/IMPLEMENTATION_STEPS.md, following docs/ai/TWO_PERSON_EXECUTION.md. First read AGENTS.md, PRD.md, TEAM_TASKS.md, TEAM_WORKFLOW.md, docs/ai/PERSON_C_PLAN.md, docs/ai/IMPLEMENTATION_STEPS.md, docs/ai/contracts.md, docs/ai/feasibility.md, docs/ai/handoff.md, and docs/ai/C1_HANDOFF.md. Inspect branch/status, accepted contracts, step 3 evidence and A-approved runtime/dependencies. Implement only requested steps in C1-owned files; preserve C2/A/B work and all references. Do not install packages or modify root configuration/shared schemas. If prerequisites are missing, record exact blockers and finish independent preparation without claiming live success. Apply the original skill/check requirements. Cross-check every original acceptance item and the frozen provider seam. Update only C1_HANDOFF.md; request shared-doc/export updates from their named owner where needed. Do not commit, push or deploy. Finish with changed files, real checks, failures/dependencies and a review handoff.

### C2 prompt — tools in parallel when their inputs exist

> I am C2. Implement Person C step 14 from docs/ai/IMPLEMENTATION_STEPS.md, following docs/ai/TWO_PERSON_EXECUTION.md. First read AGENTS.md, PRD.md, TEAM_TASKS.md, TEAM_WORKFLOW.md, docs/ai/PERSON_C_PLAN.md, docs/ai/IMPLEMENTATION_STEPS.md, docs/ai/contracts.md, docs/ai/handoff.md, docs/ai/C2_HANDOFF.md, and C1's provider interface evidence. Inspect branch/status and A's accepted tool schemas/functions and shared helpers. Implement only step 14 in C2-owned tools/answer/test files. Do not edit C1 provider/config/index/validation/test-support files, A/B modules or shared docs; request changes in C2_HANDOFF.md. Preserve references and unrelated work. If adopted contracts or actual scoped functions are missing, prepare independently and record the blocker; fake tool closures do not establish ownership isolation. Apply the original skill/check requirements and compare every acceptance item to the real implementation. Update only C2_HANDOFF.md. Do not commit, push or deploy. Finish with changed files, real checks, unresolved inputs and C1/A/B requests.

For later requests replace the step numbers only with those assigned to that contributor, read all named skills from those original steps, and keep the same path/evidence/publication rules. Steps 17–20 requests name the contributor's sub-assignment explicitly; they do not authorize taking over the other lane.
