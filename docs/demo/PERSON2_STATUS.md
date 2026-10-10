# Person 2 completion audit

Audited 10 October 2026 against main through `15be321` and the accompanying fixes. Pulled the concurrent landing/workspace refresh and preserved its 10-record category request batch while adding pending-proposal exclusion. This is a task status record, not a competing specification. The expanded track is **not complete**. Existing cashbook contracts support the improvements below; new ledger contracts remain Person 1's responsibility.

## Every requested step

| Step | Status | Evidence and remaining work |
| --- | --- | --- |
| 3: Shared contracts/examples sign-off | Blocked for expansion | Existing contracts cover cashbook, imports, receipts, proposals, assistant and invoices. `src/lib/contracts/` has no account/journal, written-expense, supplier-bill, payment-link or ledger-report contracts. Person 1 must publish these and the approved recognition examples before sign-off. |
| 4: Fixtures and screen shells | Partial | Existing workspace/import/document/review/assistant/invoice screens and synthetic development cases exist. Added executable clean, ambiguous and failed receipt fixtures and a saved-invoice fixture. New ledger screen shells await accepted shapes. |
| 5: Deterministic statuses/evidence | Partial | Match scan coverage is visible. Receipt review now displays original field observations, alternatives, missing/ambiguous state, provenance and safe failures separately from corrections. Cross-record exceptions need contracts. |
| 6: Written-expense capture/edit/review | Blocked | No persisted expense-draft API or recognition contract. Do not treat a receipt or local fixture as a posted expense. |
| 7: Document/scanned-statement intake/review | Partial | Private receipt intake, extraction, correction and review exist. Added evidence and explicit cached recheck feedback. CSV/Excel/selectable-text PDF intake exists; scanned statements and expanded document classes remain absent. Hosted reload/cache verification remains open. |
| 8: Supplier-bill review | Blocked | Bill lifecycle, recognition and persistence contracts are absent. |
| 9: Customer invoice entry/preview/download | Partial | Existing saved invoice builder and API; added verified, escaped HTML preview and download, with print-to-PDF instructions. Downloads use saved exact totals and review version. Earned-date journal integration and hosted create/edit/status/delete/reload/owner checks remain open. This is HTML download, not a server PDF generator. |
| 10: Payment linking | Blocked | Canonical movement source, link conflict, reversal, idempotency and no-double-count contracts/APIs are absent. |
| 11: Exception/matching queue | Partial | Existing category and receipt-match accept/change/reject UI and completeness metadata. Expanded bill/invoice/payment exceptions await contracts and hosted persistence checks. |
| 12: Bounded AI proposals/correction/rerun | Partial | Existing validated proposal and correction/cache services; added one shared in-process provider slot across image/text/tool factory calls, safe zero-attempt busy responses and 10-record category batches excluding accepted/pending records. Multiple server processes still need Person 1's durable shared reservation. Hosted corrections/reruns remain unverified. |
| 13: Reports/anomaly dashboard | Partial | Server cash summaries and existing invoice summaries are available. Ledger financial statements, posting reconciliation, historical coverage and anomaly result contracts/screens are absent. |
| 14: Tax workpaper | Blocked by gates | No approved tax profile/year/jurisdiction/versioned rules/practitioner sign-off. No workpaper UI is implemented. |
| 15: Browser journey | Open | No complete expanded signed-in journey or two-owner/reload/payment/report acceptance. Desktop browser tool could not initialize (missing kernel-assets path). Local HTTP rendering checks are not browser interaction or hosted persistence evidence. |
| 16: Independent AI labels/release | Partial | Offline regression coverage exists. Development scenarios are not reserved held-out evaluation labels. Independent label review, live semantic-quality denominators and final release checks remain open. |

## Changes delivered in this audit

- `receipt-evidence.tsx`: preserves original observations and unknowns alongside corrected review fields; exposes safe failure and extraction versions.
- `documents-screen.tsx` / `workspace-app.tsx`: allows rechecking completed extraction, prevents repeated simultaneous extraction clicks, and reports cache reuse without discarding corrections.
- `invoice-document.ts` / `invoice-preview.tsx`: validates saved invoices, escapes untrusted text, blocks scripts/remote resources, preserves exact money and offers sandboxed preview plus HTML download. Invoice status alone does not prove settlement.
- Invoice list actions use accessible native buttons; deletion has an explicit confirmation. Unsaved editor printing is disabled in favor of the saved-record preview.
- `proposal-batch.ts`: deduplicates and bounds loaded category preparation at 10 records (within the 50-record API maximum), preserves accepted decisions and explains additional loaded records outside the batch. This does not claim all unseen pages were processed.
- `shared-provider-capacity.ts`: factory-created providers share one process slot; busy calls make no provider attempt. Release occurs even when a provider throws. This is not a distributed quota guarantee.

No shared schema, migration, package manifest or lockfile was changed. `npm ci --prefer-offline --no-audit --no-fund --ignore-scripts` restored the existing pinned dependencies. No live model inference or hosted financial write was used for this audit.

## Verification

- Strict TypeScript check passed after the changes.
- Focused client/invoice/batch/capacity tests: **15/15 passed** using synthetic fixtures and mocked providers.
- Full offline AI regression suite: **170/170 passed**; no billable model requests.
- Full backend/security regression suite: **158/158 passed**, including local database isolation, receipt reservations/cache corrections, invoice atomicity and unchanged cash totals. Local database results are not hosted acceptance.
- Local HTTP checks: clean, ambiguous and timeout receipt fixtures returned 200 with source evidence; saved invoice returned 200 with sandboxed preview and download action. These checks do not validate clicks, downloads, visual layout or persistence.
- Temporary `/person2-checks` route was removed after checks; reusable fixture/helper remain under `tests/e2e/`. Prepare with `node tests/e2e/prepare-person2-harness.mjs`; remove with the same command plus `--remove` before production work.
- Production build passed after removing stale generated development types for the temporary route; final integrated checks are recorded in the handoff.

## Next dependency order

1. Person 1 publishes approved ledger/lifecycle/request/result contracts and recognition examples; Person 2 reviews ownership, unknown values, versions, idempotency, reversals and no-double-count cases.
2. Implement expense capture, bill review and payment linking against those APIs, then server-calculated reports and expanded exceptions.
3. Run authenticated hosted receipt/category/invoice journeys, reload and two-owner isolation with confirmed migration/configuration state. The user applies any required SQL.
4. Reserve independent evaluation labels, measure live semantic quality with denominators and complete release checks. Keep tax workpapers gated.

## Continuation: existing review gaps

The user delegated the ownership choice; Person 1 retains the ledger foundation because Gate 0 accounting choices and shared contracts remain unresolved. Main through `d46253d` adds a Gemini schema fix but no expanded lifecycle or ledger contracts. The step statuses above remain partial/blocked.

Implemented in this continuation:

- Category cursor propagation, explicit next-page controls and incomplete-queue wording. Overlapping pages deduplicate IDs and preserve newer reviewed decisions; foreign workspace pages fail closed.
- Suggestions whose transactions are outside the loaded cashbook stay visible. The owner can explicitly fetch the original scoped transaction before reviewing it; these reads do not change cashbook totals.
- Newly generated suggestions remain visible even when their IDs fall outside the first saved page. Generation and page-loading share a synchronous request guard; review actions also prevent duplicate clicks.
- Receipt review now exposes paginated saved extraction/review history, including before/after fields and review states. The client validates target/workspace, ordering, duplicate IDs and the cursor. Unknown amounts remain unknown. History is fetched on demand and resets with the document review version.

Verification: **17/17** client/invoice/batch/page/history regression checks passed with synthetic records and mocked HTTP responses; strict typecheck passed. Final integrated build and AI regression results are recorded in the new handoff entry. Desktop browser initialization was retried and still failed with the missing kernel-assets error. Hosted sign-in/reload/owner isolation, actual downloads, visual interaction and live semantic quality remain unverified. No migration, dependency or shared contract was changed, and no billable inference or hosted write occurred.

## Person 2 continuation on published ledger APIs

10 October 2026, baseline d80f777. Implemented expense-draft capture, local explicit-field preparation, correction and accept/reject; supplier-bill draft lines, evidence comparison and explicit received-date/account approval; chart-of-accounts editing, journal evidence, history-range selection and all four server-calculated reports. Clients validate owner scope, IDs, report period, exact bill arithmetic and decision states; stable command keys recover uncertain retries. User fields survive failures. No shared contract, backend, migration, dependency or hosted data was changed.

The evidence-bound expense-note model helper is implemented and tested offline, with one budgeted attempt and unknown-preserving output. It is not wired to a live expense AI endpoint: Person 1 has not provided that endpoint. Manual and explicit-field preparation work without a provider. Expense acceptance does not yet post a journal or cash movement.

Step 3: Person 2 compatibility review accepts the existing expense/bill/account/report payloads as UI boundaries. This does not approve unresolved accounting policy or freeze payment, scanned-layout or tax semantics. Steps 4�6, 8 and 13 have client/UI implementations against the published APIs; hosted migration 013 and save/reload/two-owner acceptance remain open. Steps 7, 10�12 and 14�16 retain their documented missing APIs, scanned-layout, policy and release gates. The complete expanded product is not finished.

Checks: strict TypeScript, 185/185 backend/security, 176/176 offline AI and 21/21 client checks passed before final upstream integration. Browser opened the isolated example, but full responsive/keyboard and hosted interaction checks were stopped at the user's request to publish promptly while another person handles UI. No billable inference, hosted write or SQL application occurred. Continue UI refinement with the other contributor; Person 1 supplies payment/recognition/intake contracts and migration-state evidence.

### Person 2 continuation: document list pagination

The live Documents screen now follows the existing `/api/documents` cursor and renders an explicit load-more action. Page merging deduplicates overlapping document IDs, retains the highest review version, and rejects records from another workspace. This closes the first-page-only limitation for existing receipt records without changing the API contract or financial behavior. Strict typecheck, focused client tests (28/28) and backend/security tests (187/187) pass. Hosted signed-in pagination/reload remains unverified. Payment linking, full exception lifecycle, revenue journal integration, scanned-layout acceptance, live AI endpoint integration, browser release verification and independent labels remain pending their existing contract/credential gates; tax remains gated.

### Person 2 continuation: expense-note AI proposal

The expense draft screen now offers a bounded, authenticated AI proposal endpoint. It returns schema-validated fields, validates each non-null field against the original note, preserves unknowns, and only fills blank UI fields; it never saves or accepts the draft. The exact source note stays attached for review. Gemini 3 requests use a low thinking level so the configured output cap is available for the structured result, and unsupported regex constraints are enforced by local Zod validation rather than sent to Gemini.

Focused Gemini, expense-note and client checks pass; strict typecheck passes. Two live synthetic requests using the configured `gemini-3.5-flash` model verified structured output and the evidence-bound expense proposal. These establish provider behavior only. The local Clerk/Supabase app configuration is incomplete, so the authenticated route and browser flow were not run. Payment linking, invoice accrual journals, scanned-statement OCR, a unified cross-record exception queue, hosted two-owner/reload acceptance and held-out independent evaluation remain open. Tax stays gated until profile/rule/reviewer prerequisites are supplied.
