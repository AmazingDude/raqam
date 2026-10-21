# Tax workpaper execution tasks

**Status:** TW-02 and TW-03 have initial local slices in progress; all other work remains pending. Planning started 21 October 2026. These tasks refine existing EXP-12/13, not the earlier A2 assistant track. Task IDs are local to this extension. Suggested responsibility labels describe implementation boundaries; no agents or external tickets have been created.

The integrator owns shared contracts/migrations, tax-domain review approves legal logic, backend owns persistence/engine and product UI owns the screens. A developer cannot self-certify legal accuracy by passing their own tests.

## Dependency-ordered slices

| Task | Deliverable and expected files | Depends on | Acceptance/verification | Requirements |
| --- | --- | --- | --- | --- |
| TW-01 | Agree first year/cohort and legal matrix; expand `research.md` into a provision-by-provision pack checklist; record reviewer access/verification decision. Update PRD proposed extensions deliberately. | Planning | TY2026 vs in-progress TY2027 is explicit; unsupported heads/regimes listed; exact applicable law/form sources retrieved and qualification process defined. No unreviewed rates enabled. Reviewer decision can proceed alongside foundational implementation. | R01, R05, R09 |
| TW-02 | **In progress:** initial strict taxpayer facts, selected-year case state and internal GET/POST routes in `src/lib/contracts/tax-workpaper.ts`, `src/app/api/tax-workpapers/route.ts`; client methods in `src/lib/client/api.ts`. OpenAPI and schedule/snapshot/review contracts remain. | TW-01 scope | Initial schema rejects extra fields and requires explicit confirmation; contract and owner database checks pass. Still add OpenAPI, full schedule contracts and route/client integration coverage. | R01–R12 |
| TW-03 | **In progress:** additive case/facts table, forced owner RLS, idempotent optimistic-version save RPC, migration checker and PGlite security tests in `supabase/migrations/202610210001_tax_workpaper_cases.sql`, `scripts/check-tax-workpaper-migration.sql`, and `tests/security/tax-workpaper-database.test.ts`. Historical snapshots, reviews and artifacts remain. | TW-02 | Initial checks prove cross-owner/direct-write denial, year uniqueness, stale-version rejection, idempotent retry and migration replay. Hosted verification remains separate. | R02, R08–R11 |
| TW-04 | Year-scoped case/fact services and Business profile integration: `cases.ts`, relevant routes/client API, tax profile screens. Preserve closed readiness answers and add separately confirmed tax facts. | TW-03 | TY2026/TY2027 isolated, year switch preserves drafts appropriately, saved profile reloads, unknown facts block affected gates, current API behavior remains compatible. | R01–R02, R12 |
| TW-05 | Consistent ledger snapshot, evidence links and coverage/completeness gates: `evidence.ts`, `gates.ts`; scoped ledger adapter without changing accounting math. | TW-04 | All pages and versions frozen consistently; unresolved material postings and missing history fail appropriate gates; journal/document/manual evidence accessible only by scope. Edits detected between read and generation. | R03–R04, R07, R11 |
| TW-06 | Typed schedule services and editor UI for supported salary/business, adjustments, fixed assets, losses/allowances, withholding/advance tax and wealth reconciliation. | TW-04, TW-05; legal field semantics from TW-01 | Each amount traceable; no default zeros; no forced wealth plug; duplicate tax certificates and gross/net duplication rejected; unsupported treatment blocked. Schedule edits leave posted books unchanged. | R04, R07, R12 |
| TW-07 | Reviewed immutable TY2026 rule pack, form mapping and pure engine: `rules/`, `calculation/`, independently checked fixture files/tests. | TW-01 legal review, TW-02; can be developed alongside storage/schedules after contracts settle | Exact math, conditions/order/rounding and every supported applicability case match independent expected outputs. TY2027 cannot reuse TY2026 rates implicitly. Missing/retired packs fail closed. | R01, R05–R06 |
| TW-08 | Server generation and persisted snapshots: `snapshots.ts`, snapshot routes, client decoding and generation gate UI. | TW-03, TW-05–TW-07 | Atomic input/rule/engine/result/trace storage; idempotent retry, no mixed revisions, no fabricated totals; state `calculated` only after success. Direct API cannot bypass UI gates. | R06–R08, R12 |
| TW-09 | Durable PDF + structured exports/history: `exports.ts`, artifact routes, workpaper UI. | TW-08 | Server-rendered artifact stored privately, content hash checked, exhaustive schedules/links/legal references included; long tables have correct pagination/totals. Download reflects a snapshot, not current live mutable data. | R08, R10–R11 |
| TW-10 | Restricted authenticated practitioner assignment and review, qualification verification, revocation and auditable decision UI: `reviews.ts`, review routes/policies. | TW-01 reviewer decision, TW-03, TW-08 | Owner cannot self-approve, unrelated reviewer denied, reviewer sees only authorized snapshot/evidence, decision binds to hash and legal pack. External owner-uploaded claims do not become approval automatically. | R09, R11 |
| TW-11 | Completion orchestrator and invalidation across profile/readiness/workpaper; shared derived statuses and change detection. | TW-09, TW-10 | Complete requires ended year and all applicable facts/evidence/rules/calculation/review/artifact gates in backend. Relevant source/rule changes supersede current completion while preserving history. Export failure never reports complete. | R01, R07–R12 |
| TW-12 | Local and hosted release evidence, handbook/support limits and independently reviewed pilot. | TW-11 | Full checks in plan.md recorded with denominators; supported cases agree with independent practitioner examples; hosted two-owner/reviewer flow passes; migration/read/download authorization verified; unsupported cases blocked. | R01–R12 |

## Milestones

1. **Reliable preparation foundation (TW-01–06):** honest year/profile/evidence/schedule progress. Existing summary remains clearly a draft; no tax liability claim.
2. **Calculated workpaper (TW-07–09):** reproducible, saved, source-linked calculation and export. Practitioner review still visibly pending.
3. **Reviewed complete workpaper (TW-10–12):** genuine review, backend-enforced completion, deployed acceptance and immutable history.

Critical dependencies: scope/legal sources → contracts → year/facts/evidence/schedules + approved engine → snapshot → artifacts + qualified review → completion → hosted release. Do not wait for UI polish to establish arithmetic/authorization correctness.

## Independent validation cases

Prepare expected outcomes before engine acceptance, keeping expected results separate from model context:

- Salary-only, business-only and mixed salary/business; correct classification thresholds and every applicable slab boundary.
- Deductible vs private/disallowed expenditure; ledger net cash/profit differing from taxable income; asset allowance and disposal.
- Loss with and without valid carry-forward evidence; unsupported relief; missing tax fact vs confirmed zero.
- Adjustable vs final/minimum withholding, advance tax, duplicate certificate, wrong-year certificate and net receipts already posted.
- Wealth reconciliation balanced by supported movements vs unexplained difference; first-year unexplained opening balance blocked.
- Company/AOP/nonresident/special-year/foreign and special-regime detection cannot silently follow the ordinary individual path.
- Incomplete ledger, source outside first page, concurrent correction during generation, changed approved rules, repeated generate/review/download and stale review attempts.
- Foreign owner, revoked practitioner, unauthorized artifact path, account switch and deleted/replaced evidence.

No estimates are presented as a delivery promise: the unresolved legal/form-pack and practitioner-verification work is part of the critical path. Do not call any milestone implemented based on this planning document.
