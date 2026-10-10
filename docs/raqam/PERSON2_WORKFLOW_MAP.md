# Person 2 workflow and module map

**Status:** preparation only; proposed expansion features are not authorized for implementation until Gate 0 and Person 1's frozen contracts.  
**Baseline inspected:** clean `origin/main` at `1284d65`, 10 October 2026 PKT.  
**Scope:** map current screens/modules to the proposed journey and identify Person 1 dependencies. This is not a product specification or API contract.

## Current user journey

| User step | Existing screen/module | Current behavior and boundary |
| --- | --- | --- |
| Open workspace or example | `src/app/(workspace)/workspace/page.tsx`, `demo/page.tsx`; `LiveWorkspace` | Real workspace loads authenticated records; `/demo` uses local synthetic state. Demo state is not cloud persistence evidence. |
| Import bank activity | `LiveImportScreen`, `ImportScreen`, `src/lib/client/api.ts` | CSV/TSV, Excel and selectable-text PDF preview, corrections and explicit confirmation. Cash comes from confirmed imported rows. Scanned statement OCR is not present. |
| Inspect cashbook | `Cashbook`, `LiveRecordDetail` | Exact backend summary, visible transaction page, original/reviewed description and review/source access. Whole-workspace summary remains separate from table filters. |
| Add supporting document | `DocumentsScreen`, AI extraction module | Private image source, extraction proposal, original-vs-corrected fields, explicit review/unresolved path. Existing scope is receipt extraction; OCR does not create cash. |
| Review categorization and matching | `ReviewScreen`, `review-screen.tsx`; server APIs | Category accept/change/reject and match candidate accept/change/reject are proposals followed by explicit review. Current proposal schemas and atomic review behavior are shared contracts owned by Person 1. |
| Ask about records | `AssistantScreen`, `src/lib/ai/fact-registry.ts` | Read-only, scoped assistant; numbers/evidence derive from validated tool observations. Demo answers are deterministic simulations. |
| Export and reopen | `WorkspaceApp`, client API | CSV export and reload paths exist. Signed-in two-owner persistence/account-switch remains an integration gate. |

Current workspace navigation is Cashbook, Documents, Review queue and Ask Raqam. The live app does not yet contain expense-draft capture, separate supplier-bill/customer-invoice lifecycles, invoice preview/download, explicit payment entry/linking, or a tax-workpaper screen. The current review queue covers document fields, categories and receipt-to-transaction matches; it is not yet the proposed cross-record exception queue.

## Existing AI modules

| Module | Current role | Person 2 preparation note |
| --- | --- | --- |
| `src/lib/ai/provider.ts`, `factory.ts`, `gemini.ts`, `config.ts` | Bounded structured text/image/tool provider interface; Groq is the selected runtime path, with existing explicit provider selection. | Consume the adopted interface; do not add dependencies or change global/provider configuration in this preparation. |
| `src/lib/ai/extraction.ts`, `prompts/extraction.ts` | Receipt field proposals with source evidence and unknown/ambiguous outcomes. | Reuse only after Gate 0 approves document types/layouts and Person 1 freezes any lifecycle changes. |
| `src/lib/ai/categories.ts`, `prompts/categories.ts` | Seven-label transaction category proposals; preserves accepted decisions and abstains on ambiguity. | Current guide is a cashbook review guide, not a tax rule set. |
| `src/lib/ai/fact-registry.ts`, `src/lib/ai/eve.ts` | Validated facts/references and bounded assistant tool conversation. | Not an expense-entry or mutation interface; keep tool allowlist read-only. |
| Match candidate ranking | Existing A2 matching service is under `src/lib/server/`, outside the new Person 2 lane. | Consume Person 1's deterministic shortlist/contract for future UI/AI integration; no edits to server matching or persistence from this lane. |

Existing AI tests live in `tests/ai/` and cover provider, extraction, categories and live OCR feasibility. Existing E2E files cover client API and signed-out/manual browser checks. `npm test` runs backend/security tests only; there is no dedicated `test:ai`, `test:e2e`, lint or Playwright package script in the current `package.json`. AI tests can be invoked directly with Node's test runner; HTTP smoke requires the app server to be running. Existing `tests/e2e/FRONTEND_CHECKS.md` clearly labels demo/simulated behavior and must not be reused as live persistence or AI-quality evidence.

## Proposed workflow mapping (contract dependencies, not feature commitments)

1. **Capture:** an owner writes an expense note or imports a supported source. Deterministic file/document identification and exact parsing run first. A fully manual path remains available.
2. **Prepare:** only unresolved fields, vendor aliases, category interpretations or compatible match candidates reach bounded AI. AI receives the smallest approved batch and returns proposals with references that Person 1's contract can validate.
3. **Review:** show original source observations separately from normalized proposals and owner corrections. Keep missing values visible; make source and conflicts easy to inspect. No AI output posts cash, approves a document, settles an invoice or overwrites an accepted decision.
4. **Record and reconcile:** Person 1's persisted records and exact cash projection remain authoritative. UI explains whether a payment links an imported movement or creates one explicit manual movement, preventing duplicate cash.
5. **Summarize and export:** display backend-calculated totals, scope, unresolved coverage and evidence. Proposed FBR workpaper UI remains absent until every tax Gate 0 choice and qualified practitioner review is confirmed.

### Person 1 contract items needed before feature implementation

- One canonical record lifecycle and review-state vocabulary for expense drafts, documents, supplier bills, customer invoices, payments, imported movements, exceptions and tax workpapers (if approved).
- Exact PKR minor-unit, date/time-zone, direction, source locator, owner scope, version, idempotency and stale-decision semantics.
- Frozen request/result shapes and safe errors for new routes; approved document/statement caps and named scanned layouts.
- Candidate shortlist, rule/evidence identifiers, batch completeness, cache identity and correction/rerun semantics.
- Payment-to-import linking and no-double-count contract; invoice states that do not infer settlement.
- For any tax slice: selected legal profile, tax year, jurisdiction/registration, tax type, versioned official rule sources, and qualified practitioner reviewer.

## Preparation boundaries and next handoff

- Product scope remains proposed. The existing PRD is authoritative until Gate 0 decisions are accepted and reconciled across PRD, glossary, contracts, task board and migration plan.
- Synthetic scenarios are in [`tests/ai/fixtures/person2-mvp-development-cases.md`](../../tests/ai/fixtures/person2-mvp-development-cases.md). They are development cases, not reserved held-out evaluation labels and not model prompts.
- Next: Person 1 publishes the Gate 0 decision record and frozen shared contract. Person 2 can then review the contract against this journey and map the approved screens to actual routes before implementing the first vertical slice.
