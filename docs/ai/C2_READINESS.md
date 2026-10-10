# C2 readiness after syncing main

**Historical audit:** the `c0ea406` inventory below is superseded by [the `5fefc7e` assistant/matching acceptance report](C2_ASSISTANT_ACCEPTANCE.md). Match routes/live controls and the four tool contracts now exist. C steps 14–16 are locally implemented; rich-answer adoption and live integration acceptance remain open. Preserve this earlier audit as history.

**Inspected:** 10 October 2026, PKT; `main` / `origin/main` at `c0ea406`. **Scope:** pull latest changes and reassess stopped step 14 and earlier integration gates. No implementation restarted, dependency installed, hosted mutation, commit, push or deployment in this audit. The user now selects `main` for future pulls and pushes; earlier branch references below are historical.

## Sync and preservation

- Fast-forwarded local `main` to `origin/main`. Compared the new baseline with the previously imported backend `cf4b666`: 155 files changed, including C1 provider/extraction/categories, A document/review/assistant services and B client/UI work.
- Preserved the previous uncommitted backend merge and seven C2 files in retained stash `0aa1f22`. Restored only the seven C2 files onto main. Resolved the AI handoff conflict by retaining upstream C1 history and adding the current C2 status. The four matching source/test files are byte-identical to that stash.
- No frontend archive/reference changes occurred between the old backend and this main revision, or in C2's restored diff. No A/B modules, shared schemas or dependencies were edited by this audit.

## What has opened up

| Steps | Current readiness | Remaining acceptance gate / owner |
| --- | --- | --- |
| 7–8: extraction cache and receipt review | A's durable extraction/cache/history implementation and authenticated document/extraction routes now exist. C1's extraction module is present. Earlier absence of A adapters is resolved in source. | Team handoff still records migration 008 as awaiting hosted application. B's live documents screen uploads/views private sources but still says extraction is pending integration; field review is demo-only. Step 8 cannot pass until the actual signed-in OCR/correction/reload journey is wired and verified. |
| 9–10: categories | C1's category engine and A's proposal decision operations exist. | C1/A must settle category-guide version/provenance adoption. Authenticated category-generation/list routes and B's live proposal accept/change/reject controls are absent. Step 10 remains blocked. |
| 11–12: matching | The preserved C2 independent implementation still passes. C1's real text provider and A's versioned document/transaction detail contracts are now available, so provider/record adaptation can proceed once requested. | A/C2 must adopt a complete scoped candidate-pool and current active-allocation snapshot/version capability; the local C2 envelope remains provisional. A's match-generation/list service is absent and step 8 remains open. Keep 11–12 `in_review`; no live semantic quality result exists. |
| 13: integrated match review | A now supplies persisted, version-aware proposal decisions, audited review history and atomic active-match enforcement. The old absence-of-persistence blocker is resolved. | C2-to-A match generation/persistence mapping and B's live candidate comparison/confirm/reject controls remain absent. Actual UI-to-backend approval/rejection/reload/stale behavior cannot be verified yet. Step 13 remains `blocked`. |
| 14: scoped tools and fact registry | **Ready to resume C-owned implementation against A's actual four scoped capabilities.** B is not a prerequisite for this module. The prior missing-functions blocker is resolved. | Adopt typed observation/snapshot/completeness semantics with A; implement C's strict result/evidence validation, sequential dispatch boundaries, opaque request-local financial fact registry and sanitized trace. This audit implements none of those pieces. Full acceptance waits for the agreed metadata, not merely injected test readers. |

Original runbook dependencies and PRD acceptance gates remain in force. This is a readiness assessment, not completion of steps 7–14.

## Exact step 14 seam and gaps

- `src/lib/server/assistant/tools.ts` exports `createScopedAssistantTools(session, workspace, { deadlineAt, signal })`. It checks the session subject against the resolved workspace owner and closes over A's scoped cashbook, document and history reads. C must receive these bound capabilities, never create replacement database access or model-controlled ownership.
- `src/lib/server/assistant/full-tools.ts` exposes exactly `list_transactions`, `get_cash_summary`, `get_review_queue`, `get_record_evidence`. Accepted arguments are `assistantToolSchemas` from `src/lib/contracts/schemas.ts`. They already enforce bounded filters, dates, IDs, pagination and strict objects.
- `ToolObservation` currently has `text`, `records`, `citations`, `partial`, and optional `details: unknown`. It has no explicit versioned snapshot token or opaque per-fact IDs. Transaction-list details contain a cursor but no structured filtered-total count. Review queues expose totals; summary details expose deterministic exact totals and explicit date scope. These shapes need validation/adoption, not a guessed alternative contract.
- Cash summaries use A's complete capped request snapshot and exact helpers. C must never reconstruct a whole-scope summary from a page. Unresolved import-row counts have workspace scope even when cash totals have a date range.
- The document/history readers are separately cached/bounded reads, not a proven common database snapshot. History contains version/timestamp metadata, not prior/current decision payloads. Agree the supported consistency scope and evidence-history semantics with A before claiming the full plan contract is met.
- Existing `src/lib/server/assistant/engine.ts`, `/api/assistant` and B's assistant screen already provide an integrated bounded assistant with code-rendered observation text. This does not establish step 14's fact registry or automatically complete C's steps 15–16. Coordinate reuse with A; do not create a second investigation loop in this step.

## Matching adoption details

- Reuse C1's existing `requestTextProposal({ prompt, versions, schema }, context)` and request budget/deadline; do not create another SDK/provider. C2 currently exposes an injected ranking callback, not an adopted production provider adapter.
- A's `DocumentRecord` wraps `{ document, reviewVersion, schemaVersion, extractionFailure, extractionContext? }`; transaction detail wraps `{ transaction, reviewVersion }`. Reconcile these with the existing C2 `{ record, version }` envelope through an agreed adapter.
- `matchGenerationRequestSchema`, `matchPersistenceSchema`, `proposalBatchResultSchema` and `/api/reviews` exist. Persistence requires provenance and record versions; C2 outcomes also carry candidate coverage, ambiguity, evidence and stale state, which need an explicit A/B mapping. C returns proposals only; A persists and atomically approves.
- `docs/raqam/worklogs/A2_CASES.md` MATCH-04 explicitly records the missing complete pool/allocation seam. MATCH-02 mentions a “wrong direction” candidate; reconcile that wording with runbook step 11's rule to preserve legitimate directions and never infer direction from invoice/receipt type. Do not silently adopt a direction filter. B's current demo-only matcher filters to outflows; it is not the production contract.

## Verification and evidence limits

Fresh offline command:

```powershell
node --conditions=react-server --test --test-isolation=none tests/ai/matching.test.ts tests/backend/services-assistant-cashbook.test.ts tests/security/services-assistant-scope.test.ts tests/security/proposal-review-database.test.ts tests/backend/assistant-api.test.ts
```

**71/71 pass**, zero skipped/cancelled: 44 C2 matching cases; 4 cashbook tool cases; 8 assistant boundary cases; 10 scripted assistant API/engine cases; 5 embedded database proposal-review cases. Matching covers exact compatibility, duplicate-value competitors, missing fields, allocation exclusion, conflicting references, foreign IDs, stale versions and proposal purity. Embedded database checks exercise A's migrations/review operations; C's matching mocks do not establish database enforcement.

The upstream root handoff records **11/11 hosted two-account review groups**, including competing confirmations for the same transaction/document returning one success and one conflict, unchanged exact cash, and persisted review history; it also records **4/4 Storage mutation checks**. These are team-recorded results, not hosted reruns in this audit. No actual browser match-review journey or live semantic model evaluation ran here.

`npm run typecheck` **fails (exit 1)**: route type generation succeeds, but TypeScript reports missing `groq-sdk`, `pdfjs-dist` and `xlsx` modules, plus provider unknown/implicit-any errors while SDK types are unavailable. Dependency inspection confirms those three packages are absent from the pre-sync installation. Restore main's pinned dependencies and rerun before diagnosing any remaining type errors; no packages were installed here. Full-suite/build checks were not run with this incomplete installation. There is no configured lint script. Git whitespace checks pass and the handoff has no conflict markers. Historical green checks in `c2-integration.md` refer to its old baseline, not automatically to current main.

## Next ready task and review handoff

The requested actionable assignments by A1/A2/B/C1/C2 and the step completion gates are now listed in [C2_TRACK_DEPENDENCIES.md](C2_TRACK_DEPENDENCIES.md). This does not change the readiness statuses above or start implementation.

When implementation is requested, resume **step 14 only**, using A's existing bound tools and adopted metadata. Coordinate the result/snapshot/count/history contract with A; B can continue its UI independently. Matching snapshot and B match-review wiring remain separate blockers for step 13.

GPT-6.1 Sol: review `git diff HEAD` on `main` at `c0ea406`, especially restored `matching.ts`, its prompt and public tests, alongside this readiness report. Check candidate completeness, exact money/currency, original IDs/competitors, conservative ambiguity, evidence membership and stale protections. Distinguish the provisional matching envelope, A's existing assistant observation contract, offline tests, team-hosted evidence and missing UI integration. Do not approve step 13 or mark step 14 implemented from this audit. Preserve the safety stash and unrelated work; no commit, push or deployment is requested by this audit.
