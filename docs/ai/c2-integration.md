# C2 matching implementation and integration evidence

**Historical baseline report:** the implementation/checks below refer to backend `cf4b666`. Current `main` readiness and resolved/new dependencies are recorded in [C2_READINESS.md](C2_READINESS.md) at `c0ea406`; do not carry the old missing-provider/persistence blockers forward unchanged.

**Date:** 10 October 2026, PKT. **Scope:** steps 11–13, C-05 / RQ-07 / PRD F05, F06, F08.
**Checkout:** `codex/ai-two-person`, HEAD `75a4c61`, user-approved backend `cf4b666` merged **without a commit**. Frontend `origin/codex/raqam-frontend` inspected at `123c642`; not merged. No commit, push, deployment or hosted schema change.

## Status and acceptance evidence

| Step | State | Evidence and remaining gate |
| --- | --- | --- |
| 11 | in_review; independent implementation complete | Public `prepareMatchCandidates(unknown)` validates canonical records, reviewed fields, complete versioned pool/allocation envelope; exact comparisons; excludes active allocations; retains distinct IDs/directions and delayed dates. Shared snapshot capability/adoption and integrated OCR step 8 remain unavailable. |
| 12 | in_review; independent implementation complete | Public `proposeMatches(unknown, deps)` sends compatible candidates only, checks complete model coverage/IDs/field references/recommendation, keeps all competitors, abstains on ties/weakness/conflicts and rechecks snapshots after inference. Scripted responses only. C1 provider steps 4–5, live semantics and A/B envelope adoption are pending. |
| 13 | blocked; actual surfaces inspected | No production match workflow exists in this baseline. No UI approval/rejection/reload, persisted match, database race or matching ownership test has passed. See exact inventory and required joint checks below. |

This implements independent C functionality as explicitly requested; it does not bypass the original step 8 or provider gates. No feature is wired into a route or screen. Existing A/B code and frontend archives/reference members were preserved.

## Consumed contracts and provisional seam

- Canonical A records: `Transaction`, `SupportingDocument`, `AcceptedMatch` from `src/lib/contracts/index.ts` (v0.1).
- Canonical validators: `transactionSchema`, `documentFieldsSchema`, `sourceReferenceSchema`, `reviewStatusSchema` from `src/lib/contracts/schemas.ts`. Exact minor units are validated through A's `assertMinorUnits`; no floating-point money or independent parser. PKR-only transactions retain A's current currency restriction. A document in another explicit currency gets zero compatible PKR candidates.
- Document operation validation composes A's fields and is compile-checked against `SupportingDocument`; it does not replace A's shared schema. The new **C-local** input envelope below is provisional until A adopts/maps its capability. It is not an HTTP request schema or authorization boundary.

```text
workspaceId                         trusted A-bound scope, never a model argument
document: { record, version }        canonical SupportingDocument; nonnegative safe integer version
transactions: [{ record, version }]  canonical Transaction; <=50; distinct IDs AND source rows
pool: { complete: true, revision }   complete authorized comparison pool, not a truncated page
allocations: {
  complete: true, version,
  items: AcceptedMatch[]             complete relevant ACTIVE relationships, <=2000; not historical/rejected proposals
}
```

A's existing transaction `reviewVersion` starts at **0**, which C preserves. A must provide document/allocation versions and a revision that changes when the relevant pool changes. It must scope sources and records before calling C; checking supplied workspace strings is validation, **not proof of database ownership isolation**. Partial/oversized pools fail closed; A must not mark a truncated page complete. Consistency requires each supplied transaction's accepted match status to agree with active allocations. Duplicate active transaction/document allocations fail validation.

`MatchingDependencies` exposes only:

1. `rank(request): Promise<unknown>` — a narrow feature capability for C1's sole text-provider implementation. Request contains fixed system instruction, reviewed document fields, every compatible candidate with original ID, deterministic features, registered evidence, strict Zod response schema, prompt version, absolute deadline and cancellation signal. **No Groq adapter, SDK, fallback provider, retries, quota manager or production provider import is supplied here.** C1 must map this seam to its adopted adapter and shared request budget. Retry/quota ownership remains C1; this operation invokes `rank` once.
2. `readCurrentInput({signal, deadline}): Promise<unknown>` — A reloads the complete scoped authoritative envelope before and after inference. Returning the initial object forever is not a valid production implementation. Capabilities must honor cancellation; C bounds waiting but cannot force cancellation of an uncooperative remote service.
3. A-bound absolute `deadline` and `AbortSignal`; no model control of either.

Fingerprint covers parsed record values, versions, full supplied pool and active allocation state. Array order changes conservatively invalidate a snapshot; A should use stable ordering. Current-state failure returns unavailable; changed valid snapshots return stale. Neither is actionable. This read-check-read protects C's returned proposal from known staleness; it cannot close the later publication/approval race. A must atomically recheck versions, authorization and active allocations when persisting/accepting.

## Matching policy and evidence

- Only `reviewStatus: accepted` plus complete extraction can proceed. `correctedFields ?? extractedFields` is selected as a whole; a null corrected value is not replaced from old extraction. Required matching fields are valid date, exact total and explicit three-letter currency. Counterparty/reference remain nullable. This gate and envelope need A/B adoption before wiring; no per-field review state exists in A's current type.
- Amount and currency are exact validated string comparisons. References compare verbatim; whitespace-only is missing. Case, punctuation and whitespace are not normalized into false equality. Date gap is computed in UTC days and is **never an exclusion cutoff**. Direction is context; C does not infer it from document kind.
- Non-one-to-one values return no compatible candidate with explicit amount/currency exclusion reasons. FX, tolerances and split allocations are unsupported; C does not infer that a split occurred or combine rows. Empty pool, all allocated and already allocated document are distinct outcomes. Accepted allocations are never overwritten by a rerun.
- Evidence registry is code-authored: opaque field ID, actual record/source ID, CSV row/document field, selected original/corrected basis and actual value. Model claims use exact pairs `[document field ID, this candidate's field ID]`. Foreign locators, another candidate's source, wrong existing fields and duplicate claims fail validation. Reference agreement/conflict claims must agree with code.
- Semantic output contains a candidate-specific alias/related/uncertain/unrelated interpretation and typed supporting/conflicting evidence. Free model prose, financial values, accepted status and extra fields are rejected. C renders rationale templates linked to the actual evidence; semantic truth still requires independent live evaluation.
- Conservative **v1 proposal policy**: a recommendation needs a unique merchant alias/relation supported by counterparty/description evidence **and** code-verified exact reference equality, without conflict. Amount/date alone, merchant similarity alone, absent reference, contradictory evidence or equally corroborated candidates never yield a recommendation. This deliberately abstains on reference-free cases; broader evidence rules require explicit review before changing the policy.
- A weaker alternative remains visible when unique exact-reference corroboration distinguishes a stronger candidate. Every compatible candidate is validated/evaluated before display selection. Full `candidates`, `displayCandidates` (top three), supplied/compatible/excluded/evaluated/displayed/omitted counts and original snapshot are returned. Display order/date proximity cannot break an evidence tie. A model-selected tied/weak/foreign ID invalidates its output.
- `proposed` means reviewable only. C has no approval, transaction mutation, decision persistence or allocation capability. Stale/unavailable/blocked/needs-review outcomes have null recommendation.

Versions: policy `c2-matching-v1`; prompt `c2-match-prompt-v1`. No live model ID or provider revision accepted yet. These local versions are not a replacement for C1's future shared provenance/cache identity.

## Checks actually run

| Check | Result | What it establishes |
| --- | --- | --- |
| `node --conditions=react-server --test --test-isolation=none tests/ai/matching.test.ts` | 44/44 pass, including nested cases | Exact preparation, ambiguous/contradictory/scripted ranking, complete membership/evidence checks, version-zero compatibility, stale reads, bounded waits/cancellation and C input/cash-summary purity |
| `npm test` | 37/37 pass | Existing A backend/security regressions, including embedded database import/review checks; **not matching concurrency** |
| `npm run typecheck` | pass | Next type generation and strict TypeScript across source and tests |
| `npm run build` | pass on retry outside Windows sandbox | Production baseline compiles/typechecks. First attempt hit Turbopack workspace canonicalization access-denied. C module is not routed, so build alone is not C integration evidence. |
| Lint | not run | No configured lint script or installed linter in A's manifest; no dependency/config edits made |
| Whitespace | C changes pass; baseline index has two existing findings | Incoming migrations 004:152 and 005:54 have blank EOF lines; preserved as A-owned baseline |
| Live model quality / reserved evaluation | not run; 0 live requests | Scripted outputs do not measure semantic precision/recall/coverage; reserved independent labels remain step 19 |
| Live UI/persisted matching / matching races / cross-owner approvals | blocked, not run | Required A/B matching surfaces absent |

Focused tests are **not included in A's current `npm test` glob**. Run the explicit command above. A may add the glob in its own dependency/config lane. Initial failing checks observed missing preparation/proposal exports; a later failing zero-version case exposed and corrected incompatibility with A's initial version 0. A failing delayed-timer case also demonstrated why wall-clock deadline checks are needed around external reads rather than relying only on an abort timer; fixed and verified. Test fixtures are synthetic development data, never reserved gold answers or model/application context. Only external rank/read capabilities are scripted; C preparation, validation and ranking execute normally.

Guidance applied: retained `typescript-pro`/type-guards and `langchain-middleware` validation concepts, retained `playwright-expert` distinction between browser and scripted evidence, and the installed Next 16 server/client guide's `server-only` marker. These are repository references, not newly installed skills. Named `codebase-design` and `tdd` skills are not installed; no substitute package/framework was installed. Public behavior checks follow the explicit runbook/PRD. No browser skill was used to simulate missing integration.

## Step 13: exact infrastructure blockers

Backend `cf4b666`:

- Migrations 001–005 implement workspace/private sources, transactions, CSV imports/resolutions and transaction review history. No reviewed document, match proposal, active match or match-decision persistence exists.
- `src/app/api/**` has source/import/transaction/summary/export/workspace routes; no document review, match proposal or match decision route. `docs/raqam/CONTRACTS.md` explicitly labels these planned.
- `src/lib/server/cashbook-mapping.ts` always maps `matchStatus: unmatched`; A's contract notes that matching must update the mapper/view when matching is introduced.
- No atomic match approval operation or matching uniqueness/stale/owner test evidence is available. Import atomicity tests do not prove matching atomicity.

Frontend `123c642` (read via Git; not integrated here):

- `review-screen.tsx`: live (`!demo`) review shows pending-review-API message. Demo builds candidates locally and is not a consumer of C's outcome/evidence/snapshot interface. Its outgoing-only candidate filter also needs B's review against C's direction-preserving contract.
- `workspace-app.tsx`: demo `match()`/rejection mutate React state/history; `match()` refuses `!demo`. This cannot establish reload persistence or database allocation.
- `src/lib/client/api.ts`: workspace, transactions, upload and source-link operations only; no matching proposal/review capability.

C1 provider/OCR steps 4–8 are absent. The reviewed-document and versioned capability envelope have not been adopted by A/B. No teammate message was sent and no A/B work was taken over.

## Joint verification when the slice is available

| Required check | Responsible execution/evidence | Current state |
| --- | --- | --- |
| Compare exact amount/reference/date and open CSV row + reviewed document source | B live screen + authenticated A source reads, C verifies evidence mapping | blocked |
| Accept a proposal, reload, inspect exactly one accepted relationship + immutable decision history; compare authoritative cash totals before/after | A real approval/persistence + B live controls, C records actual IDs/versions/results without private data | blocked |
| Reject, select another valid candidate through A; reload; rerun preserves accepted decisions; correction invalidates old proposals | A review operations + B actions, C verifies return states | blocked |
| Edit reviewed document during real model request; old result cannot become actionable or pass acceptance | C stale behavior plus A atomic stale publication/approval rejection + B stale display | C scripted guard passes; integrated check blocked |
| Race confirmations for same transaction and separately same document; attempt cross-owner IDs | **A's actual database operation and concurrent tests**, not C fake capabilities | blocked |
| Tied case, unsupported split/currency mismatch display explicit reasons with no allocation or fraud/nonpayment claim | B live UI + C returned evidence/reasons | C module checks pass; browser check blocked |
| Accepted relationship versus proposal remains distinct in tools/export/UI, with unchanged cash totals | A mapper/export/tools + B status rendering, C reads actual integrated output | blocked |

Start step 13 once one live receipt-to-match review slice is wired, not after all A/B tracks finish. Its full acceptance requires A's real race/ownership evidence. Next ready action: GPT-6.1 Sol reviews this actual C diff; then A/C1/B adopt the narrow capabilities/result and deliver the missing slice. Do not implement steps 14+ as part of this request.

## Review handoff for GPT-6.1 Sol

Review the seven C files listed in `C2_HANDOFF.md` against PRD F05/F06/F08, Person C plan sections 8/10.3 and runbook steps 11–13. New C files are marked intent-to-add so `git diff -- src/lib/ai tests/ai docs/ai/C2_HANDOFF.md docs/ai/handoff.md docs/ai/c2-integration.md` exposes the actual complete C changes. Distinguish incoming staged backend baseline (82 files) from C-authored changes. Branch HEAD remains 75a4c61 and merge parent is cf4b666; do not commit the merge during review. The user's C-only scope keeps the root A handoff intact; this C handoff/report records the current branch and continuation.

Check exact helper reuse, preservation of every compatible candidate, typed field-pair evidence validation, tie/weak/conflict abstention, snapshot revalidation and lack of persistence capabilities. Review the conservative reference-required recommendation policy and provisional envelope for A/B adoption. Run the explicit 44-case focused test command; do not accept scripted semantics, unchanged-input totals or existing import database tests as step 13 proof. Record concrete defects against lines in the diff and keep full integration gated on the listed missing surfaces.
