# C2 steps 14–16: local implementation and integration handoff

10 October 2026, PKT. Base: `main` at `5fefc7e`, actually pulled from origin. This is an uncommitted working-tree result. No commit, push, deployment, dependency install, shared contract change, A/B implementation change or frontend archive/reference edit is part of this task.

**Publication follow-up, 10 October:** the user subsequently requested publishing the tested implementation first and waiting on step 13. Fast-forwarded to `7de774e` without overlapping local files. Restored pinned installed dependencies with `npm install --ignore-scripts --package-lock=false`; package versions/manifest/lockfile are unchanged. The 121 focused checks, strict typecheck and production build now pass. This supersedes the missing-install check blocker below. Publishing C-owned module work does not close live integration/model-quality gates; step 13 remains pending at the user's direction. The Ask Raqam functionality upgrade is a separate follow-up and is not included in this module commit.

The full backend/security suite additionally passes **154/154**, zero skipped/cancelled. Typecheck/build used the shared working tree, including unrelated frontend work that is not part of the C publication. Newly supplied provider credentials/settings are private follow-up configuration, excluded from Git.

## Acceptance and limits

| Step | Evidence | Remaining gate |
| --- | --- | --- |
| 14 | `tools.ts` registers exactly the four accepted names, imports A's argument/result contracts and consumes A's `ScopedAssistantResultTools`. Strict JSON, filters, dates, limits, bounded IDs/cursors, known evidence IDs, returned scope, exact totals, source locators, history and snapshot checks precede fact use. Public traces contain only allowlisted filters/counts, fact IDs, completion state and reuse count. | A's authenticated route must choose/adopt this boundary; synthetic readers do not establish deployed ownership isolation. |
| 15 | `answerBookkeepingQuestion` has request-local messages, registry, cache, protocol identities and trace; sequential execution; at most three model rounds/four actual reads; two provider attempts per operation and three overall; final round disables tools; an absolute deadline capped at 50 seconds; cancellation and late-result/budget guards. A failed tool/provider or invalid answer returns bounded verified evidence with an explicit partial/unavailable notice. | A's existing engine remains the current route implementation. This C operation is independently testable and ready for adoption, not a second production pipeline. No live model behavior measured. |
| 16 | Model output can select opaque registered fact/reference IDs and fixed templates only. Code renders exact money with A's formatter. Facts carry source IDs, reporting scope, completeness and snapshots. Every block checks observation membership, metric and snapshot; source headings preserve accepted/pending status. Arbitrary prose, invented amounts/counts, HTML, URLs, unsupported conclusions and foreign evidence cannot become rendered answers. | Rich blocks/statuses are not in A's accepted public `AssistantResponse`. A must adopt/map this C outcome and B must render its scope, notices and authorized source references. Full step-16 integration acceptance stays open. |

The original PRD F07, Person C plan section 9 and runbook steps 14–16 remain the baseline. No mutation, unrestricted query, browsing or persistent agent memory was added. No framework was installed. Retained TypeScript/security and agent concepts guidance was used within those constraints.

## Actual contract mapping

- Arguments: `src/lib/contracts/schemas.ts::assistantToolSchemas`.
- Canonical results: `src/lib/contracts/assistant.ts::parseAssistantToolResult` and the four result schemas.
- Authenticated reads: `src/lib/server/assistant/tools.ts::createScopedAssistantResultTools`. C has only the result closures; no Supabase client, owner selection or storage resolver.
- Provider: C1's existing `GroqProvider.requestToolConversation`, with its accepted messages, versions, metadata, AbortSignal and allowance interface. Runtime provider imports remain A/C1-owned; C imports provider types only and injects the actual implementation.
- Financial formatting: A's `formatAmount` and canonical exact paisa strings. Complete cash summaries come only from A's complete summary result. Partial list pages register only returned-page counts, never cash aggregates.
- Registry: the existing C2 `AssistantFactRegistry`; its existing two-argument API remains compatible. Optional validated arguments preserve date filters. Failed registration no longer publishes a snapshot, returned facts are detached, and capped source references honestly report `sourcesComplete: false` even when the backend's full summary is complete.
- Answer blocks/outcome: C-local `answerProposalSchema` and `AssistantOutcome`. These are proposed at the C module seam; no shared schema or authenticated route was changed.

For adoption, A calls the C operation after its existing session/workspace authorization. Prefer the tools factory form so A's actual readers receive the identical request signal/deadline:

```ts
const outcome = await answerBookkeepingQuestion(
  { question, workspaceId: workspace.id, requestId, deadlineAtMs, signal },
  {
    provider,
    tools: context => createScopedAssistantResultTools(session, workspace, {
      deadlineAt: context.deadlineAtMs, signal: context.signal,
    }),
  },
);
```

This is an integration example, not newly wired production code. A retains operation/rate-limit ownership; C does not create a second reservation. A/B must settle the public block contract before using this outcome. Existing route behavior was left intact.

## Evidence and snapshot semantics

Model observations contain registered metric/fact IDs, record IDs, opaque reference IDs and reviewed status enums. They exclude monetary dumps, original descriptions, document text, prompts, private URLs and source paths. This limits the initial assistant to deterministic cash/review/source questions; it does not perform free-form semantic document investigation or claim model quality.

Fact blocks obtain values directly from the registry; the model cannot supply a value or label. A summary fact includes contributing record IDs up to the accepted public fact cap, full source count, full-scope snapshot and explicit date/workspace scope. More than 50 contributors does not turn the backend's exact total into a page total; it does make the displayed source list incomplete. Original source locators are returned only for records actually read by list/queue/evidence tools. A/B open sources through the authorized viewer, never a generated URL.

Single-source tokens are compared only for the same full source kind. Combined evidence tokens include selected review histories, so different selections are not falsely treated as changed whole-workspace snapshots. Repeated overlapping records/history are compared for changed contents. Detected staleness discards financial facts and requests a refresh. These checks do **not** establish one atomic database snapshot across separately read cashbook/documents/history or detect an unrelated concurrent change outside the supplied snapshots. A owns any stronger database consistency guarantee.

## Checks

Final result: **121/121 pass**, zero failed/skipped/cancelled (45 new C answer/assistant, 44 preserved matching, 27 existing A assistant/fact/scoped reader and five embedded proposal-review checks). The focused command includes C answer/assistant/matching tests and existing A fact, assistant API, scoped cashbook/security and embedded proposal-review regressions:

```powershell
node --conditions=react-server --test --test-isolation=none tests/ai/answer.test.ts tests/ai/assistant.test.ts tests/ai/matching.test.ts tests/backend/assistant-fact-registry.test.ts tests/backend/assistant-api.test.ts tests/backend/services-assistant-cashbook.test.ts tests/security/services-assistant-scope.test.ts tests/security/proposal-review-database.test.ts
```

These are scripted deterministic/provider-boundary checks. The five proposal-review checks execute A's real migrations/RPC/index definitions in PGlite and cover persisted accept/change/reject/history/export/cash and rollback invariants. They are not managed concurrent-session or deployed RLS evidence. A's earlier hosted two-account/race evidence remains a separate team record and was not rerun here.

`npm run typecheck`: route generation succeeds; project check fails because the current install lacks `groq-sdk`, `xlsx`, `pdfjs-dist`, `pdf-parse`, with consequent errors in their existing consumers. No dependency restoration was authorized. `npm run build`: sandbox attempt hit Windows path-access denial; approved retry reached compilation and failed on those same four missing packages. Lint has no package script. No clean full-project type/build result or full `npm test` result is claimed.

## Files changed in this assistant slice

- Added `src/lib/ai/tools.ts`, `assistant.ts`, `answer.ts`, `prompts/assistant.ts`.
- Updated `src/lib/ai/fact-registry.ts` while preserving its existing API.
- Added `tests/ai/answer.test.ts`, `assistant.test.ts`, `fixtures/assistant.ts`.
- Added this report; refreshed C2_HANDOFF.md, docs/ai/handoff.md and historical-status banners in C2_READINESS.md/C2_TRACK_DEPENDENCIES.md.

Previously staged matching source/tests/integration docs remain preserved separately. Concurrent marketing/UI planning changes are outside this task and were not edited or restored by C2.

## Earlier gates and next work by track

Step 13's absent-route/UI blocker is cleared in the pulled revision: A has match generation/list/review and B has candidate comparison/accept/change/reject controls. A browser attempt to open localhost:3000 returned connection refused. Consequently no current signed-in approval/rejection/reload/stale UI journey, unchanged-cash browser proof or managed concurrency run was completed. Restore the pinned runtime and run that journey with A/B.

A's current `semanticMatchCandidateSnapshot` and B's choices filter to outflows, while preserved C matching retains both compatible directions. A normalizes references before agreement, while preserved C's contradiction rule uses exact supplied references. A's tests explicitly assert those current policies. These are integration decisions to resolve against the user's instruction to retain all legitimate competing IDs; they are not silently fixed in A/B-owned modules or claimed equivalent to C's conservative policy.

- A: restore pinned dependencies; adopt/map C's block contract and select one orchestration owner; bind its authenticated factory to the request deadline/signal; resolve candidate direction/reference policy; own managed atomicity/concurrency/ownership checks and hosted migration verification.
- B: render adopted blocks, exact scopes, partial/stale/unavailable states and authorized source locators; verify signed-in matching/assistant journeys, reload and account switching once A's contract is adopted.
- C1: supply verified model configuration/access and coordinate bounded live requests. No key/model/provider configuration was changed here.
- C2: review this actual diff, resolve review findings, then participate in steps 13/17 when A/B runtime and contract gates are ready. Steps 17–20 were not implemented in this task.

## GPT-6.1 Sol review handoff

Review the actual working-tree diff against `5fefc7e`, including untracked files (`git diff` alone omits them). Focus on `tools.ts`, `assistant.ts`, `answer.ts`, the small fact-registry delta and their tests. Confirm exact financial scope, all-block membership checks, source/history validation, partial semantics, snapshot limitations, sequential deduplication, two-attempt/three-round/four-read budgets, late cancellation and failure preservation. Verify no A/B/shared contract/secret/archive changes were introduced. Keep existing staged matching/readiness files and unrelated frontend planning/generated files separate from this new assistant slice. Do not infer adoption or live quality from the scripted provider. No commit, push or deployment is authorized.
