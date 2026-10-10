# Raqam bookkeeping UI expansion

## Subject and audience

**Subject:** A review-first bookkeeping workspace that connects source documents and cash movements to a double-entry ledger, reports, and a tax workpaper.

**Audience:** Small Pakistani businesses and their owners who need to review records themselves and share a traceable workpaper with an accountant.

## Existing visual system

Extend `src/components/ui/theme.module.css` and its existing components. Keep the current monochrome, precise-finance feel; do not introduce another UI kit or visual identity.

- **Tokens:** ink `#18191b`, canvas `#f5f5f3`, surface `#ffffff`, muted `#62656b`, border `#dfe1e3`, reviewed/success `#176444` (existing pending and error tokens remain in use).
- **Type:** Arial/Helvetica for interface and amounts; use weight, size and tabular numerals for hierarchy.
- **Spacing:** existing 4, 8, 12, 16, 24, 32, 48, 64 px scale.
- **Radius:** existing 10 px controls, 18 px major panels, pill only for badges/actions.
- **Motion:** existing 150 ms color transition for controls; no entrance animation; honor reduced motion.
- **Memorable element:** a persistent “Books health” strip that ties unresolved items and history coverage to the reliability of the displayed statements. It is data-bearing, not decoration.

## Navigation and screens

Keep the current left navigation on desktop and use its current compact/mobile behavior. Group destinations by the user's job rather than by implementation module.

```text
Raqam / [Business name]                         [Account]
Books       Overview | Transactions | Accounts | Reports
Work        Documents | Bills | Invoices | Review queue
Prepare     Tax workpaper
Ask Raqam
```

### 1. Business and taxpayer profile

```text
[Business profile]                 [Save changes]
[Business identity and accounting setup]
 business name | legal form | activity | province | currency
 recognition date policy | history start | supported opening balances
[Tax profile — incomplete / confirmed]
 taxpayer type | residency | tax registrations | tax year
 filing history | relevant prior-year schedules | source/evidence
[Profile completeness and missing answers]     [Ask Raqam to help]
```

Reuse first-workspace setup, then expose an editable profile page. Tax facts are explicitly marked **confirmed**, **missing**, or **assumed** with provenance and a user confirmation action. Ask only for facts required by the selected tax-year workflow. No age, residency, filing history, legal status or eligibility is inferred from silence. Persistence is gated on an accepted owner-scoped profile API; do not show a successful save before that API exists.

### 2. Books overview, accounts and reports

```text
[Books]  Period selector                 [History: complete / incomplete]
[Cash] [Receivables] [Payables] [Unresolved]
[Books health: 4 items need review; coverage begins ...]
[Trial balance] [Income statement] [Balance sheet] [Cash flow]
 Report-specific period/as-of selector and source coverage
[Recent journals / source links / review status]
```

Use existing reports API and exact values. Add account browsing/editing from the accounts API. Reports always display date basis, PKR, history coverage and an incomplete warning when appropriate. Do not substitute invoice “paid” totals for bank cash flow. Link each number to its included records when supported by API evidence.

### 3. Written expenses and supplier bills

```text
[New expense] [New supplier bill]
[Draft / Needs details / Ready for review / Reviewed]
 Original note or source | proposed fields | unresolved fields
 Evidence and arithmetic | account/category proposal | review history
 [Edit] [Save draft] [Confirm review]
```

Wire expense drafts and supplier bills to their existing authenticated APIs. Preserve original text, expose unknowns, and validate totals before review. Make clear that saving a draft or accepting a bill is not a cash payment. A supplier bill review shows the service/goods-received date and payable accrual effect.

### 4. Unified document intake and review

```text
[Add a record]  Receipt | Supplier bill | Customer invoice | Statement
[Original source]             [Extracted / normalized proposal]
 field | value | evidence location | certainty/status
[Unresolved fields and deterministic checks]
[Correct] [Accept fields] [Leave unresolved]
```

Keep today's receipt extraction/review path working. Expose supported CSV/Excel/text-PDF statement import through its existing flow. Scanned-statement OCR stays visibly unavailable until supported layouts, OCR service behavior and fixtures are approved and implemented; do not imply it works merely because PDF upload exists. Document-class routing must follow actual API support.

### 5. Reconciliation and exception review

```text
[Review queue]  Categories | Matches | Exceptions
[Why this needs review] [Source A] [Candidate/source B]
 deterministic checks | AI proposal and evidence | unresolved detail
[Accept] [Correct] [Reject] [Open source]
```

Preserve existing category and match flows. Add an exception view only for server-provided cases (duplicates, unmatched movement, missing recognition date, incomplete history, malformed/unsupported source). Show deterministic reason separately from AI suggestion. Link/approval must not create a second cash movement or overwrite accepted decisions.

### 6. Invoice and payment lifecycle

Keep the existing invoice editor/list/download. Add visible earned/service date and ledger state where contracts support them. A “paid” state must require a linked imported cash movement or explicit manual payment event; do not let a status toggle claim settlement by itself. Payment linking and duplicate conflicts must be apparent in the UI. Partial payments remain out of scope.

### 7. Tax workpaper

```text
[Tax workpaper] [Tax year] [Profile status: needs confirmation]
[Not ready: confirm profile / missing schedules / incomplete ledger]
[Income reconciliation] [Withholding evidence] [Other supported schedules]
[Rule references and effective dates] [Ledger source records]
[Assumptions / unresolved questions / reviewer status]
[Prepare draft] [Download for practitioner review]
```

Build a gated, source-linked review surface. It must not invent a return, call itself FBR-compliant, or imply filing readiness. Until accepted taxpayer-profile, versioned rule-pack and tax-workpaper APIs exist, show a clearly labeled preview/gate and never persist or calculate a real tax liability in client code. The user's requested tax feature remains conditional on qualified review.

## Shared component plan

- Reuse `.root`, `.app`, `.sidebar`, `.nav`, `.main`, `.topbar`, `.pageHeading`, `.panel`, `.table`, `.field`, `.badge`, `.good`, `.pending`, `.bad`, `.notice`, `.tabs`, `.dialog`, and `Icon` from the current theme and UI kit.
- Add narrowly scoped shared patterns only if repeated: `BooksHealth`, `CoverageNotice`, `SourceEvidence`, `ReviewState`, `MoneyValue`, `ProfileFactState`.
- Use semantic headings, `label`/input pairs, table captions, status regions and native buttons. Keep keyboard focus visible and status colors paired with text/icons.
- Do not add imagery or external assets. Use existing icons and CSS/data visuals; this is a financial workspace, not a marketing landing page.

## Implementation sequence

1. Add the books navigation and report/account screens using the current ledger APIs; load/test empty, populated and incomplete-history states.
2. Add expense-draft and supplier-bill review screens using current endpoints; validate reload and error handling.
3. Upgrade the existing first-run setup into a business-profile flow only after agreeing/publishing its persistence contract; keep tax facts separate from general business details.
4. Integrate existing document intake and add supported statement/source type routing; keep scanned OCR disabled until its server prerequisite is accepted.
5. Expand review queue to render only available exception data; retain accepted category/match behavior.
6. Connect invoice status to a canonical payment link before presenting it as settled; otherwise label current state as an invoice workflow status.
7. Add a tax-profile and workpaper review surface gated on real profile/rule/workpaper APIs and practitioner status.
8. Run responsive, keyboard and signed-in integration checks on the combined UI; fix regressions in existing screens.

## Assets

None. Reuse the existing icon component, theme, and CSS-built data presentation. No raster imagery or generated illustration belongs in these financial workflows.

## Done criteria

- Uses the existing Raqam workspace shell and theme; no parallel design system or dependency.
- Every live screen reads/writes its accepted API contract, displays loading/empty/error/success states, and never indicates persistence when a request failed.
- Financial outputs show PKR and period/as-of date, preserve unknown/incomplete status, and distinguish AI suggestions from user decisions.
- Invoice settlement requires linked cash evidence; document approvals and AI proposals do not create cash.
- Profile facts show confirmed/missing/assumed provenance; tax output remains gated unless profile, effective-dated rules, workpaper API and practitioner review state are available.
- At 360, 768 and 1280 px: no horizontal page overflow, usable tables/forms/navigation, controls at least 44 px high, readable line lengths.
- Keyboard tab order follows visual order; focus is visible; screen-reader labels/status messages work; text and button contrast meets 4.5:1; reduced-motion preference is respected.
- Existing receipt, statement import, category/match, invoice and cashbook flows still pass their focused checks; run typecheck, configured tests and build. Capture screenshots at all three target widths and inspect them.

## Anti-generic review

The plan keeps Raqam's existing black/white/gray palette, type, controls, spacing and navigation. It avoids generic gradients, repeated decorative cards, ornamental animation, marketing imagery and arbitrary charts. The distinguishing “Books health” strip directly communicates source-history coverage and unresolved financial exceptions, specific to an evidence-led bookkeeping product.

## Main integration note

The latest main revision already contains the Expenses, Supplier bills, and Books and reports screens. Preserve and use those implementations rather than introducing parallel versions. This integration adds the business and tax profile readiness surfaces, document workflow shortcuts, clearer scanned-statement support copy, and the invoice-settlement guard. Tax profile editing and tax calculations remain gated until their persistence and rule services exist.

## Implementation progress (10 October 2026)

Implemented the books/reports and accounts workspace screen, expense-draft and supplier-bill UI wired to existing APIs, business/tax profile readiness views, document workflow shortcuts, explicit selectable-text PDF/scanned-OCR messaging, and invoice payment-linking guard copy/disabled transition. The demo displays screens without pretending private saves succeeded. Business profile editing/tax profile persistence, tax calculations/workpaper APIs, scanned-statement OCR, canonical payment linkage and server-provided exception API are still prerequisites; their UI remains visibly gated or routes to the existing supported workflow. Verification is recorded in `handoff.md`. Local production build is blocked by the unrelated existing missing `ai-provider-credentials.ts` import in the category proposal route; the development server compiles `/demo` successfully.
