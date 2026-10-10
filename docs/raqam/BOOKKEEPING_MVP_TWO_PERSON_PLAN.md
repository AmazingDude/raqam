# Two-person bookkeeping MVP implementation plan

**Status:** proposed execution plan; it does not amend the PRD or prove any feature is implemented.
**Prepared:** 10 October 2026, PKT.
**Source plan:** [Bookkeeping pipeline expansion](BOOKKEEPING_EXPANSION_PLAN.md).
**Purpose:** deliver one integrated MVP for the proposed bookkeeping expansion with two clear owners, disjoint working paths, dependency gates, and an end-to-end acceptance run.

## Product and MVP boundary

The proposed MVP extends Raqam's existing reviewed cashbook. It adds written-expense drafts, source-aware receipt/bill/invoice intake, supplier bills, customer invoice creation, explicit payments, no-double-count links, a deterministic exception queue, bounded AI suggestions, exact summaries, and a tax-year FBR workpaper for one confirmed taxpayer profile. The user sees one coherent flow; the team still builds and verifies it in dependency order so failures are caught before integration.

The current PRD remains authoritative until the user accepts Gate 0 and its scope change. The PRD currently describes a reviewed cashbook, not a full double-entry ledger, and excludes tax, payments and invoice creation from the core. Unless the user explicitly chooses otherwise, this plan uses “ledger” to mean the reviewed cashbook plus linked document/payment records. It does not claim general-ledger, P&L or balance-sheet accounting.

Keep the previously deferred features deferred: live bank connections, arbitrary/universal bank-format support, organizations and team roles/invitations, subscriptions, unattended posting/automatic accounting decisions, arbitrary web research, and automatic payment execution. Scanned statement OCR remains limited to named layouts and verified file/page limits. Tax filing and payment are excluded.

## Roles and exclusive ownership

Names are intentionally omitted; assign the actual two people before implementation.

| Owner | Lane | Exclusive implementation paths | Must not edit without a handoff |
| --- | --- | --- | --- |
| **Person 1 — Platform and books** | Shared contracts, exact financial rules, migrations, owner-scoped APIs, persistence, idempotency/audit, cash projections, tax workpaper calculations, integration and release gate. | `src/lib/contracts/`, `src/lib/server/`, `src/app/api/`, `supabase/migrations/`, `tests/backend/`, `tests/security/`, `scripts/`, platform setup docs. Person 1 is the sole editor of schemas, migrations, package files, shared configuration and API contracts. | Person 2's `src/lib/ai/`, prompt files, workspace UI and AI/E2E test files. No dependency, shared schema, migration or environment changes are made in parallel. |
| **Person 2 — Product workflow and AI** | Intake/review UI, source viewer, draft editing, invoice preview/download UI, review queues, bounded AI adapters/prompts/proposals, independent fixture labels and browser journey. | `src/app/(workspace)/`, `src/lib/client/`, `src/lib/ai/`, `src/lib/ai/prompts/`, `tests/ai/`, `tests/e2e/`, UI-specific docs and demo fixtures. Person 2 consumes Person 1's frozen contracts and may propose contract changes in writing. | Person 1's API routes, shared contracts, migrations, package files, server persistence, exact-money helpers and global configuration. Person 2 never approves/posts a financial record from an AI result. |

Both owners review each other's acceptance evidence. Person 2 independently labels evaluation fixtures; Person 1 does not grade their own financial calculations alone. A qualified Pakistan tax practitioner is a required external reviewer for any tax-use claim; that reviewer is not assumed to be one of the two implementers.

### Merge and handoff rules

1. Person 1 records the starting revision, current hosted migration state, commands, running-app constraints and existing API patterns. Preserve unrelated work and `.worktrees/`.
2. Before parallel feature coding, Person 1 freezes the domain/API contracts and synthetic examples. Person 2 implements against those examples and reports needed changes before editing a shared shape.
3. Work in separate branches/worktrees. Person 1 alone changes migrations/contracts/package/config. Person 2's AI/UI work must pass against the frozen contract before integration.
4. Each task ends with changed paths, focused tests, exact commands/results, unresolved decisions and next task recorded in `handoff.md`. Keep commits small and task-scoped.
5. Integrate in the numbered order below. Run the combined module checks after each vertical slice; run the full browser journey only against the integrated candidate. Never “fix” a conflict by resetting or replacing the other person's files.

## Domain relationships and API shape

```text
Workspace
  ├── Source document ──> extraction proposal ──> reviewed expense / supplier bill / customer invoice
  ├── Imported statement ──> canonical cash movement
  ├── Explicit payment ──> canonical cash movement (one movement only)
  ├── Review decision / exception ──> source, document, transaction or payment
  └── Tax workpaper ──> tax-year profile + included reviewed records + versioned rule references
```

Receipts, bills, invoices and extraction proposals do not create cash. An imported bank row or explicitly recorded manual payment is the cash movement. A payment match creates a relationship to that movement and cannot post a second amount. A tax workpaper is a versioned snapshot of selected records, not a replacement for the cashbook.

Person 1 owns resource contracts and route implementations, reusing the repository's existing `/api` conventions and Zod contracts. Candidate resource groups are expense drafts, documents/extractions, supplier bills, customer invoices, payments, match/exception proposals, exact summaries, and tax workpapers. These names and operation shapes are proposals until checked against current route patterns and frozen in `src/lib/contracts/`; do not create a competing OpenAPI schema. Collection responses must be bounded/paginated, all resources owner-scoped, mutations version-checked/idempotent, stale decisions explicit conflicts, and failures use the repository's canonical safe error envelope. Any external API versioning requirement must be decided before exposing the API outside this app.

## Decisions that block implementation

Resolve these in a short joint Gate 0 session before Person 1 writes migrations or either person changes financial-state behavior:

1. **Accounting meaning:** confirm the proposed reviewed cashbook with linked records, or explicitly select full double-entry journals, chart of accounts, P&L and balance sheet. This plan assumes cashbook extension.
2. **Invoice flow:** confirm supplier bills and outgoing customer invoices; invoice artifact defaults to preview/download, no email sending.
3. **Payment scope:** the MVP defaults to one full payment per bill/invoice, with no installment, split allocation, refund or overpayment support. Choose required date, amount, currency, method/reference and account fields.
4. **Tax profile:** identify legal form (individual/sole proprietor, AOP/partnership, or company), residency/activity, province, relevant FBR registration(s), target tax year, income-tax vs sales-tax scope, withholding evidence, prior-year wealth/assets/liabilities and tax-practitioner reviewer. Do not invent or encode rates before this is resolved.
5. **Document and statement limits:** approve image types, scanned statement layouts, maximum bytes/pages/rows, and synthetic fixtures. Existing deterministic CSV/Excel/selectable-text PDF behavior stays intact.
6. **Hosted baseline:** verify current migration 008–010 status read-only; do not reapply an already-run migration. Confirm a dedicated synthetic workspace and safe test accounts for hosted acceptance.

If tax profile or practitioner review is unavailable, keep tax workpaper work as an unimplemented, clearly gated task; do not claim tax preparation is complete or let it block the non-tax bookkeeping MVP. If the user insists the whole MVP must include tax, the MVP cannot pass its release gate until that tax gate is satisfied.

## Numbered implementation steps

Each step is a shared milestone with a named primary owner. “Done” requires the listed acceptance evidence and handoff update. No step implies a production deployment.

### Gate 0 — agree scope and baseline (joint; Person 1 facilitates)

1. **Freeze proposed MVP semantics.** Person 1 compares Gate 0 answers with `PRD.md`, `docs/raqam/GLOSSARY.md`, `docs/raqam/CONTRACTS.md`, `TEAM_TASKS.md` and `BUILD_PLAN.md`; proposes exact changes and exclusions. Person 2 walks the desired upload-to-reviewed-books flow and flags screens/AI calls that need different contracts. User accepts unresolved scope decisions before code.
   - **Evidence:** updated PRD decision register and glossary terms; supported states, currencies, tax scope and exclusions agree. No migration or feature route is started before this.
2. **Record real baseline.** Person 1 checks Git status, app tree, existing cash movement/document/match APIs, migrations, current hosted migration status, environment names (never prints values), scripts, current branches and running server. Person 2 checks existing UI flows and test fixtures read-only.
   - **Evidence:** baseline revision and commands in handoff; unrelated files preserved; current checks and hosted unknowns listed precisely.

### Phase 1 — contract and foundation (Person 1 leads; Person 2 contract consumer)

3. **Publish one canonical lifecycle contract.** Person 1 defines exact amount/currency/date, source locator, owner scope, expense/bill/invoice/payment/statement movement, proposal, review decision, exception, idempotency key, optimistic version and state transitions in existing shared contracts. Include examples for missing evidence, duplicate payment, refund/out-of-scope case and ambiguous tax applicability. Person 2 reviews every screen/AI input/output against the same fixtures; no duplicate private schema.
   - **Evidence:** contract tests reject bad amounts, foreign IDs, stale versions, duplicate IDs, incomplete batches and invalid transitions; both owners sign off in handoff.
4. **Build persistence and access controls.** Person 1 designs additive migrations and owner-scoped APIs. Preserve source immutability, review history, uniqueness constraints, exact PKR arithmetic, transactions/idempotency, rollback strategy, RLS and audit. Verify existing 008–010 before deciding whether any new migration is needed. Person 2 creates only UI/API fixtures and screen shells behind the frozen contract.
   - **Evidence:** local DB/security tests cover two workspaces, direct-access denials, retry, concurrency, stale writes and rollback; migration dry-run/schema comparison and repair plan pass. No hosted write until manually authorized by project workflow.
5. **Implement deterministic source/validation services.** Person 1 reuses existing statement, OCR and match services; adds exact document hashes, required-field checks, arithmetic and duplicate identity rules. Person 2 makes deterministic statuses/evidence visible and prepares clean, ambiguous and failure fixtures.
   - **Evidence:** old CSV/Excel/selectable-PDF paths regress green; known clean inputs make zero model calls; amount/date/currency and invoice-line calculations match independent expected values.

### Phase 2 — record capture and document workflows

6. **Written expense draft (Person 2 AI/UI; Person 1 persistence/API).** Person 2 parses a user-entered note into a strict draft; all absent/ambiguous values remain unresolved and edits are explicit. Person 1 persists a versioned draft only through the authenticated route. A fully manual path remains available without provider access.
   - **Evidence:** synthetic tests for varied wording, ambiguous dates/amounts, missing currency, prompt injection, malformed response and provider outage; owner corrects then reloads; exactly one cash movement appears only after explicit confirmation.
7. **Receipt/bill/invoice/scanned-statement intake (Person 2 extraction/UI; Person 1 source/persistence/API).** Reuse the existing private upload and extraction path. Add only the document classes and named scanned layouts approved in Gate 0. Person 2 displays original source beside observed text, normalized proposal, evidence locator, uncertainty and correction. Person 1 owns file access, cache identity, limits, idempotency and immutable history.
   - **Evidence:** clean/changed/unreadable/unsupported fixtures; source access remains owner-scoped; cache/correction reruns are version-safe; OCR alone never creates or changes cash.
8. **Supplier bills (Person 1 lifecycle; Person 2 review UI).** Create distinct draft/reviewed bill records with exact line arithmetic, due date and explicit tax fields only if chosen. Approval records a payable/evidence record; it is not cash. AI may extract fields but never decide acceptance or tax treatment.
   - **Evidence:** line totals and required fields validate deterministically; unreadable fields stay unknown; correction/history survives reload; bill approval leaves cash unchanged.
9. **Customer invoice creation (Person 1 records/artifact; Person 2 builder/preview).** Use only owner-confirmed seller/customer identity, invoice numbering and line fields. Generate downloadable output from persisted values; do not call it FBR-integrated or a compliant tax invoice without separate legal/integration evidence. No email sending or payment execution.
   - **Evidence:** preview/download exactly equals saved fields and deterministic totals; retries do not create duplicate invoice IDs/numbers; issue/create action does not change cash or imply payment.

### Phase 3 — payments, review and AI

10. **Canonical payment event/no-double-count rule (Person 1; Person 2 UI).** A full payment either links to an existing imported bank movement or creates one explicit manual movement. Later bank import links/reconciles to that movement instead of adding another. Person 2 shows source, link state and conflict clearly.
    - **Evidence:** tests for imported-first/manual-first, duplicate retry, conflicting amount/direction/currency, concurrent linkage, stale decision and reload. Cash totals change once and only once.
11. **Deterministic matching and exception queue (Person 1 engine/API; Person 2 review UI).** Run workspace/direction/currency/exact amount/reference/date constraints and duplicate/arithmetic/source checks first. Return `ready`, `needs_review`, `blocked` or `conflict` with evidence/rule IDs and coverage; no heuristic confidence numbers. Person 2 lets an owner inspect, accept, correct or reject and preserves reason/history.
    - **Evidence:** exact cases use zero AI; impossible candidates are excluded; ambiguous/duplicate/incomplete cases remain reviewable; accept/correct/reject survives refresh and concurrency; totals remain unchanged by linking.
12. **Bounded AI proposals and explicit correction rules (Person 2 engine/prompts; Person 1 proposal/review persistence).** AI may suggest unresolved field/document/vendor/category/match interpretations only. Validate IDs, versions, category membership, batch completeness, source evidence and tenant scope against Person 1's contracts. Batch only the deterministic shortlist; cache by owner/source/version/model/prompt/schema; reserve provider budget. Accepted user decisions are never overwritten on rerun.
    - **Evidence:** offline scripted provider tests for clear/ambiguous/foreign/malformed/incomplete/prompt-injection/rate-limit/cancel cases; correction/rerun integration; no provider call for deterministic-resolution cases; measured live evaluation is separate.
13. **Exact summaries and anomaly dashboard (Person 1 calculations/API; Person 2 screens).** Compute cash, accepted-category totals, open/paid document states and exception counts in code from canonical records. Display included period/scope and unresolved coverage. AI may explain cited results but cannot calculate or modify them.
    - **Evidence:** independent fixture totals reconcile across cashbook, dashboard, exports and assistant facts; tax labels never appear as ledger categories; missing records are shown as gaps, not zero or a fraud claim.

### Phase 4 — conditional FBR tax workpaper

14. **Select one tax profile and assemble versioned rule pack (Person 1 calculations/provenance; Person 2 bounded review/UI; qualified practitioner validates).** Use official primary sources with effective dates, tax-year applicability, source URL/version/hash, reviewed interpretation, deterministic formulas, test vectors and reviewer. Preserve old versions. Workpaper includes tax profile/year, selected source records, exclusions, missing schedules, calculations, rule version and review status. The model only maps supplied evidence to those rules and flags gaps; it abstains on unknown law/profile.
    - **Evidence:** practitioner signs off each supported profile/rule fixture; independent calculations match hand-worked expected values; user can inspect every source; no tax filing/payment. Without the tax gate, this task stays blocked and is omitted from MVP claims.

### Phase 5 — integrated acceptance and release candidate

15. **Run the whole journey (Person 2 drives browser; Person 1 verifies server/data; both record evidence).** On two synthetic owner accounts: enter an expense, upload receipt and supplier bill, create/customer-download invoice, import statement, link one payment, review a discrepancy, accept/correct/reject AI proposals, reload/switch owner, view summaries/export and create the selected tax workpaper if tax gate passed.
    - **Evidence:** each action persists correctly after reload; foreign access is denied; every cash event counts once; source/correction/history is preserved; AI provider failure falls back to manual review; screen-reader/keyboard/mobile checks pass; no secret appears in browser/logs.
16. **Freeze and verify MVP candidate (joint; Person 1 coordinates).** Run all focused and combined backend/security/AI/client tests, typecheck, lint if configured, clean production build, signed-out/private-route checks, two-account isolation, migration state, and browser acceptance twice on the exact candidate revision. Person 2 independently checks AI labels and denominator; qualified tax reviewer signs off before any tax accuracy claim. Record timeouts, 429s, cache hits, errors and unresolved records.
    - **Evidence:** release record names exact commit, command/results, dataset and prompt/rule versions, provider request count, hosted migration evidence, known limitations, reviewers and timestamp. No feature is “done” because code exists; every acceptance path must pass.

## Required test/evidence matrix

| Area | Minimum evidence before integrated pass |
| --- | --- |
| Exact books | Integer-minor-unit arithmetic; expense/bill/invoice lines; cash totals before/after each state transition; no duplicate payment/import retry. |
| Source and review | Original file/text/hash/locator retained; corrections separate; histories immutable; unknown fields remain unknown; unsupported layouts are explicit. |
| AI | Scripted failure suite plus held-out independent labels; provider/model/prompt/schema recorded; zero calls for deterministic outcomes; bounded request count/cache/retry/deadline. Never use the model's self-reported confidence as a quality metric. |
| Security | Two-owner API, DB, storage and export isolation; signed-out/expired-session denial; no service-role bypass or client secret; logs contain no raw documents/secrets. |
| Payment/reconciliation | Imported-first and manual-first; duplicate/concurrent/stale/conflict cases; one real movement counted once; accept/correct/reject and reload. |
| FBR | Confirmed legal profile/year/jurisdiction; effective-dated official citations; deterministic test vectors; practitioner review; ledger vs taxable income distinctions; incomplete wealth/withholding evidence handled explicitly. |
| Release | All configured checks; fresh production build; two repeated integrated browser journeys; migration state and rollback path recorded; exact candidate revision frozen. Deployment is a separate explicitly requested release action. |

## Cross-document consistency and start condition

- Preserve original EXP-00–EXP-13 identifiers and the current PRD as authority. This document maps the expansion slices to the two lanes; it does not mark them accepted or complete.
- Keep “cashbook”, “cash movement”, “supporting document”, “proposal”, “review decision”, “source reference” and “tax workpaper” meanings aligned with `docs/raqam/GLOSSARY.md` and existing contracts. Do not call the MVP a full general ledger by implication.
- Do not edit the PRD, migrations, route schemas or task status until Gate 0 decisions are recorded. Then update PRD, glossary, contracts, task board and migration plan together before coding.
- First actionable step is Gate 0, followed by steps 1–5. Feature coding is blocked until the contract is adopted; tax implementation is separately blocked on profile/regime/practitioner review.
- The detailed product safety rules, FBR official references, quota policy and baseline gaps remain in [BOOKKEEPING_EXPANSION_PLAN.md](BOOKKEEPING_EXPANSION_PLAN.md). The original C implementation plan and existing core feature IDs remain unchanged.
