# Adding a few more features: bookkeeping pipeline expansion

**Status:** accepted target scope; implementation remains gated by task acceptance evidence.
**Prepared:** 10 October 2026, PKT.
**Baseline:** latest local `main` at `5bfe18f`; current PRD, migrations, contracts, routes, UI and C2 handoff inspected.
**Purpose:** define a deterministic-first, AI-assisted path from statements, receipts, invoices and written expenses to a reviewed, persistent bookkeeping ledger.

This plan extends Raqam's current reviewed cashbook. The user accepted the target scope and ledger operating defaults recorded in PRD D15–D20. It does not mark any new feature implemented. Workspace-specific history cutoffs/evidence and scanned-layout limits remain setup decisions.

## What the current code already provides

- CSV/Excel and selectable-text PDF statement imports, exact cashbook transactions, summaries, export, and recovery/review paths for recognized statement layouts.
- Receipt image extraction/review, persistent category proposals and decisions, and source-linked document records.
- Deterministic match candidate preparation, proposal persistence and review controls. The recent candidate path uses exact constraints; semantic AI ranking of ambiguous candidates is still a follow-on task.
- A bounded, read-only bookkeeping assistant backed by scoped facts/tools. It does not create expenses, invoices or payments.

The current database's canonical cash movement is an imported transaction. Receipt and invoice documents are evidence, not cash movements. This expansion must preserve that behavior while adding explicit manual payment/expense origins and links. It must not duplicate the existing statement, OCR, category or match foundations with competing schemas.

## Proposed additions not present in the current app

- Written-expense draft capture and an owner-confirmed way to persist a cash movement that did not arrive in an imported statement.
- Scanned-statement OCR for a bounded set of agreed layouts; existing text-based statement parsing stays deterministic-first.
- Distinct supplier-bill and customer-invoice records and lifecycles; customer invoice generation/preview/download.
- Explicit invoice payment events, paid/open state rules and reconciliation with imported bank transactions without double-counting.
- A deterministic-first exception/duplicate queue with AI ranking/explanations only for ambiguous items.
- One end-to-end surface connecting captured expenses, source documents, invoices, payments, bank activity and exact summaries.
- A tax-year-specific FBR tax workpaper assembled from reviewed records, with a source-linked rule pack, deterministic calculations, an AI completeness/consistency review and human approval.

## Product outcome

An owner can import a supported bank statement, upload receipts and incoming supplier bills, write an expense in plain language, create an outgoing customer invoice, record a payment, review possible links between all these records, and see each confirmed cash movement exactly once in the cashbook. The application keeps original sources, proposed interpretations, review decisions and exact amounts available for audit and correction.

AI is embedded at the uncertain interpretation and ranking steps. Deterministic parsers, validators, database constraints and arithmetic remain authoritative for known formats, money, state changes and totals. A clean deterministic pass uses no model calls. AI suggestions never post entries, approve matches, or declare invoices settled without an explicit user decision and a valid payment record.

## Proposed scope

### Additions covered by this plan

- Manual written-expense capture that produces a reviewable draft.
- Source-aware OCR for receipts, supplier bills, customer invoice images, and a bounded set of scanned bank-statement layouts. Existing CSV, Excel and selectable-text PDF imports remain deterministic-first.
- Supplier-bill records and customer-invoice creation from explicit, reviewed fields. The accepted first version creates a downloadable invoice artifact; external email delivery is excluded.
- Payment records and invoice settlement states. A payment either links to an imported bank transaction or is explicitly entered by the owner as a manual cash movement. When the statement arrives later, reconciliation links to that existing movement rather than posting a duplicate.
- Deterministic-first duplicate, arithmetic, completeness and reconciliation checks with an explicit review queue.
- AI-only suggestions for unresolved document types/fields, free-text expense drafts, vendor normalization, category proposals and semantic reconciliation candidates.
- Exact cashbook summaries and exports that incorporate confirmed manual payments and imported transactions once each.

### Explicitly deferred per the user's direction

- Live bank connections and direct payment execution.
- Universal support for arbitrary bank formats. Scanned statement OCR is bounded to selected, tested layouts and page/size limits; unknown layouts remain visible exceptions.
- Organizations, team membership, accountant roles, invitations and subscriptions.
- Automatic accounting decisions, automatic settlement, unattended posting, or model-controlled mutations.
- Arbitrary web research and general-purpose financial advice.
- Automatic filing/submission to IRIS, tax payment, or a claim that the generated workpaper is legal/tax advice or a certified return.

The existing PRD places full double-entry accounting, tax, payments and invoice creation outside the current core. The user has since accepted full accrual double-entry, accounts/statements, supplier bills, customer invoices, download-only invoice output and one full payment as the proposed expansion direction. These decisions do not silently amend the PRD or establish that any feature is implemented.

## Gate 0 — decisions required before schema or route implementation

Do not guess unresolved details in migrations or invoice/payment contracts. Rows marked accepted capture the user's planning direction; they do not authorize implementation before Gate 0 is reconciled with the PRD and contracts.

| Decision | Recommended first release | Still needs confirmation |
| --- | --- | --- |
| Accounting basis | **Accepted direction:** full accrual double-entry with chart of accounts and financial statements; recognize income/expense at service-delivery/goods-received date; import historical activity; include cash-flow statement; no statutory/accounting-standard compliance claim without qualified review. | Define posting/correction policies, history start and source coverage, pre-history balances, cash-flow method, account template and any intended accounting standard before freezing journal contracts. |
| Invoice directions | **Accepted direction:** supplier bills and outgoing customer invoices; preview/download output only, no email sending. | Define required identities, numbering, fields and tax presentation. |
| Payment behavior | **Accepted direction:** one full payment per invoice, linked to an existing imported bank movement or explicitly recorded once. | Define required date, amount, currency, method/reference and account fields. Partial/split/installment/refund/overpayment are deferred. |
| Invoice fields | PKR, explicit confirmed seller/customer identity, invoice number, issue/due dates, line descriptions, quantities, unit prices, subtotal and explicitly entered tax/discount if selected. | Required legal/business fields, tax handling and numbering format. Do not infer tax rules. |
| Invoice output | Preview and download a generated invoice; keep it as a business document linked to its invoice record. | Email delivery is excluded by the user's accepted download-only scope. Required identity/numbering/tax fields remain open. |
| Scanned statement OCR | **In scope by user direction**, alongside CSV/Excel/selectable-text PDF, for a bounded set of layouts; unsupported layouts go to manual review. | Supply initial statement samples/layouts and approve maximum file/page/row limits before implementation. |
| Manual payment source | An owner-entered payment is a visible, separately sourced cashbook movement and can later be linked to a matching bank row without duplication. | Which payment details are mandatory (date, amount, method, reference, account)? |
| FBR tax workpaper | **Accepted direction:** consult the latest applicable official, effective-dated rules as versioned references; produce only reviewed drafts, with no compliance claim absent practitioner review. | Taxpayer identity, legal form, residency, activity, province, registrations, tax year/type, withholding and prior-year schedules must be supplied or explicitly confirmed. Missing filing history stays `unknown`; never assume “never filed” or infer age/eligibility from missing data. |

After Gate 0, update `PRD.md`, `docs/raqam/GLOSSARY.md`, `docs/raqam/CONTRACTS.md`, the task board and migrations plan together. Preserve old acceptance criteria where still valid and mark superseded requirements explicitly.

### FBR tax scope gate (required before EXP-12)

Do not infer a filing obligation or tax treatment from the cashbook's categories. FBR material distinguishes tax years and taxpayer/return forms; its online individual filing guidance includes a wealth statement, and sales-tax returns contain period-specific output/input tax reporting. A ledger alone therefore cannot determine every return line. The applicable regime depends on taxpayer legal form, activity, registration, jurisdiction and tax year. For a service business, explicitly check whether any provincial service-tax obligation exists as well as federal obligations.

The first tax slice, if its profile and review gates are met, should produce a **draft workpaper/statement**, not file or pay tax. It must declare its tax year, confirmed taxpayer profile, sources included, missing schedules/documents, rule-pack version and review status. The AI may map supplied evidence to candidate rule references and flag gaps or inconsistencies; exact calculations use reviewed, versioned code rules, and tax classifications/deductions remain subject to owner/practitioner review. Missing taxpayer facts are questions or `unknown`, never guessed defaults. Use only the latest applicable official materials as a source snapshot and recheck them for each target tax year. Never imply that the model has cloned or exhaustively encoded FBR law.

The initial curated FBR rule pack should link to versioned primary material rather than mirror the entire FBR website. Store rule identifiers, tax type, effective dates, tax-year applicability, official source URL and document version/hash, reviewed interpretation, deterministic formula/mapping (where applicable), test examples and reviewer. Keep prior-year versions immutable and require a deliberate update/review when FBR publishes amendments. The official materials checked for this proposal include:

- [Income Tax Ordinance, 2001 (FBR page lists amendments through 30 June 2026)](https://www.fbr.gov.pk/Categ/Income-Tax-Ordinance/326/1000).
- [Income-tax period and tax-year definition](https://www.fbr.gov.pk/income-tax/81145/81149).
- [FBR online income-tax return and wealth-statement guidance](https://fbr.gov.pk/categ/file-income-tax-return/51147/80860/71160).
- [Withholding-tax rate cards (FBR lists TY2027 updated through 30 June 2026)](https://www.fbr.gov.pk/withholding-taxes-rate-card/174298/174301).
- [FBR sales-tax return overview](https://www.fbr.gov.pk/categ/file-sales-tax-return/51148/50849/101158).
- [FBR electronic-invoicing FAQ](https://www.fbr.gov.pk/faqs/173967/173969); the FAQ says the governing Acts/Rules prevail and describes licensed-integrator requirements for FBR-integrated electronic invoicing. A downloadable Raqam invoice must not be represented as an FBR-integrated tax invoice unless that status is separately established.

The cited versions are only the source snapshot checked on 10 October 2026; re-check official publications before using any rule for another tax year. Have a qualified Pakistan tax practitioner validate the selected profile, rule interpretations and draft return mapping before product claims or customer use.

## Deterministic-first pipeline and AI quota policy

```text
input/source
  -> deterministic identification and parsing
  -> exact validation and rule checks
  -> complete records + explicit unresolved queue
  -> one bounded AI request for only useful unresolved items
  -> runtime schema/evidence validation
  -> user review and explicit command
  -> idempotent persistence and exact cashbook projection
```

### Deterministic lane — zero model requests

- Identify known file types and user-selected document intent; reuse existing CSV/Excel/selectable-text PDF parsing.
- Parse known statement headers/columns and dates/amounts; calculate totals, invoice-line arithmetic and running-balance checks with exact integer minor units.
- Apply exact content hashes, import identities, invoice-number uniqueness within an agreed scope, approved vendor aliases and explicit category rules.
- Build a bounded set of compatible reconciliation candidates using workspace, direction, exact currency, amount, reference and date constraints. Reject impossible candidates before any model call.
- Check required fields, source coverage, arithmetic discrepancies, duplicate candidates and state-transition preconditions.
- Produce rule IDs, evidence references and clear states such as `ready`, `needs_review`, `blocked` and `conflict`. Rule results are not invented probabilistic confidence values.
- If deterministic evidence fully resolves the case, do not invoke AI. Keep a user approval step for financial changes even when a rule match is exact.

### AI lane — only for unresolved interpretation

- Use vision extraction for eligible images/scanned pages; use text extraction only when deterministic parsing leaves meaningful ambiguity.
- Parse a written expense into a strict draft (description, amount, date, currency, counterparty and possible evidence); return missing/ambiguous fields rather than filling them by guess.
- Suggest document type only when file/user context does not determine it; suggest vendor aliases, categories and likely receipt/invoice/transaction relationships.
- Rank only the deterministic shortlist. Include supporting and conflicting evidence, reasons for abstention and referenced record IDs drawn from the supplied batch.
- Batch unresolved text/category/match proposals into one schema-validated request when safe. Do not call once per row.
- Enforce at most **two concurrent AI provider requests across the entire application and all providers**, with sequential execution by default and bounded batching. This cap does not permit per-record fan-out, hidden retries or a separate two-request allowance per feature.
- Do not ask a model to repair a hard contradiction such as invalid currency, impossible arithmetic or foreign workspace IDs.
- Do not treat model self-reported confidence as calibrated. Until independent evaluation approves confidence tiers, use proposal/needs-review states and show deterministic signal reasons separately.

### Request-budget, caching and outage behavior

- Run AI on explicit upload/prepare/retry actions, not every render, reload or keystroke.
- Cache successful extraction/proposals by content hash, owner/workspace, input version and provider/model/prompt/schema versions. A correction creates a new version; old evidence remains preserved.
- Batch only within provider context and latency bounds. Set a hard maximum records/documents per request and chunk deterministically; no unbounded retries or hidden follow-up calls.
- Reserve quota for the demo/evaluation. When budget is low or provider access fails, retain deterministic results and put unresolved records in manual review; never block imports or alter confirmed books.
- A concurrency limit is not a request-volume allowance: cache completed work and expose an explicit user action for new inference. Record request counts without source content or secrets.
- Record safe request counts, batch sizes, duration, cache hits, failures and remaining-budget evidence without raw documents, credentials or customer content in logs.

## Ordered implementation slices

The original C steps 1–20 are unchanged. These proposed slices receive new IDs and require Gate 0 before shared schema or money-state changes.

| ID | Slice / lead lane | Dependencies | Acceptance evidence |
| --- | --- | --- | --- |
| EXP-00 | Freeze product semantics and non-goals — A coordinates with B/C | User decisions in Gate 0; latest PRD and hosted migration state | PRD, glossary and accepted contract agree on accounting basis, invoice types, payment rules, fields, supported scanned layouts and explicit exclusions. No code changes before this gate. |
| EXP-01 | Define domain lifecycle and shared contracts — A; review by B/C | EXP-00 | Synthetic examples define chart-of-account types/report classifications, balanced journal headers/lines, trial-balance/income-statement/balance-sheet/cash-flow inputs, expense, customer invoice, supplier bill, payment, statement movement, source evidence, review decision, duplicate link, history coverage and allowed status transitions. Exact money/date/currency and owner scope are explicit. No competing schemas. |
| EXP-02 | Design secure persistence and migration sequence — A | EXP-01; verify hosted migrations 008–010 rather than reapplying | Owner isolation, account and journal persistence, atomic balanced posting, source immutability, idempotency keys, version/concurrency fences, reversal audit, history completeness, review history and uniqueness rules pass local database tests. Migration dry-run and rollback/repair plan are reviewed before manual hosted application. |
| EXP-03 | Deterministic source and validation foundation — A | EXP-01/02 | Existing CSV/Excel/text-PDF imports retain behavior; exact statement and invoice arithmetic, source coverage, hashes and deterministic validation statuses have focused tests. A clean known-format statement makes zero AI calls. |
| EXP-04 | Draft expense capture — C parsing; A persistence/API; B review UI | EXP-01–03 | Typed amount/date/currency extracted from a natural-language synthetic expense; missing values remain missing; user edits/accepts; persisted entry survives reload and changes cash totals exactly once. Provider outage leaves the draft/manual path usable. |
| EXP-05 | Receipt, bill and invoice document intake — C extraction; A source/service; B document review | EXP-01–03; existing receipt path | JPEG/PNG and approved scanned layouts preserve original source and field-level evidence. Supplier bill/customer invoice are distinct records; unknown type/fields are reviewable. OCR alone creates no cash movement. Cache and retry tests prove no duplicate model request or source record. |
| EXP-06 | Supplier bill lifecycle — A service/state; B UI; C extraction proposals | EXP-01/02/05 | Create/review a bill with exact line totals and due date; goods/services received on the confirmed date create Dr reviewed expense/asset and Cr payable, without adding cash. Record its full payment by linking an imported outflow or explicit manual payment; reload shows consistent open/paid state and no duplicate movement. |
| EXP-07 | Customer invoice create/issue lifecycle — A service/artifact; B UI; C optional drafting suggestions | EXP-01/02 | User confirms customer and line fields; generated invoice preview/download matches persisted values exactly. Invoice issue alone creates no cash and no revenue for undelivered service; an earned-date receivable/revenue journal is balanced. No outbound email/API payment execution. |
| EXP-08 | Payment event and no-double-count reconciliation — A atomic persistence; B review UI; C proposal ranking | EXP-01/02/06/07; existing match review | An invoice can be linked to an exact imported transaction or to an explicit owner-entered payment. Later statement import links to the manual movement instead of adding a duplicate. Conflicting amount/currency/date and stale/concurrent decisions are rejected or queued; no silent paid status. |
| EXP-09 | Extend existing deterministic match path with exception queue and bounded AI ranking — A rules/data; B review UI; C AI | Existing `/api/match-proposals` candidate flow plus EXP-03/05/06/08 | Preserve current exact candidate generation and review contracts. Hard constraints prune candidates before AI; deterministic exact references and approved rules are labeled separately from AI-ranked ambiguous candidates. No-candidate cases use zero inference. Proposal evidence resolves to accessible source records; user review persists. |
| EXP-10 | AI enrichment and correction rules — C engine; A versioned storage/API; B review controls | EXP-04/05/09 | Batch only unresolved items; validate every ID/version/category/vendor/evidence reference; accepted decisions survive reruns. Explicit user corrections create owner-scoped rules with explainable precedence, expiry/edit/delete behavior. No model training or rule inferred from an unreviewed suggestion. |
| EXP-11 | Deterministic anomaly checks and financial statements — A exact query/calculation; C optional explanation; B dashboard | EXP-01–10 | Enumerated checks cover duplicate references, line-total mismatch, missing required fields, uncategorized activity, unmatched payments and source gaps. Produce trial balance, income statement, balance sheet and cash-flow statement from approved journals with period/as-of metadata and coverage. Each check/report states scope and coverage; debits=credits, balance-sheet equation and cash-flow reconciliation are tested. Exact cash totals and document/payment statuses reconcile across UI, exports and assistant facts. AI may explain flagged items but cannot invent totals or certify complete absence of errors. |
| EXP-12 | FBR tax workpaper and source-linked rule pack — A tax/profile/rules; C retrieval/review suggestions; B workpaper UI; qualified reviewer validates | Gate 0 plus tax gate; EXP-01–11; confirmed hosted ledger | A selected tax-year/profile fixture yields a versioned draft with traceable ledger/document sources, deterministic calculations, missing-data checklist and source-linked FBR rules. AI review cites only relevant supplied rules/records and can abstain. Tax practitioner independently validates each supported profile. No filing/payment is executed. |
| EXP-13 | Full application and release acceptance — A/B/C jointly | All selected non-tax slices; EXP-12 only if its separate tax gate passes; current core release checks | Synthetic clean/ambiguous/failure fixtures, signed-in two-owner security, historical import coverage, upload/review/reload, invoice generation, balanced journal posting/correction, all four financial statements and reconciliation invariants, payment reconciliation, duplicate retry, exact before/after cash, and (only when tax gate passes) tax workpaper reconciliation; quota behavior, provider outage and production build pass. Live-provider quality, hosted schema, browser journey, expert tax review and deployment are reported as separate evidence. |

## Cross-cutting data and safety invariants

- Imported bank activity and explicit owner-entered payments are the only cash movements. Receipts, bills and invoices are evidence/business documents, not cash by themselves.
- A customer invoice creates a receivable in the selected model; a supplier bill creates a payable/expense record. Only an explicit payment record or linked imported movement changes cashbook totals.
- The same real-world payment has one canonical cash movement. Matching adds a relationship, never a second amount. Idempotent retries return the saved outcome.
- Preserve source content/hash/locator, original extracted text, normalized proposal, reviewed correction and immutable review history as distinct data.
- Unknown amounts/currency/dates remain unresolved, never zero or inferred. All money uses accepted exact helpers and explicit currency.
- AI output is `proposed` or `needs_review`; only an authenticated, version-checked user command changes accepted business state.
- Owner/workspace scope is derived from the authenticated session. Prompt text, model arguments, uploaded document contents and IDs never grant authorization.
- Invoices marked paid require explicit payment evidence and a valid linked or owner-entered movement. A receipt/invoice OCR result alone cannot mark paid.
- Hard accounting rules, arithmetic, tax amounts entered by the user, deterministic summaries, database state and access decisions remain code-owned.
- A tax workpaper names its taxpayer type, applicable tax year, jurisdiction, rule-pack version, included records and unresolved exclusions. It does not equate cash movement with taxable income or assume ledger categories are tax deductions.
- AI tax review is limited to checking a draft against the curated, versioned official sources and records supplied for that run; it must cite rule IDs/source links, distinguish verified arithmetic from interpretation, and abstain when taxpayer facts or law are unresolved.
- FBR rule updates never silently rewrite prior-year workpapers. Rule changes require a new effective-dated version, updated deterministic tests and qualified human review.
- No tax return is auto-filed, no tax is paid, and no FBR-integrated invoice capability is claimed without separate authorization, legal validation and any required licensed integration.
- Any future confidence tier must be evaluated against independent labels by document/transaction type and show its denominator. Until then, expose evidence/rule signals and human-review states, not probability claims.

## Verification matrix

| Layer | Required checks | What it does not establish |
| --- | --- | --- |
| Unit/contract | Exact decimal/minor-unit arithmetic, parser ambiguity, state transitions, evidence locator validation, AI schema/ID/version rejection, cache keys and quota short-circuit | Hosted behavior or model accuracy |
| Database/security | Tenant isolation, RLS, unique/idempotent cash movement, source immutability, review audit, rollback, concurrency and stale writes | Browser usability or production provider availability |
| Deterministic fixtures | Known statement layout, source coverage, duplicate and balance exceptions; zero model calls on fully resolved data | Universal bank compatibility |
| Scripted AI | Receipt/bill/invoice/note extraction, ambiguity, prompt injection, malformed output, provider failure, batch bounds and abstention | Live semantic quality or quota limits |
| Live AI evaluation | Held-out examples for extraction, vendor/category suggestions, match ranking and tax-source review; independent labels, measured precision/recall and request count | User approval correctness, legal applicability or expert tax correctness unless separately validated |
| Hosted browser journey | Signed-in upload → review → payment link → reload → statement import → no duplicate cash → exact summaries; two-owner denial | Full legal/accounting compliance or every possible statement format |
| Release | Production build, migration state, provider secret wiring, request quota, rollback, accessible error states and demo fixtures | Features outside the selected release scope |

## Proposed ownership boundaries

- **Platform/data integrator (A):** scope/contract coordination, exact money, lifecycle schemas, migrations, authenticated routes, persistence, audit/idempotency, cash projections, export, taxpayer profiles, tax-year workpapers/rule versions and hosted verification.
- **Product interface (B):** intake/review queue, field/source comparison, expense editor, bill/invoice screens, payment-link controls, discrepancy review, summaries, responsive/accessibility and browser evidence.
- **AI workflow (C):** source-aware extraction, written-expense parsing, deterministic eligibility adapters, batched unresolved classification/vendor/match proposals, source-bounded tax-workpaper review, confidence/evidence policy, caching/quota budget and live evaluation.
- **Qualified tax reviewer:** independently validates supported taxpayer profiles, effective-dated rule interpretations, deterministic tax examples and generated workpaper mapping before any tax-use claim.
- **Independent reviewer/evaluator:** reserved labels, acceptance matrix and user-flow checks; no owner grades their own AI results alone.

These are role proposals. Confirm actual owners and branch/file ownership before implementation; shared schemas, migrations and UI adapters have one named editor at a time.

For the user's requested two-person MVP execution, use [BOOKKEEPING_MVP_TWO_PERSON_PLAN.md](BOOKKEEPING_MVP_TWO_PERSON_PLAN.md). It assigns exclusive paths and numbered tasks across all EXP slices while preserving the PRD as authority and Gate 0 decisions as blockers.

## Start condition and next task

This document is a plan, not permission to skip shared contracts or apply migrations. **EXP-00 remains in progress** for workspace-specific history/evidence inputs, supported scanned layouts and independent journey review. **EXP-01/02/03 have backend implementations in cached `origin/main` `91bd612` (ledger code `d80f777`)**: contracts, migration 013, scoped account/journal/report/expense-draft/supplier-bill routes and deterministic calculations. Focused ledger checks pass 23/23 at `d80f777`; Person 2 review, hosted migration verification and UI/source integration remain open. Do not replay installed migrations. The tax workpaper is a later slice blocked on its separate tax-scope gate and qualified review. Continue with one vertical slice at a time, including invoice/payment settlement and a reviewed expense/bill linked to a synthetic bank movement exactly once.
