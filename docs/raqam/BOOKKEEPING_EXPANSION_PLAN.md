# Adding a few more features: bookkeeping pipeline expansion

**Status:** proposed follow-on plan, not yet an accepted change to the product PRD.
**Prepared:** 10 October 2026, PKT.
**Baseline:** latest local `main` at `5bfe18f`; current PRD, migrations, contracts, routes, UI and C2 handoff inspected.
**Purpose:** define a deterministic-first, AI-assisted path from statements, receipts, invoices and written expenses to a reviewed, persistent bookkeeping ledger.

This plan extends Raqam's current reviewed cashbook. It does not mark any new feature implemented. The current PRD remains authoritative until the user approves the scope decisions in Gate 0 and updates the relevant requirements.

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

## Product outcome

An owner can import a supported bank statement, upload receipts and incoming supplier bills, write an expense in plain language, create an outgoing customer invoice, record a payment, review possible links between all these records, and see each confirmed cash movement exactly once in the cashbook. The application keeps original sources, proposed interpretations, review decisions and exact amounts available for audit and correction.

AI is embedded at the uncertain interpretation and ranking steps. Deterministic parsers, validators, database constraints and arithmetic remain authoritative for known formats, money, state changes and totals. A clean deterministic pass uses no model calls. AI suggestions never post entries, approve matches, or declare invoices settled without an explicit user decision and a valid payment record.

## Proposed scope

### Additions covered by this plan

- Manual written-expense capture that produces a reviewable draft.
- Source-aware OCR for receipts, supplier bills, customer invoice images, and a bounded set of scanned bank-statement layouts. Existing CSV, Excel and selectable-text PDF imports remain deterministic-first.
- Supplier-bill records and customer-invoice creation from explicit, reviewed fields. The proposed first version creates a downloadable invoice artifact; external email delivery is not included unless separately selected.
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

The existing PRD also places full double-entry accounting, tax filing, forecasting, multi-currency, refunds/netting and split/many-to-many allocation outside its current core. The user has not yet decided whether this expansion changes those boundaries.

## Gate 0 — decisions required before schema or route implementation

Do not guess these choices in migrations or invoice/payment contracts. The recommended defaults below preserve the current cashbook model; they are proposals, not accepted decisions.

| Decision | Recommended first release | Still needs confirmation |
| --- | --- | --- |
| Accounting basis | Extend the reviewed cashbook with customer invoices, supplier bills and linked payment records. Do not claim a statutory or double-entry ledger. | Does “full bookkeeping ledger” mean this operational cashbook, or double-entry journals, chart of accounts, P&L and balance sheet too? |
| Invoice directions | Support both incoming supplier bills and outgoing customer invoices because the requested flow mentions feeding invoices and creating them. | Confirm both directions. |
| Payment behavior | Support one full payment per invoice initially; owner explicitly records the payment or links an imported bank movement. | Are partial payments, installments, overpayments, refunds or multiple payment allocation required now? |
| Invoice fields | PKR, explicit confirmed seller/customer identity, invoice number, issue/due dates, line descriptions, quantities, unit prices, subtotal and explicitly entered tax/discount if selected. | Required legal/business fields, tax handling and numbering format. Do not infer tax rules. |
| Invoice output | Preview and download a generated invoice; keep it as a business document linked to its invoice record. | Is sending/email delivery required? It is excluded by the recommended default. |
| Scanned statement OCR | Support only a small set of agreed layouts, with page regions and exceptions; unsupported layouts fall back to manual review. | Which statement samples/layouts and maximum file/page limits are approved? |
| Manual payment source | An owner-entered payment is a visible, separately sourced cashbook movement and can later be linked to a matching bank row without duplication. | Which payment details are mandatory (date, amount, method, reference, account)? |

After Gate 0, update `PRD.md`, `docs/raqam/GLOSSARY.md`, `docs/raqam/CONTRACTS.md`, the task board and migrations plan together. Preserve old acceptance criteria where still valid and mark superseded requirements explicitly.

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
- Do not ask a model to repair a hard contradiction such as invalid currency, impossible arithmetic or foreign workspace IDs.
- Do not treat model self-reported confidence as calibrated. Until independent evaluation approves confidence tiers, use proposal/needs-review states and show deterministic signal reasons separately.

### Request-budget, caching and outage behavior

- Run AI on explicit upload/prepare/retry actions, not every render, reload or keystroke.
- Cache successful extraction/proposals by content hash, owner/workspace, input version and provider/model/prompt/schema versions. A correction creates a new version; old evidence remains preserved.
- Batch only within provider context and latency bounds. Set a hard maximum records/documents per request and chunk deterministically; no unbounded retries or hidden follow-up calls.
- Reserve quota for the demo/evaluation. When budget is low or provider access fails, retain deterministic results and put unresolved records in manual review; never block imports or alter confirmed books.
- Record safe request counts, batch sizes, duration, cache hits, failures and remaining-budget evidence without raw documents, credentials or customer content in logs.

## Ordered implementation slices

The original C steps 1–20 are unchanged. These proposed slices receive new IDs and require Gate 0 before shared schema or money-state changes.

| ID | Slice / lead lane | Dependencies | Acceptance evidence |
| --- | --- | --- | --- |
| EXP-00 | Freeze product semantics and non-goals — A coordinates with B/C | User decisions in Gate 0; latest PRD and hosted migration state | PRD, glossary and accepted contract agree on accounting basis, invoice types, payment rules, fields, supported scanned layouts and explicit exclusions. No code changes before this gate. |
| EXP-01 | Define domain lifecycle and shared contracts — A; review by B/C | EXP-00 | Synthetic examples define expense, customer invoice, supplier bill, payment, statement movement, source evidence, review decision, duplicate link and allowed status transitions. Exact money/date/currency and owner scope are explicit. No competing schemas. |
| EXP-02 | Design secure persistence and migration sequence — A | EXP-01; verify hosted migrations 008–010 rather than reapplying | Owner isolation, source immutability, idempotency keys, version/concurrency fences, review history and uniqueness rules pass local database tests. Migration dry-run and rollback/repair plan are reviewed before manual hosted application. |
| EXP-03 | Deterministic source and validation foundation — A | EXP-01/02 | Existing CSV/Excel/text-PDF imports retain behavior; exact statement and invoice arithmetic, source coverage, hashes and deterministic validation statuses have focused tests. A clean known-format statement makes zero AI calls. |
| EXP-04 | Draft expense capture — C parsing; A persistence/API; B review UI | EXP-01–03 | Typed amount/date/currency extracted from a natural-language synthetic expense; missing values remain missing; user edits/accepts; persisted entry survives reload and changes cash totals exactly once. Provider outage leaves the draft/manual path usable. |
| EXP-05 | Receipt, bill and invoice document intake — C extraction; A source/service; B document review | EXP-01–03; existing receipt path | JPEG/PNG and approved scanned layouts preserve original source and field-level evidence. Supplier bill/customer invoice are distinct records; unknown type/fields are reviewable. OCR alone creates no cash movement. Cache and retry tests prove no duplicate model request or source record. |
| EXP-06 | Supplier bill lifecycle — A service/state; B UI; C extraction proposals | EXP-01/02/05 | Create/review a bill with exact line totals and due date; approval does not add cash. Record its full payment by linking an imported outflow or explicit manual payment; reload shows consistent open/paid state. |
| EXP-07 | Customer invoice create/issue lifecycle — A service/artifact; B UI; C optional drafting suggestions | EXP-01/02 | User confirms customer and line fields; generated invoice preview/download matches persisted values exactly. Issuing an invoice does not create cash or imply settlement. No outbound email/API payment execution. |
| EXP-08 | Payment event and no-double-count reconciliation — A atomic persistence; B review UI; C proposal ranking | EXP-01/02/06/07; existing match review | An invoice can be linked to an exact imported transaction or to an explicit owner-entered payment. Later statement import links to the manual movement instead of adding a duplicate. Conflicting amount/currency/date and stale/concurrent decisions are rejected or queued; no silent paid status. |
| EXP-09 | Extend existing deterministic match path with exception queue and bounded AI ranking — A rules/data; B review UI; C AI | Existing `/api/match-proposals` candidate flow plus EXP-03/05/06/08 | Preserve current exact candidate generation and review contracts. Hard constraints prune candidates before AI; deterministic exact references and approved rules are labeled separately from AI-ranked ambiguous candidates. No-candidate cases use zero inference. Proposal evidence resolves to accessible source records; user review persists. |
| EXP-10 | AI enrichment and correction rules — C engine; A versioned storage/API; B review controls | EXP-04/05/09 | Batch only unresolved items; validate every ID/version/category/vendor/evidence reference; accepted decisions survive reruns. Explicit user corrections create owner-scoped rules with explainable precedence, expiry/edit/delete behavior. No model training or rule inferred from an unreviewed suggestion. |
| EXP-11 | Deterministic anomaly checks and summaries — A exact query/calculation; C optional explanation; B dashboard | EXP-01–10 | Enumerated checks cover duplicate references, line-total mismatch, missing required fields, uncategorized activity, unmatched payments and source gaps. Each check reports scope and coverage. Exact cash totals and document/payment statuses reconcile across UI, exports and assistant facts. AI may explain flagged items but cannot invent totals or certify complete absence of errors. |
| EXP-12 | Full application and release acceptance — A/B/C jointly | All selected slices; current core release checks | Synthetic clean/ambiguous/failure fixtures, signed-in two-owner security, upload/review/reload, invoice generation, payment reconciliation, duplicate retry, exact before/after cash, quota behavior, provider outage and production build pass. Live-provider quality, hosted schema, browser journey and deployment are reported as separate evidence. |

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
- Any future confidence tier must be evaluated against independent labels by document/transaction type and show its denominator. Until then, expose evidence/rule signals and human-review states, not probability claims.

## Verification matrix

| Layer | Required checks | What it does not establish |
| --- | --- | --- |
| Unit/contract | Exact decimal/minor-unit arithmetic, parser ambiguity, state transitions, evidence locator validation, AI schema/ID/version rejection, cache keys and quota short-circuit | Hosted behavior or model accuracy |
| Database/security | Tenant isolation, RLS, unique/idempotent cash movement, source immutability, review audit, rollback, concurrency and stale writes | Browser usability or production provider availability |
| Deterministic fixtures | Known statement layout, source coverage, duplicate and balance exceptions; zero model calls on fully resolved data | Universal bank compatibility |
| Scripted AI | Receipt/bill/invoice/note extraction, ambiguity, prompt injection, malformed output, provider failure, batch bounds and abstention | Live semantic quality or quota limits |
| Live AI evaluation | Held-out examples for extraction, vendor/category suggestions and match ranking; independent labels, measured precision/recall and request count | User approval correctness unless browser journey also runs |
| Hosted browser journey | Signed-in upload → review → payment link → reload → statement import → no duplicate cash → exact summaries; two-owner denial | Full legal/accounting compliance or every possible statement format |
| Release | Production build, migration state, provider secret wiring, request quota, rollback, accessible error states and demo fixtures | Features outside the selected release scope |

## Proposed ownership boundaries

- **Platform/data integrator (A):** scope/contract coordination, exact money, lifecycle schemas, migrations, authenticated routes, persistence, audit/idempotency, cash projections, export and hosted verification.
- **Product interface (B):** intake/review queue, field/source comparison, expense editor, bill/invoice screens, payment-link controls, discrepancy review, summaries, responsive/accessibility and browser evidence.
- **AI workflow (C):** source-aware extraction, written-expense parsing, deterministic eligibility adapters, batched unresolved classification/vendor/match proposals, confidence/evidence policy, caching/quota budget and live evaluation.
- **Independent reviewer/evaluator:** reserved labels, acceptance matrix and user-flow checks; no owner grades their own AI results alone.

These are role proposals. Confirm actual owners and branch/file ownership before implementation; shared schemas, migrations and UI adapters have one named editor at a time.

## Start condition and next task

This document is a plan, not permission to skip shared contracts or apply migrations. The next implementation task is **EXP-00**: answer Gate 0, confirm current hosted migration state without reapplying 008–010, update the PRD/glossary/contracts/task board, and agree the one cash-movement identity rule. Then implement one vertical slice at a time, beginning with a reviewed expense or bill whose payment is linked to a synthetic bank transaction and counted once.
