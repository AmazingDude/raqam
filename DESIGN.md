# Raqam frontend design

Approved direction: 10 October 2026. Track B owns this document and the product UI. The user's latest instruction replaces the proposed gold accent with Jinna-like black, white and soft neutrals. Product requirements remain in PRD.md; this is their visual and interaction specification.

## Audience and character

A small service-business owner organizing English, PKR cash records. Raqam should feel approachable enough to open every day and precise enough to review money. The cashbook is the home screen. AI prepares suggestions; the owner makes visible decisions.

## Reference board

- [Jinna](https://jinna.ai/): generous rounded typography, black pill buttons, white text on a dark hero, a calm neutral interface. Borrow hierarchy and palette; do not copy its imagery, typeface, social proof or automation claims.
- [Fortune](https://www.fortune.app/): make the product visible early and connect transactions to evidence. Its gold palette and financial features are outside this direction.
- [Refero / Ramp](https://styles.refero.design/style/b38702a0-75ab-474c-9106-00b624535825): readable financial rows, restraint and clear spacing. No chartreuse accent or proprietary font.
- [Best SaaS / Ruul](https://bestsaaswebdesigns.com/site/ruul): explain a concrete sequence instead of repeating a feature-card grid.

References were visually/textually inspected; no site assets were copied. Landing previews and example-workspace data are explicitly synthetic.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| Ink | `#18191B` | Primary text, primary buttons, landing hero |
| Canvas | `#F5F5F3` | Workspace canvas and quiet sections |
| Surface | `#FFFFFF` | Tables, source viewer, forms |
| Muted | `#62656B` | Secondary text |
| Border | `#DFE1E3` | Structural separators |
| Soft ink | `#292B2E` | Hero inset surface |

Semantic colors: reviewed `#176444`, pending `#805000`, error `#B42318`. Every state also has a written label. Focus uses a high-contrast double ring. Dark-surface secondary text uses `#C5C7CB`, not the light-surface muted token.

One type family: system sans with rounded styling through weight, spacing and generous radii. No font network dependency or new package. Landing heading scales 38–76px; workspace heading 28–36px; body 16px; compact rows 14px. Amounts use tabular numerals and exact paisa formatting.

Spacing: 4, 8, 12, 16, 24, 32, 48, 64px. Controls use 10px radius, large panels 18px, primary buttons and chips are pill shaped. Borders encode grouping; only the landing product preview and dialog get a soft shadow. Motion: 150ms control feedback and one entrance for the product preview, disabled for reduced motion. No decorative chart suggesting unsupported balances/profit.

## Screens and routes

| Route / screen | Layout and behavior | PRD |
| --- | --- | --- |
| `/` landing | Wordmark/nav, centered dark hero, example cashbook with source evidence, Import → Review → Export explanation, final CTA | Introduction |
| `/workspace` | Real workspace setup/loading/error; authenticated cashbook and available source upload APIs | F01 |
| `/demo` | Explicit example workspace, memory-only interactions, reset action, no live AI or persistence claims | Development/demo |
| Cashbook | Three cash movement totals, review coverage separately, search/date/direction filters, table and record detail dialog | F02/F06 |
| Import | Template, original rows, valid/invalid counts, row errors, correction controls, explicit confirmation | F02 |
| Documents | Upload control, source list/status, source beside original and editable proposed fields | F03 |
| Review | Separate categories/matches, rationale and source references, accept/change/reject, ambiguity visible | F04/F05 |
| Assistant | Supported questions, action trail, accessible record evidence, pending/failure recovery | F07 |
| Export | Exact accepted fields, unresolved statuses and source references; demo download clearly named example | F08 |

Cashbook desktop:

```text
┌──────────────┬───────────────────────────────────────────────────┐
│ Raqam        │ Business / PKR                  Export / Import   │
│ Cashbook     │ Cashbook                                         │
│ Documents    │ Cash in         Cash out       Net cash movement │
│ Review   (n) │ [review coverage separate from cash totals]      │
│ Assistant    │ Search / date / direction                        │
│              │ Date  Description  Category  Evidence     Amount │
│ Example/live │ Rows → source and review detail                  │
└──────────────┴───────────────────────────────────────────────────┘
```

Document review:

```text
┌──────────────────────────┬──────────────────────────────────────┐
│ Original source          │ Proposed fields / required unknowns  │
│ Receipt/invoice image    │ Counterparty, date, total, currency   │
│ Source reference         │ Original extraction remains visible  │
│                          │ Save reviewed fields / Unresolved    │
└──────────────────────────┴──────────────────────────────────────┘
```

Landing is centered. Workspace headings and review forms are left aligned. At <1024px the sidebar becomes a navigation disclosure; at 360px totals/rows stack and source review becomes sequential. Touch targets are at least 44px. Controls remain reachable without page-level horizontal scrolling.

## Memorable element and assets

One transaction and its receipt are visibly connected in the landing product preview and the review screen. The original source, proposed fields and reviewed record each have a distinct label. This is the product's strongest visual, rather than a generic chart.

Assets: original inline SVG mark and outline icons; a code-rendered cashbook preview; a code-rendered, labeled synthetic receipt. No copied reference image, generated document, stock testimonial or invented metric. Text is never baked into a bitmap. The implementation removes decorative clutter after screenshot review.

Landing copy: “A little clarity. For every transaction.” Supporting copy explains imported transactions, reviewed receipt details and source-connected decisions. CTAs: “Open workspace” and “Explore an example”. No pricing, customer counts or measured savings.

## Financial and interaction rules

- Exact integer-paisa strings → BigInt formatting/calculations; no floating-point money. Live summary must identify its loaded-record scope until A's summary endpoint is available. Loading/error totals are unknown, never zero.
- Cash totals include validated imported records once. Categories, document review and matching remain distinct. Net cash movement is not profit; no opening balance is invented.
- Uncertain required receipt fields block marking reviewed. Original extraction stays visible after correction. Receipt review never adds a cash transaction.
- Every acceptance is explicit. No bulk acceptance hidden behind another action; ambiguous candidates remain unconfirmed. No fabricated saving/AI/persistence success.
- Disabled integrations have a reason and recovery path. A/C completion gates remain open. Only the example workspace simulates these actions, with a persistent label and reset behavior.
- Useful loading, empty, unavailable, error and confirmation states; disable repeated submissions and preserve drafts on errors. Dialogs use keyboard focus trapping/restoration and Escape; form fields have labels. Status is announced politely, errors assertively.
- Real private records stay in component memory, never localStorage. Abort work and unmount private screens on Clerk identity changes. Demo data is a separate route, cannot become real records and resets on reload.

## Ownership and delivery

Branch: `codex/raqam-frontend`, based on backend foundation `796ce4f`. B changes `src/components/**`, `src/lib/client/**`, `src/app/(workspace)/**`, `tests/e2e/**`, `docs/demo/**`, this document and an append-only handoff/task claim. Minimal `src/app/page.tsx` wiring is included under the user's approved landing implementation. Root Clerk layout, sign-in, middleware, dependencies, contracts, API routes and migrations remain A's integration boundary. Styles are held in B-owned CSS modules.

Available APIs: workspace GET/POST, paginated transactions GET, sources POST and signed source GET. Planned import/review/summary/assistant/export APIs require A/C integration and reviewed payload contracts. Document those gaps in `docs/demo/FRONTEND_HANDOFF.md`; do not mark the core features complete from example interactions.

## Acceptance and evidence

- Landing, cashbook, import, documents/field review, category/match review, assistant and export controls are usable in the labeled example.
- Real setup/record loading/source upload consume existing APIs and fail clearly when configuration or authorization is unavailable.
- Verify 360, 768 and 1280px screenshots, keyboard dialogs/navigation, field labels, focus, contrast and reduced motion. Run strict typecheck, production build and relevant existing checks.
- Exercise exact totals, invalid/unknown fields, ambiguous matches, category changes, evidence links and safe example export. Record denominators and limitations.
- Full deployed import → OCR → review → assistant → export and account isolation remain release gates requiring A/C/live services.
