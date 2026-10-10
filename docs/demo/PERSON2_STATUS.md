# Person 2 completion audit

Audited 10 October 2026 against main through `15be321` and the accompanying fixes. Pulled the concurrent landing/workspace refresh and preserved its 10-record category request batch while adding pending-proposal exclusion. This is a task status record, not a competing specification. The expanded track is **not complete**. Existing cashbook contracts support the improvements below; new ledger contracts remain Person 1's responsibility.

## Every requested step

| Step | Status | Evidence and remaining work |
| --- | --- | --- |
| 3: Shared contracts/examples sign-off | In review | Person 1's ledger contracts and APIs are now published on main; Person 2's compatibility work is integrated locally. Hosted migration and signed-in acceptance remain open. |
| 4: Fixtures and screen shells | Partial | Existing workspace/import/document/review/assistant/invoice screens and synthetic development cases exist. Added executable clean, ambiguous and failed receipt fixtures and a saved-invoice fixture. New ledger screen shells await accepted shapes. |
| 5: Deterministic statuses/evidence | Partial | Match scan coverage is visible. Receipt review now displays original field observations, alternatives, missing/ambiguous state, provenance and safe failures separately from corrections. Cross-record exceptions need contracts. |
| 6: Written-expense capture/edit/review | Partial | Persisted expense drafts and owner review are connected to an expense accrual action. Payment is separate and only links a confirmed imported cash movement. Expense AI endpoint and hosted acceptance remain open. |
| 7: Document/scanned-statement intake/review | Partial | Private receipt intake, CSV/Excel/selectable-text PDF import, correction and review exist. The compiled PDF runtime check covers 300 synthetic pages; real UBL/scanned layouts and hosted verification remain open. |
| 8: Supplier-bill review | Partial | Bill draft/review/received-date approval and payment linking use the published owner-scoped APIs. Hosted migration and save/reload/two-owner acceptance remain open. |
| 9: Customer invoice entry/preview/download | Partial | Saved invoice builder and escaped HTML preview/download remain; an owner-confirmed service-date recognition action now posts revenue and receivable. Full payment linking marks an invoice paid only after the reviewed bank movement is linked. This is HTML download, not server PDF generation; hosted acceptance remains open. |
| 10: Payment linking | Partial | Migration 016 and owner-scoped APIs link one confirmed, reviewed bank movement to one invoice, supplier bill or posted expense, with exact full-balance checks and an idempotent journal. Hosted acceptance remains open. |
| 11: Exception/matching queue | Partial | Existing category and receipt-match accept/change/reject UI and completeness metadata. Expanded bill/invoice/payment exceptions await contracts and hosted persistence checks. |
| 12: Bounded AI proposals/correction/rerun | Partial | Existing validated proposal and correction/cache services; added one shared in-process provider slot across image/text/tool factory calls, safe zero-attempt busy responses and 10-record category batches excluding accepted/pending records. Multiple server processes still need Person 1's durable shared reservation. Hosted corrections/reruns remain unverified. |
| 13: Reports/anomaly dashboard | Partial | Server cash summaries and four deterministic ledger statements are available with history coverage. Expanded cross-record exceptions and hosted report checks remain open. |
| 14: Tax workpaper | Blocked by gates | Tax-readiness profile capture exists on main. FBR workpaper/rules remain gated on taxpayer, tax-year and qualified review; no tax calculation or filing claim is implemented. |
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

Step 3: Person 2 compatibility review accepts the existing expense/bill/account/report payloads as UI boundaries. This does not approve unresolved accounting policy or freeze payment, scanned-layout or tax semantics. Steps 4�6, 8 and 13 have client/UI implementations against the published APIs; hosted ledger migration 014 and save/reload/two-owner acceptance remain open. BYOK migration 013 is a separate setup and its existing table needs a read-only completeness check. Steps 7, 10�12 and 14�16 retain their documented missing APIs, scanned-layout, policy and release gates. The complete expanded product is not finished.

Checks: strict TypeScript, 185/185 backend/security, 176/176 offline AI and 21/21 client checks passed before final upstream integration. Browser opened the isolated example, but full responsive/keyboard and hosted interaction checks were stopped at the user's request to publish promptly while another person handles UI. No billable inference, hosted write or SQL application occurred. Continue UI refinement with the other contributor; Person 1 supplies payment/recognition/intake contracts and migration-state evidence.

### Person 2 continuation: document list pagination

The live Documents screen now follows the existing `/api/documents` cursor and renders an explicit load-more action. Page merging deduplicates overlapping document IDs, retains the highest review version, and rejects records from another workspace. This closes the first-page-only limitation for existing receipt records without changing the API contract or financial behavior. Strict typecheck, focused client tests (28/28) and backend/security tests (187/187) pass. Hosted signed-in pagination/reload remains unverified. Payment linking, full exception lifecycle, revenue journal integration, scanned-layout acceptance, live AI endpoint integration, browser release verification and independent labels remain pending their existing contract/credential gates; tax remains gated.

### Person 2 ledger/payment integration on current main

Integrated the published current main through `8525e3b` with reviewed expense accrual, invoice service-date recognition, owner-scoped payment listing/linking and the Payments workspace screen. The exact-balance link accepts only a confirmed import with an accepted/corrected review decision and creates one balanced cash/control journal; statement movements not yet categorized can be owner-reviewed into clearing. Migration 016 follows BYOK 013, ledger 014 and tax-readiness 015. Verification: full backend/security suite **195/195**, strict typecheck, webpack production build and compiled PDF runtime check (**6,000/6,000** synthetic rows over **300** pages) pass. The default Turbopack build fails in this Windows environment because its `node_modules` symlink escapes the filesystem root. Hosted migration state, signed-in two-owner flows, live provider calls, deployment and tax rules remain unverified. No hosted SQL was applied.
