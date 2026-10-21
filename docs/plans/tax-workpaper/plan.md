# Real Pakistan income-tax workpaper: implementation plan

**Status:** implementation in progress. Initial case/facts API and owner-scoped persistence are implemented locally; schedules, rule packs, calculations, review and exports remain pending. 21 October 2026.

**Baseline:** [backend audit](../../audits/tax-workpaper-backend.md), PRD D18/D21 and BUILD_PLAN EXP-12/13. This extends the existing tax-readiness slice; it does not replace the bookkeeping PRD or mark the release gates complete. [Sources and verification limits](research.md). [Execution tasks](tasks.md).

## Outcome and boundaries

Turn the current print-only summary into a persisted, reproducible Pakistan income-tax workpaper: confirmed taxpayer facts, reviewed records, applicable schedules, deterministic tax computation, source citations, independent practitioner review, and a downloadable artifact. “Complete” means a reviewed preparation workpaper for a supported case. It never means a return was filed, accepted by FBR, or tax was paid.

Keep English/PKR, the existing Next.js/TypeScript application, Clerk identity, Supabase/Postgres/private Storage, exact money and user-confirmed edits. AI may eventually explain approved results; it cannot choose law, verify evidence, infer missing facts or calculate liability. Existing tax-profile data must continue to stay out of model prompts.

Sales tax, withholding-agent return filing, payment, Iris credentials/automation, automatic submission and blanket “FBR compliant” claims are excluded. Taxes withheld from the taxpayer and deduction-related withholding conditions remain relevant income-tax schedules.

## Proposed delivery scope

These are recommendations to settle at TW-01, not silently accepted scope reductions:

- **First complete cohort:** resident individuals, including sole proprietors, with supported salary and ordinary domestic business income, normal tax year and PKR records. Mixed salary/business cases must use the applicable classification conditions rather than always choosing one slab.
- **First completed year:** TY2026, 1 July 2025–30 June 2026, after that year's enacted rule/form pack is approved. TY2027 may support interim preparation, clearly marked in-progress; it cannot become an annual completed workpaper before 30 June 2027. Other years enabled only when packs exist.
- **Later complete cohorts:** property, capital gains, other-source subtypes, AOPs, companies, nonresidents, foreign-source income/assets, special years and special regimes each require separate verified rules, schedules and examples. The interface must detect these cases from the beginning and state why completion is blocked.
- Do not reject a taxpayer merely because they have missing documents; offer draft preparation and explicit missing items. An unsupported legal treatment blocks finalization instead of silently excluding the amount.
- If the team requires all existing profile taxpayer types at first release, expand the critical path to include their independent packs and tests. Current individual/AOP/company profile choices are not calculation support.

## User journeys

1. Owner selects a supported year in Business profile → Tax profile. Previously saved self-reported answers can prefill a draft but must be reconfirmed for the year. Owner completes required facts and sees “Profile complete” alongside separate records/schedules/review status.
2. Owner opens Tax workpaper, sees exact missing gates, completes schedules and reviews source-linked values. Editing a schedule never silently changes the cashbook or posted ledger.
3. Owner generates a persisted calculation draft. They can inspect each adjustment, tax line, source and applicable legal reference, then request practitioner review.
4. An authorized practitioner reviews that exact immutable snapshot, records exceptions or approval and attests their identity/qualification. The owner downloads a completed reviewed workpaper only after all applicable gates pass.
5. If a source, schedule or applicable rule changes, the previous artifact remains historical and the current case needs a new snapshot/review. Reload and account switching preserve and isolate all state.

## Requirements and acceptance

| ID | Requirement | Observable acceptance |
| --- | --- | --- |
| TW-R01 | Explicit year, taxpayer and supported treatment | TY2026 reads/saves independently of TY2027. Unsupported type/regime cannot yield a completed result; in-progress years cannot be annual-complete. |
| TW-R02 | Confirmed, versioned taxpayer facts | Collect only necessary identity/registration, residency/source facts, business details and applicable declarations. Unknown differs from no/zero. Self-report is never displayed as independent verification. |
| TW-R03 | Server-derived ledger coverage and completeness | Server checks full requested period, reviewed posting state, opening/history limitations and unresolved material records. Coverage ranges alone do not prove all records exist. Owner completeness declaration and evidence/reviewer checks remain separate. |
| TW-R04 | Reviewed tax schedules with evidence | Each applicable line has amount, period, origin, source reference, confirmation/version and evidence status. Missing required schedules block finalization. |
| TW-R05 | Approved applicable law and form pack | Each supported case pins an immutable pack with effective-year rules, citations, source hashes, reviewer and test suite. Missing/retired/unverified packs block calculation or current completion as appropriate. |
| TW-R06 | Deterministic calculation and trace | Same snapshot + pack + engine version yields identical amounts and trace. Accounting/tax adjustments and tax-credit ordering are explicit and reconcilable. |
| TW-R07 | Backend-enforced gates | Direct API/RPC requests cannot bypass missing facts, unsupported treatment, stale input, incomplete evidence or review. Every gate provides a reason and next action. |
| TW-R08 | Immutable generation and history | Generate persists an atomic input/output snapshot before reporting success. Repeat idempotent request returns the same result; stale versions return conflict without partial creation. |
| TW-R09 | Genuine practitioner review | Owner cannot turn an ordinary self-confirmation into practitioner approval. Review binds to snapshot/pack hash and authenticated authorized reviewer; changed inputs require new review. |
| TW-R10 | Durable export and traceability | Download stored snapshot as PDF and structured data; schedules link to journal/document/manual evidence and rule citations. No browser-print-only implementation. |
| TW-R11 | Owner isolation and secure evidence | No cross-workspace read, mutation, cache leak or artifact download. Practitioner access is separately constrained to assigned snapshot and explicit evidence. |
| TW-R12 | Honest, accessible integrated status | Business profile, readiness and workpaper use the same backend status. Completed profile does not turn missing legal/evidence gates green. Drafts remain available with visible limitations. |

## Schedules and calculation scope

All schedules are typed and versioned. Applicability is `required`, `notApplicable` with reviewed reason, or `unknown`; unknown blocks completion. An explicitly confirmed zero is allowed where justified, never a default for absent input.

| Schedule | Required contents and controls |
| --- | --- |
| Taxpayer/year | Necessary legal identity and registration facts, taxpayer class, year/period, confirmed residency facts, income heads, special-regime screening. Do not collect Iris passwords/PINs. |
| Ledger bridge | Frozen journal IDs/versions, account mappings, revenue/expense totals, opening balances/history coverage, reconciliation from book result to relevant income head; bank balances/cash movements are not profit. |
| Business adjustments | Line-level additions/subtractions, disallowed/private expenses, capital vs revenue treatment, exempt/separately taxed receipts, supported timing differences. Each adjustment requires evidence and provision. |
| Fixed assets | Acquisition/use/disposal dates, cost and business-use share, opening tax written-down values, reviewed allowance eligibility and disposal treatment. Book depreciation and tax allowances stay distinct. |
| Salary/other heads | Employer/source-specific gross income, exemptions/benefits and evidence. Later income-head subtypes remain blocked until their rules and form mappings are supported. |
| Losses/allowances/credits | Opening assessed/declared basis and supporting prior-year records, restrictions, year limits and ordered use. Unsupported claims block finalization; never infer carry-forward from negative cash flow. |
| Withholding/advance tax | Certificate/payment reference, payer, tax section, date/year, gross basis, amount, evidence, treatment and unique identity. Reconcile already-booked net/gross amounts to prevent double counting. Classify adjustable/final/minimum/separate treatment under the pack; do not subtract every deduction as an ordinary credit. |
| Wealth/reconciliation | Where applicable: opening/closing assets/liabilities, personal expenditure and identified inflows/outflows; reconcile changes with income and supported nonincome movements. No balancing “plug” to force zero. First-year opening wealth must have an explained source. |
| Additional obligations | Screen high-income, minimum/surcharge, foreign-information and other relevant regimes; calculate only supported provisions and explicitly block unresolved applicability. No promise of comprehensive coverage from one ordinary slab table. |

Calculation pipeline: validate supported case → freeze source versions → validate schedules and evidence → reconcile ledger to income heads → apply approved adjustments/loss rules/allowances → apply applicable separate/ordinary/minimum/additional treatments → apply credits/payment treatment in statutory order → emit liability/balance/refund position with full trace. The exact sequencing is rule-pack-specific and must pass practitioner review; this outline is not a universal tax formula. A negative balance is a calculated position, not an approved FBR refund.

Use integer minor-unit strings and BigInt/rational rate arithmetic; never JavaScript floating-point money. Store explicit rule-prescribed rounding steps and preserve intermediate values. Unknown input yields a blocked or incomplete result, never an invented value.

## State and completion

Store editable case revision separately from immutable snapshots. Gates are evaluated on the server against a consistent revision.

| State | Meaning |
| --- | --- |
| `draft` | Inputs incomplete or under owner review; draft export carries missing items. |
| `blocked` | Known unsupported legal case or failed applicability/evidence gate; structured reasons are returned. |
| `calculated` | Verified engine result persisted against a specific supported input/rule snapshot; practitioner review pending. |
| `inReview` | Assigned practitioner is reviewing that exact snapshot. |
| `changesRequested` | Reviewer has identified unresolved items. Corrections create a new case revision/snapshot. |
| `complete` | Supported ended year, all applicable gates pass, current immutable snapshot has valid practitioner approval, export stored and verified. |
| `superseded` | Historical snapshot replaced or no longer current. Preserve its original result and review. |

`profileComplete`, `recordsComplete`, `schedulesComplete`, `rulesApproved`, `calculationVerified`, `reviewApproved`, `artifactReady` are distinct derived flags. A single profile percentage cannot represent all of them. New relevant source/rule changes invalidate current eligibility; rendering/current download must reevaluate dependencies. Previous bytes remain retrievable as clearly historical, not silently rewritten.

Completion is an atomic backend transition after review and artifact persistence; export failure leaves a retryable calculated/review-approved case, never falsely complete. Do not let an owner acknowledge away a required unresolved fact.

## Data model and module boundaries

Extend the current monolith; no extra agent framework, tax SaaS dependency or service account is assumed.

| Proposed relation | Contents/relationship |
| --- | --- |
| `tax_cases` | Workspace + year + taxpayer scope, current revision, lifecycle and idempotency identity. One current case per scope; revisions remain attributable. |
| `tax_case_facts` / `tax_schedule_revisions` | Immutable confirmed revisions with schema version, evidence references, explicit unknown/NA reasons and input provenance. Separate from current closed-choice readiness profile. |
| `tax_rule_packs` | Global public legal content: year/scope, effective amendments, rule/form versions, reviewed source hashes, engine compatibility, review/withdrawal metadata. User clients cannot publish packs. |
| `tax_workpaper_snapshots` | Frozen facts, schedules, ledger sources, coverage/declarations, pack/engine versions, input/output hashes, trace and generation timestamp. |
| `tax_workpaper_reviews` | Append-only reviewer decisions, scope/qualification verification, snapshot hash and authenticated actor/time. |
| `tax_workpaper_artifacts` | Private object paths and content hashes, format/schema version and generation receipt. |
| `tax_workpaper_events` | Scoped auditable case transitions and reasons. Avoid copying identifiers/amounts into generic logs. |

Proposed implementation boundaries:

- `src/lib/contracts/tax-workpaper.ts`: strict schemas for facts, schedules, snapshots, gates and errors.
- `src/lib/server/tax-workpaper/{cases,evidence,gates,snapshots,reviews,exports}.ts`: authorization, immutable data access and orchestration.
- `src/lib/server/tax-workpaper/calculation/`: pure deterministic computation; no DB/AI calls.
- `src/lib/server/tax-workpaper/rules/`: validated immutable pack loader and scope checks; reviewed packs carry citations and fixtures.
- `src/app/api/tax-workpapers/`: owner-authorized resource routes, bounded bodies and existing session/origin checks.
- Existing `profile-tax-screen.tsx`, `tax-readiness-screen.tsx` and client API: shared case status, guided schedules and downloads. Preserve existing profile endpoints until a deliberate migration.
- Additive migration: choose the next unused number after checking local AND hosted history during implementation. Do not assume 018 is free or rewrite migration 015.

Owner identity is derived from Clerk on the server; object IDs never authorize access. RLS and controlled RPCs enforce ownership, expected revision, append-only snapshots, idempotency and all-or-nothing generation. Coordinate with the single integrator before shared schema/migration changes. Use existing private Storage policies and short-lived authenticated downloads with ownership checks at issue time. Records remain private and uncached across accounts.

## Proposed API contract

Per repository RULES_REVIEW, use the existing internal JSON envelope rather than replacing all APIs with a public API platform. These are additive resources; no existing profile response changes silently. Contract implementation includes OpenAPI 3.1 and runtime schema tests at TW-02; no public API/version migration is needed now.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/tax-workpapers?workspaceId=…&taxYear=…&cursor=…&limit=…` | Owner-scoped, bounded cursor-paginated case/history list. |
| `POST /api/tax-workpapers` | Create year-scoped draft from explicitly confirmed scope; idempotency key required. |
| `GET /api/tax-workpapers/{caseId}` | Current revision and server-derived gate reasons; immutable snapshot references. |
| `PUT /api/tax-workpapers/{caseId}/schedules/{kind}` | Explicit confirmed schedule revision with `expectedVersion`; never edits ledger implicitly. |
| `POST /api/tax-workpapers/{caseId}/snapshots` | Validate expected revisions, freeze consistent inputs and persist calculation/trace atomically. Returns structured blocked gates or snapshot; no partial success. |
| `GET /api/tax-workpapers/{caseId}/snapshots?cursor=…&limit=…` | Bounded historical snapshot list. |
| `GET /api/tax-workpapers/{caseId}/snapshots/{snapshotId}` | Authorized immutable snapshot with current/superseded status. |
| `POST /api/tax-workpapers/{caseId}/snapshots/{snapshotId}/reviews` | Authorized practitioner decision bound to expected snapshot hash; owner cannot impersonate reviewer. |
| `GET /api/tax-workpapers/{caseId}/snapshots/{snapshotId}/artifacts/{format}` | Authorized PDF/structured download from persisted result; historical artifacts clearly labeled. |

Success uses `{data,error:null}`; errors use `{data:null,error:{code,message}}`. Extend additive error details with machine-readable gate IDs and field paths; keep sensitive facts out of messages. Retain 401/no session, 404/foreign or absent resource, 409/stale revision, 422/invalid or blocked case, 503/retryable infrastructure; bounded work adds documented 429/Retry-After. Clients validate workspace/year/case/snapshot scope. All lists have opaque stable cursors, bounded `limit` and deterministic ordering; no list can imply global completeness from one page.

Example generate body: `{expectedCaseVersion:4, expectedLedgerRevision:"opaque-revision", expectedRulePackId:"approved-pack-id", confirmed:true}` plus idempotency header. Do not accept arbitrary client totals, owner IDs, approval flags or executable expressions. Unsupported cases return gate code and next action, not a zero-liability snapshot. Bound generation concurrency/retries and artifact size; keep private status/results `no-store`.

## Practitioner review decision still to settle

The current owner-only workspace model has no qualified reviewer role. Recommended design is an authenticated, explicitly assigned practitioner with access limited to a workpaper snapshot and authorized evidence, not general workspace collaboration. Define who verifies qualification and assignment/revocation before enabling this flow. That is a proposed product/security extension, not already implemented scope.

An owner-uploaded signed external report can be stored as evidence but must display `externalReviewClaimed` until a trustworthy verification process exists. It must not auto-unlock `complete`. Until this decision is implemented, the system stops at `calculated`/review pending. Rule-pack legal review and case-specific practitioner review are separate decisions.

## UI and accessibility plan

Use the Apple Design skill's web-app principles: system font and tabular money, existing semantic theme tokens, logical hierarchy, explicit text statuses, keyboard focus and accessible form errors. No native-only styling claims.

Business profile shows **Tax profile: Complete / Missing items** and links to the relevant year. Tax workpaper shows year/scope, current state, missing gate count and next action; separate cards for facts, records, schedules, calculation, review and downloads. A gate expands to missing fields, evidence and source links rather than a dead “Not connected” badge. Support owner draft saving, reload/conflict recovery and a compact mobile sequence with no clipped horizontal controls. Never reset an unsaved draft on year switch without warning.

Keep the existing gray/light theme, emerald selected states and 44px controls. Meet 4.5:1 normal-text contrast, visible focus, 200% zoom, reduced motion and status announcements; color is supplementary. Large schedules use proper table semantics and accessible small-screen details. PDF layout is paper-oriented with repeated headings, page numbers and unambiguous draft/reviewed/version labels. No browser GUI is to be opened by the agent; CLI/automated artifact checks and user inspection follow the standing preference.

Skill references: apple-design `accessibility.md` → Vision; `layout.md` → Visual hierarchy; `entering-data.md`; `feedback.md`; `dark-mode.md`; `typography.md`; cross-platform translation.

## Verification and definition of done

- Independently prepared practitioner-checked expected cases for each supported year/type and every applicable regime; include mixed income, boundary amounts, rounding, disallowances, depreciation, losses, withholding exceptions and wealth reconciliation. Expected results are not derived by calling the implementation under test.
- Every threshold: below/at/above; unknown/NA/zero; credits and gross/net double-counting; wrong-year pack; stale/withdrawn pack; unsupported special case. Any discrepancy blocks that scope's release.
- Database/route tests: owner/foreign/anonymous access, reviewer scope/revocation, direct-write denial, stale concurrency, atomic failure rollback, idempotent retry, partial evidence and changed journal/source invalidation.
- Source pagination tests: calculations use a consistent full snapshot, never only the first page; counts/totals and source references reconcile exactly.
- Export tests: stored snapshot reproduces byte-stable structured data; PDF content is semantically identical with correct total/page coverage and no clipping. Historical export survives later edits and current export flags supersession.
- Client integration: profile/year → schedule correction → blocked reasons → generate → review → download → reload; account switch clears private state. Verify both themes and small screens through CLI-driven checks; user inspects visually.
- Release: hosted migration schema/RPC/RLS verification, synthetic signed-in two-owner and reviewer checks, backup/recovery and export access checks, typecheck, full backend/security suite and production build. Local passing tests do not establish hosted correctness.

Done means all TW-R01–12 have recorded evidence, the selected year/cohort has approved legal/form packs and independent expected results, the real deployed end-to-end path works, and unsupported cases stay blocked. No status is marked done solely because a page renders.

## Consistency review

- D21 remains implemented readiness scope; amounts, identifiers, prior years and calculations are explicitly proposed extensions here. Existing saved profiles are not silently promoted to verified schedules.
- D18 practitioner gate remains; reviewer access/verification is an open design decision and blocks completion, not preliminary data/storage work.
- All seven audit gaps map to requirements/tasks: computation R05–06; gates R03/R07; evidence R04; persistence R08/R10; trace R04/R06/R10; year R01; practitioner R09. Security and UI completeness add R11–12.
- No filing, payment, AI arithmetic or compliance certification is introduced. No assumption of hosted migration state or universal taxpayer support.
- No new numeric tax rule is approved by this plan; source availability and legal/form review are explicit dependencies in research.md.
