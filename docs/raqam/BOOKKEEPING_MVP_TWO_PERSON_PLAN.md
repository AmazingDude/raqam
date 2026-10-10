# Two-person bookkeeping MVP implementation plan

**Status:** proposed execution plan; it does not amend the PRD or prove any feature is implemented.
**Prepared:** 10 October 2026, PKT.
**Source plan:** [Bookkeeping pipeline expansion](BOOKKEEPING_EXPANSION_PLAN.md).
**Purpose:** deliver one integrated MVP for the proposed bookkeeping expansion with two clear owners, disjoint working paths, dependency gates, and an end-to-end acceptance run.

## Product and MVP boundary

The proposed MVP extends Raqam's existing reviewed cashbook toward accrual double-entry bookkeeping. It adds written-expense drafts, source-aware receipt/bill/invoice intake, supplier bills, customer invoice creation, explicit payments, no-double-count links, a deterministic exception queue, bounded AI suggestions, exact statements, and a tax-year FBR workpaper only after a taxpayer profile is supplied or confirmed. The user sees one coherent flow; the team still builds and verifies it in dependency order so failures are caught before integration.

The current PRD remains authoritative until Gate 0 is reconciled and specific PRD changes are accepted. The user has selected accrual double-entry bookkeeping with accounts and financial statements, supplier bills and customer invoices, downloadable invoice output, and one full payment per invoice. This is an accepted planning direction, not permission to alter implementation contracts or claim the current product supports it. No statutory/accounting-standard compliance claim is allowed without qualified review.

Keep the previously deferred features deferred: live bank connections, arbitrary/universal bank-format support, organizations and team roles/invitations, subscriptions, unattended posting/automatic accounting decisions, arbitrary web research, and automatic payment execution. Scanned statement OCR is in scope alongside CSV/Excel/selectable-text PDF, but remains limited to named, tested layouts and verified file/page limits. Tax filing and payment are excluded.

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

1. **Accounting model (direction accepted):** full accrual double-entry ledger, chart of accounts and financial statements; no statutory/standard compliance claim without review. Service-delivery/goods-received date drives recognition. Historical activity import is selected; its start date/source coverage, treatment of pre-history balances and any intended accounting standard remain open before journal contracts are frozen.
2. **Invoice flow (direction accepted):** supplier bills and customer invoices; generated invoices are preview/download only, with no email. Required identity, numbering, fields and tax presentation remain open.
3. **Payment scope (direction accepted):** one full payment per invoice. Partial, split, installment, refund and overpayment flows are deferred. Freeze required payment/source/account fields with the lifecycle contract.
4. **Tax profile and authority (partly accepted):** use the latest applicable official, effective-dated rules as versioned references and require human/practitioner review; make no compliance claim. Taxpayer identity, legal form, residency, activity, province, registrations, tax year/type, withholding evidence and prior-year schedules must be supplied or explicitly confirmed. Missing filing history is `unknown`; never infer “never filed,” age, residency or eligibility from silence or ledger records. Ask only for facts required by the selected rule set, and defer unsupported conclusions.
5. **Document and statement limits (partly accepted):** retain CSV/Excel/selectable-text PDF and include scanned-statement OCR, but approve image types, named layouts, maximum bytes/pages/rows and synthetic fixtures before implementation. Unknown layouts stay in manual review.
6. **Hosted baseline:** verify current migration 008–010 status read-only; do not reapply an already-run migration. Confirm a dedicated synthetic workspace and safe test accounts for hosted acceptance.

If taxpayer facts or practitioner review are unavailable, keep tax workpaper generation clearly gated; do not claim tax preparation/compliance is complete. It may not block release of the non-tax bookkeeping MVP unless the user explicitly makes reviewed tax output a release requirement.

## Detailed planning for Gate 0A and Gate 0B

### Gate 0A — reconcile the accepted expansion with the product requirements

**Purpose:** keep the current cashbook behavior accurately documented while making the user's accepted target expansion actionable. Acceptance of a target is not evidence that the current app implements it.

**Accepted target direction from the user:** accrual double-entry; chart of accounts and financial statements; supplier bills and customer invoices; downloadable invoice output only; one full payment per invoice; scanned-statement OCR alongside CSV/Excel/selectable-text PDF; current official/effective-dated tax material as references; no compliance claim without practitioner review; at most two concurrent AI requests across features/providers, one by default. The user further selected recognition at the service-delivery/goods-received date, importing historical activity, and including a cash-flow statement.

| Requirement area | Target MVP interpretation | Still open / excluded |
| --- | --- | --- |
| Current product | Retain the existing reviewed cashbook and its tested behavior as the current release baseline. | Do not describe the current release as a double-entry ledger. |
| Accrual books | Add reviewed, balanced journal entries and a chart of accounts. Keep cashbook transactions as cash activity and journal entries as accounting postings; they are related but not interchangeable. Recognize income/expense at service-delivery/goods-received date. | Posting trigger, correction/void rules, historical start date/source completeness, pre-history balances and named accounting standard. |
| Business documents | Supplier bills and customer invoices may become reviewed accrual records; downloadable customer invoice artifact only. | Required identity, numbering, line/tax fields; no email sending. A document alone is not a settlement/cash movement. |
| Payment | One full payment linked to imported bank activity or explicitly recorded once. | Partial/split/installment/refund/overpayment and payment execution are excluded. Required method/reference/account fields remain open. |
| Statement input | Existing deterministic CSV/Excel/selectable-text PDF plus OCR for agreed scanned layouts. | Layout coverage and file/page/row limits must be bounded and tested. Unknown layouts remain unresolved. Universal format support/live bank connections are excluded. |
| Financial statements | Trial balance, income statement, balance sheet and cash-flow statement are in the target. | Cash-flow method and account-to-cash-flow classification need definition; no standards-compliance claim. |
| Tax | A gated draft workpaper may use a versioned snapshot of applicable official rules and reviewed code calculations. | Taxpayer facts cannot be inferred. Filing/payment, autonomous advice and compliance claims are excluded. A practitioner review path is required before tax-use claims. |
| AI | AI proposes only uncertain interpretations; deterministic validation and explicit owner decisions control books. | Maximum two concurrent provider calls globally; default one at a time. No per-record fan-out or hidden retries. |

**Cross-document reconciliation:**

| Artifact | Required update for this scope | Gate |
| --- | --- | --- |
| `PRD.md` | Distinguish current implemented release from the accepted target expansion; record D15–D19 and preserve the original cashbook acceptance criteria as current-build evidence. | Update this before claiming the expansion as current product behavior. |
| `docs/raqam/GLOSSARY.md` | Define accrual basis, journal entry, double-entry ledger, chart of accounts, receivable/payable and financial statement; distinguish a cash transaction from its journal posting. | Terms remain stable definitions, not API/database details. |
| `docs/raqam/CONTRACTS.md` | Do not mutate existing cashbook contracts yet. Later add reviewed journal/account/document/payment shapes after Gate 0B policy approval; the existing `Transaction` must not be overloaded as a journal entry. | Person 1 is sole editor; Person 2 reviews examples before freeze. |
| `TEAM_TASKS.md`, `TEAM_WORKFLOW.md`, `BUILD_PLAN.md` | Map expansion requirements to task IDs and gates after the roster/ownership contradiction is resolved. The existing files still contain the older three-person/track assignments. | No parallel ownership claims until the user names the two active people and confirms boundaries. |
| Migrations and APIs | No migration or feature route until policies, contracts and hosted 008–010 state are verified. | Read-only baseline first; no reapplication of installed migrations. |

**Gate 0A acceptance evidence:** PRD distinguishes current behavior from accepted target; glossary does not equate cash and accrual postings; expansion plan names all accepted and excluded scope; unresolved policy/hosting/team gates remain explicit; Person 2 reviews the user journey; no implementation status is promoted based on the planning record.

**Status:** user-facing target direction is accepted and recorded in the PRD decision register. Gate 0A remains in progress until remaining policy details are resolved, task ownership is reconciled, and Person 2 confirms that the scope and examples match the intended UI journey.

### Gate 0B — settle accrual recognition and journal behavior

**Purpose:** agree on what event creates each journal, how the date is chosen, and how existing cash-import/payment records connect to the general ledger. This policy precedes shared schemas and migrations.

**Proposed operating rules and confirmed choices:**

1. A document or AI output never posts on its own. A user reviews the business event, date and account classification; deterministic code creates the balanced journal only after explicit approval.
2. **Accepted:** revenue is recognized when service is delivered/earned; supplier cost is recognized when goods/services are received/incurred. Use the service-delivery/goods-received date. If evidence for that date is missing, leave the record unresolved until the owner supplies/confirms it; do not silently substitute the invoice date.
3. A reviewed customer invoice earns a receivable/revenue journal only when the service has been earned. A reviewed supplier bill creates a payable against an explicitly reviewed expense or asset account. Any tax line/treatment remains unresolved until explicitly supported; no AI tax/account decision.
4. A confirmed incoming payment debits the selected cash/bank account and credits receivables; a confirmed supplier payment debits payables and credits cash/bank. An imported bank row supplies the cash evidence. Linking an invoice/payment to that row must not create a second cash journal.
5. A direct paid expense may debit its reviewed expense account and credit cash/bank once. Source-document approval alone does not add cash.
6. Every journal balances exactly in integer paisa; the initial currency remains PKR. Posted history is immutable. A correction uses a reviewed reversal/correction entry with an audit reason, not silent mutation.
7. **Accepted:** the owner selects the historical import range. Require supported opening balances for any pre-range positions needed to make reports meaningful. Missing statements or unsupported balances remain explicitly incomplete/unknown, never zero. Do not add an opening journal for periods already reconstructed from history or import a payment twice when an invoice/payment and bank row describe the same settlement.
8. **Starter chart proposal:** asset accounts for cash/bank and receivables; liability accounts for payables; equity/capital accounts appropriate to the confirmed business form; service revenue; and owner-reviewed expense accounts. Add tax/withholding accounts only when applicability and source evidence are confirmed. Every account has a stable ID/type and explicit reporting classification; AI may propose a classification but cannot approve it.

**Illustrative test vectors (PKR, excluding tax; examples only):**

| Scenario | Proposed journal after review | Cash effect |
| --- | --- | --- |
| Service earned and customer invoice approved for 100.00 | Dr Accounts Receivable 100.00; Cr Service Revenue 100.00 | None |
| Customer pays that invoice through an imported bank row | Dr Bank 100.00; Cr Accounts Receivable 100.00 | +100.00 once |
| Supplier service received and bill approved for 65.00 | Dr Reviewed Expense 65.00; Cr Accounts Payable 65.00 | None |
| Supplier bill paid through an imported bank row | Dr Accounts Payable 65.00; Cr Bank 65.00 | -65.00 once |
| Bank-first supplier payment, before its bill is identified | Dr review-only Unclassified Cash Clearing 65.00; Cr Bank 65.00. When a reviewed bill is later linked: Dr Accounts Payable 65.00; Cr Unclassified Cash Clearing 65.00 (in addition to the bill's Dr Expense / Cr AP accrual). | -65.00 once; final clearing and payable balances are zero |
| Manual-first supplier bill and payment, then matching bank import | Bill: Dr Reviewed Expense 65.00; Cr Accounts Payable 65.00. Explicit payment: Dr Accounts Payable 65.00; Cr Bank 65.00. Later bank row links to that payment and creates no journal. | -65.00 once; final payable is zero |
| Correction to a posted supplier expense account | Reverse original: Dr Accounts Payable 65.00; Cr Previously Selected Expense 65.00. Corrected entry: Dr Correct Expense 65.00; Cr Accounts Payable 65.00, with linked immutable reason/history. | None |
| Customer invoice issued before service is delivered | Keep the receivable/revenue recognition unresolved; no revenue journal until the service date is confirmed. Any advance-payment or deferred-revenue treatment is out of scope until separately approved. | No cash until payment evidence; no premature revenue |
| Historical import begins at a confirmed date | Reconstruct journals only from supplied/confirmed records; require supported opening positions for any pre-existing balances needed in reports. Unknown/missing history stays explicitly incomplete, never zero. | Only source-supported cash activity is counted; earlier/unavailable periods are shown as incomplete |

These vectors are review scaffolding, not production acceptance answers. The user approved the review-only clearing treatment for unclassified bank activity. Tax, advance payments, supplier prepayments, fixed assets/depreciation, inventory, foreign currency, period closing and corrections across a closed period need explicit decisions or remain unsupported.

**Reports:** the user selected a trial balance, income statement, balance sheet and cash-flow statement. The cash-flow statement uses the direct method from reviewed cash movements, grouped by explicit operating/investing/financing classifications. Reports require period/as-of dates and unresolved-history coverage. No report is certified or standards-compliant without qualified review.

**Gate 0B acceptance evidence:** user-approved service/receipt recognition date and missing-date behavior; owner-approved posting triggers; user-selected historical import range and supported-opening-balance rule; agreed starter account types and direct cash-flow method; balanced illustrative vectors for earned/unearned edge cases, bills, both payment/import orders, duplicate linking and correction; cash movement is posted once; review-only clearing for unclassified bank activity; AI is proposal-only. Only then may Person 1 translate these into canonical contract shapes and tests.

**Status (10 October follow-up):** user confirmed service/receipt-date recognition; user-selected historical range with supported opening balances where needed; direct cash-flow reporting from reviewed cash movements; review-only clearing for unclassified bank activity; and no compliance claim without qualified review. Still needed before contract freeze: source-completeness criteria, service-date evidence requirements, starter account template/entity assumptions, posting/reversal policy details, and explicit confirmation of any named accounting standard (or none). Person 1 may prepare a proposed contract for Person 2 review; it is not frozen until both owners sign off. Migrations remain gated on read-only hosted verification of existing migrations.

## Numbered implementation steps

Each step is a shared milestone with a named primary owner. “Done” requires the listed acceptance evidence and handoff update. No step implies a production deployment.

### Gate 0 — agree scope and baseline (joint; Person 1 facilitates)

1. **Freeze proposed MVP semantics.** Person 1 compares Gate 0 answers with `PRD.md`, `docs/raqam/GLOSSARY.md`, `docs/raqam/CONTRACTS.md`, `TEAM_TASKS.md` and `BUILD_PLAN.md`; proposes exact changes and exclusions. Person 2 walks the desired upload-to-reviewed-books flow and flags screens/AI calls that need different contracts. User accepts unresolved scope decisions before code.
   - **Evidence:** updated PRD decision register and glossary terms; supported states, currencies, tax scope and exclusions agree. No migration or feature route is started before this.
2. **Record real baseline.** Person 1 checks Git status, app tree, existing cash movement/document/match APIs, migrations, current hosted migration status, environment names (never prints values), scripts, current branches and running server. Person 2 checks existing UI flows and test fixtures read-only.
   - **Evidence:** baseline revision and commands in handoff; unrelated files preserved; current checks and hosted unknowns listed precisely.

### Phase 1 — contract and foundation (Person 1 leads; Person 2 contract consumer)

3. **Publish canonical lifecycle and ledger contracts.** Person 1 defines account IDs/types/report classifications; journal headers and debit/credit lines; period/as-of report inputs; source locator; owner scope; expense/bill/invoice/payment/statement movement; proposal, review decision, exception, idempotency key, optimistic version and state transitions in existing shared contracts. Specify integer-paisa balancing, explicit currency, immutable posted journals, reversal corrections and historical-import coverage/completeness. Person 2 reviews every screen/AI input/output against shared synthetic fixtures; no duplicate private schema.
   - **Evidence:** contract tests reject unbalanced journals, unsupported accounts, bad amounts, foreign IDs, stale versions, duplicate IDs, incomplete batches and invalid transitions; trial-balance debits equal credits; both owners sign off in handoff.
4. **Build ledger persistence and access controls.** Person 1 designs additive account, journal, journal-line, source-link and report-support migrations plus owner-scoped APIs. Preserve source immutability, review history, unique source/payment links, exact PKR arithmetic, atomic posting/idempotency, reversal audit, historical-import completeness, rollback strategy, RLS and audit. Verify existing 008–010 before deciding whether any new migration is needed. Person 2 creates only UI/API fixtures and screen shells behind the frozen contract.
   - **Evidence:** local DB/security tests cover two workspaces, direct-access denials, unbalanced/duplicate posting rejection, retry, concurrency, stale writes and rollback; migration dry-run/schema comparison and repair plan pass. No hosted write until manually authorized by project workflow.

**Current execution status (10 October 2026, after Person 1 Steps 3–5 work):** Step 3 has a proposed Zod contract in `src/lib/contracts/ledger.ts` covering source locators, reviewed recognition-date evidence, exact reversals, financial-report schemas and history coverage. Contract tests pass **14/14** after review fixes. Person 1 has recorded an integrator compatibility sign-off against the locally cached Person 2 workflow map at `58e73ec`, at the user's direction. Person 2 has not acknowledged the contract, and policy decisions on source completeness, starter account assumptions and named accounting standard remain open; the contract is not a bilateral freeze. Step 4 is **blocked/not started** until those shared decisions are recorded and hosted state of invoice migrations 011/012 is verified; 008–010 were confirmed by the user, 011/012 are only locally testable. No ledger migration or API was written. Step 5 has pure server BigInt calculations for the four selected statements; its **8/8** independent fixtures distinguish accruals from cash settlement and check coverage/reconciliation. Source-ingestion validation, ledger persistence/API wiring, import integration and hosted/browser report verification remain undone. `npm test` is **39/41 files** because two failures remain in preserved AI-provider/receipt/invoice paths; `npm run typecheck` reports three errors in those unrelated local edits. Targeted TypeScript checking of the ledger files passes. A fetch of the Person 2 branch failed because this environment could not resolve GitHub; review was limited to the cached ref. Do not apply or reapply hosted migrations based solely on local tests.

**Superseding implementation status (10 October 2026, local Person 1 backend work):** migrations/API/calculation work now exists for Steps 4–6 and 8; the previous paragraph is historical baseline evidence. Migration `202610100013_double_entry_ledger.sql` seeds a neutral PKR chart, protects ledger tables behind owner-checked RPCs, supports versioned account changes, balanced immutable postings, source/reversal/idempotency checks, selected-history range recording, manual expense drafts and supplier bills. Supplier-bill approval requires a goods-received date and selected expense/asset account and atomically posts the accrual. Report APIs call the BigInt calculators; missing history remains incomplete. Step 6 now has a manual no-provider draft/review API. Step 7 is partial: the existing private receipt OCR/cache path remains available and bills can link its document record, but invoice/statement document classification and scanned-bank-statement OCR were not implemented. Gate 0 required named scanned layouts and synthetic layout fixtures, which have not been supplied; choosing layouts would invent acceptance criteria. Person 2's UI, expense-note AI extraction, independent review and browser acceptance are not present in this branch, and no bilateral contract sign-off is claimed.

**Local/hosted gates:** PGlite ran migrations 001–013 locally and verified account/journal/bill/note persistence, exact PKR amounts, source and tenant scope through owner-checked RPCs, retry/stale behavior, accounting reports, bill accrual without cash, and the read-only migration readiness query. This is module evidence only. `npm run check:env` reports the five base app/Clerk/Supabase settings absent; `npm run check:services` therefore could not probe hosted services. Hosted migration ledger state for 011/012 remains unknown, so 013 must not be applied or declared hosted. The read-only checker is [scripts/check-bookkeeping-migration.sql](../../scripts/check-bookkeeping-migration.sql); run it only after confirming 011/012 and applying 013 through the team's authorized release procedure. No provider call, hosted write, browser integration, migration application, commit or push was performed.
5. **Implement deterministic source, journal and report validation.** Person 1 reuses existing statement, OCR and match services; adds exact document hashes, required-field checks, line arithmetic, balanced journal posting, duplicate identity/payment-link rules, historical import controls, and code-calculated trial balance, income statement, balance sheet and cash-flow statement from approved records. Person 2 makes deterministic statuses/evidence visible and prepares clean, ambiguous and failure fixtures.
   - **Evidence:** old CSV/Excel/selectable-PDF paths regress green; known clean inputs make zero model calls; independent fixtures prove balanced journals, report period/as-of behavior, trial-balance equality, balance-sheet equation, cash-flow reconciliation and explicit incomplete-history coverage.

### Phase 2 — record capture and document workflows

6. **Written expense draft (Person 2 AI/UI; Person 1 persistence/API).** Person 2 parses a user-entered note into a strict draft; all absent/ambiguous values remain unresolved and edits are explicit. Person 1 persists a versioned draft only through the authenticated route. A fully manual path remains available without provider access.
   - **Evidence:** synthetic tests for varied wording, ambiguous dates/amounts, missing currency, prompt injection, malformed response and provider outage; owner corrects then reloads; exactly one cash movement appears only after explicit confirmation.
7. **Receipt/bill/invoice/scanned-statement intake (Person 2 extraction/UI; Person 1 source/persistence/API).** Reuse the existing private upload and extraction path. Add only the document classes and named scanned layouts approved in Gate 0. Person 2 displays original source beside observed text, normalized proposal, evidence locator, uncertainty and correction. Person 1 owns file access, cache identity, limits, idempotency and immutable history.
   - **Evidence:** clean/changed/unreadable/unsupported fixtures; source access remains owner-scoped; cache/correction reruns are version-safe; OCR alone never creates or changes cash.
8. **Supplier bills (Person 1 lifecycle; Person 2 review UI).** Create distinct draft/reviewed bill records with exact line arithmetic, due date and explicit tax fields only if chosen. When goods/services are received, a reviewed bill posts Dr reviewed expense/asset and Cr Accounts Payable on the goods-received date; bill approval itself is not cash. AI may extract fields but never decide acceptance or tax treatment.
   - **Evidence:** line totals and required fields validate deterministically; unreadable fields stay unknown; correction/history survives reload; accrual journal balances and bill approval leaves cash unchanged; payment later clears payable without duplicate cash.
9. **Customer invoice creation (Person 1 records/artifact; Person 2 builder/preview).** Use only owner-confirmed seller/customer identity, invoice numbering and line fields. Generate downloadable output from persisted values; do not call it FBR-integrated or a compliant tax invoice without separate legal/integration evidence. A receivable/revenue journal is created only for service already delivered on its confirmed service date; invoice issue alone does not recognize unearned revenue. No email sending or payment execution.
   - **Evidence:** preview/download exactly equals saved fields and deterministic totals; retries do not create duplicate invoice IDs/numbers; issue/create action does not change cash; earned-date accrual balances and an invoice for undelivered work does not recognize revenue.

### Phase 3 — payments, review and AI

10. **Canonical payment event/no-double-count rule (Person 1; Person 2 UI).** A full payment either links to an existing imported bank movement or creates one explicit manual movement. Later bank import links/reconciles to that movement instead of adding another. Person 2 shows source, link state and conflict clearly.
    - **Evidence:** tests for imported-first/manual-first, duplicate retry, conflicting amount/direction/currency, concurrent linkage, stale decision and reload. Cash totals change once and only once.
11. **Deterministic matching and exception queue (Person 1 engine/API; Person 2 review UI).** Run workspace/direction/currency/exact amount/reference/date constraints and duplicate/arithmetic/source checks first. Return `ready`, `needs_review`, `blocked` or `conflict` with evidence/rule IDs and coverage; no heuristic confidence numbers. Person 2 lets an owner inspect, accept, correct or reject and preserves reason/history.
    - **Evidence:** exact cases use zero AI; impossible candidates are excluded; ambiguous/duplicate/incomplete cases remain reviewable; accept/correct/reject survives refresh and concurrency; totals remain unchanged by linking.
12. **Bounded AI proposals and explicit correction rules (Person 2 engine/prompts; Person 1 proposal/review persistence).** AI may suggest unresolved field/document/vendor/category/match interpretations only. Validate IDs, versions, category membership, batch completeness, source evidence and tenant scope against Person 1's contracts. Batch only the deterministic shortlist; cache by owner/source/version/model/prompt/schema; reserve provider budget. Enforce a global ceiling of two concurrent provider requests across all features/providers, with sequential execution by default. Accepted user decisions are never overwritten on rerun.
    - **Evidence:** offline scripted provider tests for clear/ambiguous/foreign/malformed/incomplete/prompt-injection/rate-limit/cancel cases; correction/rerun integration; no provider call for deterministic-resolution cases; measured live evaluation is separate.
13. **Exact ledger reports, cash summaries and anomaly dashboard (Person 1 calculations/API; Person 2 screens).** Calculate trial balance, income statement, balance sheet, cash-flow statement, cashbook movement, accepted-category totals, open/paid document states and exception counts in code from approved journals and canonical cash movements. Every report states its period or as-of date, owner scope, included sources and history completeness; expose missing coverage as unknown/incomplete rather than zero. Reconcile the cash-flow report to cash-account movements and the balance sheet to assets = liabilities + equity. AI may explain cited results but cannot calculate or modify them.
    - **Evidence:** independent fixtures prove total debits equal credits; trial-balance equality; income/expense period cutoffs; balance-sheet equation; cash-flow/cash-account reconciliation; and consistent cash totals across ledger, cashbook, exports and assistant facts. Tax labels never appear as ledger categories; gaps are not reported as zero or fraud.

### Phase 4 — conditional FBR tax workpaper

14. **Select one tax profile and assemble versioned rule pack (Person 1 calculations/provenance; Person 2 bounded review/UI; qualified practitioner validates).** Use official primary sources with effective dates, tax-year applicability, source URL/version/hash, reviewed interpretation, deterministic formulas, test vectors and reviewer. Preserve old versions. Workpaper includes tax profile/year, selected source records, exclusions, missing schedules, calculations, rule version and review status. The model only maps supplied evidence to those rules and flags gaps; it abstains on unknown law/profile. This slice is conditional and omitted from release claims unless its profile and practitioner gates pass.
    - **Evidence:** practitioner signs off each supported profile/rule fixture; independent calculations match hand-worked expected values; user can inspect every source; no tax filing/payment. Without the tax gate, this task stays blocked and is omitted from MVP claims.

### Phase 5 — integrated acceptance and release candidate

15. **Run the whole journey (Person 2 drives browser; Person 1 verifies server/data; both record evidence).** On two synthetic owner accounts: import a bounded historical period; enter an expense, upload receipt and supplier bill; create/download a customer invoice; approve earned-date accrual journals; import statement activity and link one payment in both bank-first and manual-first cases; review a discrepancy; accept/correct/reject AI proposals; reload/switch owner; inspect trial balance, income statement, balance sheet, cash-flow statement, cashbook and exports; create the selected tax workpaper only if its gate passed.
    - **Evidence:** each action persists correctly after reload; foreign access is denied; historical coverage and unknown opening positions are explicit; journals balance; statements reconcile; every cash event counts once; source/correction/history is preserved; AI provider failure falls back to manual review; screen-reader/keyboard/mobile checks pass; no secret appears in browser/logs.
16. **Freeze and verify MVP candidate (joint; Person 1 coordinates).** Run all focused and combined backend/security/AI/client tests, typecheck, lint if configured, clean production build, signed-out/private-route checks, two-account isolation, migration state, and browser acceptance twice on the exact candidate revision. Person 2 independently checks AI labels and denominator; qualified tax reviewer signs off before any tax accuracy claim. Record timeouts, 429s, cache hits, errors and unresolved records.
    - **Evidence:** release record names exact commit, command/results, dataset and prompt/rule versions, provider request count, hosted migration evidence, known limitations, reviewers and timestamp. No feature is “done” because code exists; every acceptance path must pass.

## Required test/evidence matrix

| Area | Minimum evidence before integrated pass |
| --- | --- |
| Exact books | Integer-minor-unit arithmetic; balanced journal lines; trial-balance debits=credits; income statement period cutoffs; balance-sheet equation; cash-flow-to-cash reconciliation; source-supported history coverage; expense/bill/invoice lines; cash totals before/after each transition; no duplicate payment/import retry. |
| Source and review | Original file/text/hash/locator retained; corrections separate; histories immutable; unknown fields remain unknown; unsupported layouts are explicit. |
| AI | Scripted failure suite plus held-out independent labels; provider/model/prompt/schema recorded; zero calls for deterministic outcomes; bounded request count/cache/retry/deadline. Never use the model's self-reported confidence as a quality metric. |
| Security | Two-owner API, DB, storage and export isolation; signed-out/expired-session denial; no service-role bypass or client secret; logs contain no raw documents/secrets. |
| Payment/reconciliation | Imported-first and manual-first; duplicate/concurrent/stale/conflict cases; temporary clearing-account resolution only if explicitly approved; one real movement counted once; accept/correct/reject and reload. |
| FBR | Confirmed legal profile/year/jurisdiction; effective-dated official citations; deterministic test vectors; practitioner review; ledger vs taxable income distinctions; incomplete wealth/withholding evidence handled explicitly. |
| Release | All configured checks; fresh production build; two repeated integrated browser journeys; migration state and rollback path recorded; exact candidate revision frozen. Deployment is a separate explicitly requested release action. |

## Cross-document consistency and start condition

- Preserve original EXP-00–EXP-13 identifiers and the current PRD as authority. This document maps the expansion slices to the two lanes; it does not mark them accepted or complete.
- Keep “cashbook”, “cash movement”, “supporting document”, “proposal”, “review decision”, “source reference” and “tax workpaper” meanings aligned with `docs/raqam/GLOSSARY.md` and existing contracts. Do not call the MVP a full general ledger by implication.
- Do not edit the PRD, migrations, route schemas or task status until Gate 0 decisions are recorded. Then update PRD, glossary, contracts, task board and migration plan together before coding.
- First actionable step is Gate 0, followed by numbered steps 1–5. Gate 0A and Gate 0B are planning subsections, not numbered implementation steps. Feature coding is blocked until the ledger/lifecycle contract is adopted; tax implementation is separately blocked on profile/regime/practitioner review.
- The detailed product safety rules, FBR official references, quota policy and baseline gaps remain in [BOOKKEEPING_EXPANSION_PLAN.md](BOOKKEEPING_EXPANSION_PLAN.md). The original C implementation plan and existing core feature IDs remain unchanged.
