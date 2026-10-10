# Statement import recovery plan

Date: 10 October 2026. Status: logical-row repair and legacy-preview recovery implemented; signed-in recovery confirmation remains open.
Task: RQ-04/F02. This plan refines the existing transaction import requirement in PRD.md; it does not replace the product specification.

## Implemented repair

`statement-rows.ts` groups narration/reference continuations, retains opening/closing balance and recognized footer text as statement metadata, and checks running balances with exact minor-unit arithmetic. Unknown money, orphan text and balance discrepancies remain exceptions. Every extracted physical line is retained in a transaction's source lines or statement metadata. CSV/Excel behavior is unchanged.

New previews carry `logical-rows-v1`, source coverage and balance-check counts. Review shows complete narration, original physical lines and statement information; the displayed PDF limits use the shared constants. The supplied selectable-text UBL layout passes an independent private check. This does not establish accuracy for every bank layout or scanned PDF.

For saved legacy previews, the implementation uses their retained source rows and existing audited correction/rejection APIs. The original preview, hash, physical row identities and confirmation receipt remain immutable. A grouped view proposes explicit corrections to pending transactions and rejections of nontransaction fragments. The user can inspect the earlier preview and must confirm decisions. Confirmed cash records retain their saved values; recovery only resolves remaining rows and cannot repost cash. Already imported descriptions require a separate audited transaction edit. This approach requires no additional migration; the revision-changing reparse design in step 4 below remains a future option if source row identities need to change.

Eve is now an optional fallback for one unfamiliar narration heading when deterministic header mapping fails. One request sends only alphabetic table labels, with predefined column choices and an `unknown` option. Strong valid decisions must still pass deterministic column mapping and financial checks. It uses the assistant's shared daily attempt guard, response bounds, a ten-second timeout, caching and no retries. Recognized layouts, including this UBL sample, make no model request. No live Eve call or credit spending was performed during verification.

Verification: 128/128 backend/security tests and 6/6 client checks passed. The final footer safety adjustment passed 13/13 focused parser/header/client checks. After merging published main, 128/128 backend/security tests, 6/6 client checks and strict TypeScript pass in an isolated checkout of the merged revision. Unrelated concurrent invoice edits in the shared workspace still report TypeScript errors and were preserved. Long-PDF synthetic coverage includes 8,000 rows over 400 pages. Browser navigation confirmed the updated picker/help, but automated PDF upload was blocked because the extension's file URL access is disabled. User-confirmed hosted recovery remains unverified. No hosted financial writes were performed.

Remaining: signed-in recovery confirmation/reload; additional bank layouts; geometric source-region previews; account/layout-change isolation; closing-summary checks in application code; scanned-statement OCR. The numbered sections below retain the broader design and acceptance targets, including work beyond this repair.

## Problem established locally

The current importer reads the supplied UBL selectable-text statement and recognizes its cash movements. Its positional fallback then treats every remaining visual text line as another transaction. Wrapped narration, reference continuations, an opening balance and page furniture consequently appear as rows needing correction. The valid rows also retain only the first narration line.

An independent local extraction checked all movement rows against the running balance and the final statement summary. They reconcile. The failure is logical row reconstruction, rather than a reason to reject the supplied statement. This check establishes this sample's extraction arithmetic; broader bank-layout accuracy remains unmeasured.

The original statement, rendered pages, extracted text, customer identifiers, references and financial values are private. They must not become repository fixtures or published examples. Use synthetic layout-equivalent fixtures for automated checks.

## Intended experience

The preview shows transactions with complete narration and source links, one opening balance in statement information, and a concise reconciliation result. Only uncertain transaction fields and unclassified source fragments appear as exceptions. Category review and document matching remain separate from import validation.

The user still confirms import. A parsing exception should say what could not be interpreted and show its source; it must not call the statement incorrect.

## Implementation order

### 1. Reconstruct logical rows before financial normalization

Owned modules: `src/lib/server/pdf.ts`, a small PDF row-assembly helper if needed, and `tests/backend/imports.test.ts` with synthetic PDF fixtures.

- Keep the installed PDF.js/pdf-parse extraction and existing page batches, limits, cancellation and worker tracing.
- Identify transaction table regions and their column geometry. Start with the observed UBL signature: Date, Particulars, Inst. No., Debit, Credit, Balance. Validate the column layout; a bank logo alone is insufficient.
- Classify statement metadata, repeated headers and page footers using page regions and recognized labels. Retain their provenance outside the cash row list.
- Recognize labelled opening/closing balances and brought/carried-forward rows as balance metadata, rather than cash movements. An arbitrary zero-value transaction is not automatically metadata.
- Start a transaction when its date/financial columns establish a row boundary. Attach narration/reference continuation lines within that row's column regions to the same transaction. Handle a continuation across a page boundary after excluding the repeated header/footer.
- A missing date with financial cells, an orphan continuation, a changed account/table or conflicting fields remains an explicit exception. Do not silently discard every undated line.
- Preserve complete original text and page/bounding-box spans for assembled rows. When a reviewed description needs shortening to the existing field limit, preserve its complete source text and require an explicit correction.
- Map explicit instrument-number headers and labelled references where present. Avoid interpreting arbitrary narration digits as a reference.
- Apply the same assembly rules to both native table output and positional fallback; table-library cells can contain multiline content too.

Acceptance: the layout-equivalent fixture yields exactly its labelled cash rows, complete narration, one opening-balance metadata record, and no exceptions from wrapping, blank reference cells or footers. A genuinely incomplete transaction remains visible for review.

### 2. Validate extraction using balances and source coverage

Owned modules: a deterministic statement-validation helper, `src/lib/contracts/imports.ts`, `src/lib/server/csv.ts`, and focused financial/contract tests. The integrator owns the shared contract change.

- Add optional versioned statement metadata to new PDF previews: parser version, account/table grouping, currency evidence, opening/closing balances, validation coverage and source spans. Existing CSV/Excel and stored legacy previews remain readable.
- Parse currency and all amounts into exact minor units. Debit is cash out and credit is cash in for this validated UBL layout. An empty inactive column is distinct from an unknown transaction amount.
- Check `previous balance + credit - debit = current balance` for each movement, including transitions between pages. Preserve source order, including multiple movements on the same date.
- Check that the final available balance agrees with the statement's closing summary when the same account and period are established. Do not manufacture a closing balance when absent.
- A failed equation is an extraction discrepancy requiring source review; do not change amounts to make it pass. A missing balance produces "balance check unavailable" and does not, by itself, invalidate a clear transaction.
- Support stated balance signs/overdraft conventions only when recognized. Isolate different accounts, currencies and table layouts before calculating checks.
- Account for every source fragment: attached to a cash row, identified metadata, or an unresolved fragment. Report page/row coverage independently of balance arithmetic: offsetting errors can reconcile numerically.
- Preserve equal-valued legitimate transactions. Deduplicate by source identity/location and the existing idempotent import rules, rather than matching amount, date and description alone.

Acceptance: a clean synthetic statement reconciles every step; missing, altered and duplicated rows are detected; unavailable balances remain an honest separate status; arithmetic never depends on model prose or confidence.

### 3. Show exceptions in context

Owned modules: `src/components/workspace/live-import-screen.tsx`, source-preview controls and relevant client adapters. Coordinate shared preview fields with the integrator before editing.

- Show logical transaction count, exception count, page coverage, statement currency and reconciliation coverage.
- Use statuses such as "Ready to import", "Needs field review", "Balance discrepancy" and "Could not classify source text". Avoid a generic statement-invalid message.
- Display complete merged narration with the original page region alongside an exception. Explain why opening balances and known page text do not create cash movements.
- Provide a default exceptions view and a view of all transactions. Keep the existing explicit confirmation and 50-row paging for large statements.
- Correct the existing help copy: it still advertises the old 1 MiB/10-page/50-row PDF limits although the backend supports the newer PDF bounds. Derive the wording from the shared limits.
- Continue showing uncategorized/unmatched records as later bookkeeping tasks, without marking an otherwise parsed statement invalid.

Acceptance: the clean fixture needs no per-line rejection; the corrupted fixture directs the user to its exact exception; choices persist across preview pages and no cash records exist before confirmation.

### 4. Recover previously saved previews safely

Owned modules: `src/lib/server/import-persistence.ts`, import API/contracts, the integrator's next available migration, and import recovery/security tests. Complete this before asking the user to reupload the same statement.

Current behavior: source hashes are unique; `register_csv_import` ignores an existing source/import and returns its saved preview. A parser-only fix therefore does not replace an already registered broken preview.

- Record parser versions and provide an explicit reparse path for a pending import. Read its owner-scoped original bytes rather than requiring a changed file or hash.
- Retain the old preview as an immutable revision, then select the new preview under an import lock with a revision check. Confirmation/correction requests bind to the revision they reviewed; stale requests return a conflict rather than being applied to different row numbers.
- Keep source identity, duplicate detection and retry receipts intact. Reparsing does not produce another source or another copy of cash movements.
- Freeze confirmed import outcomes and their original source-row references. A new extraction may propose audited description corrections and classification of leftover nontransaction fragments, but it cannot repost transactions or silently erase decisions.
- For confirmed legacy noise, offer a reviewed grouped rejection of identified nontransaction fragments through the existing unresolved-row decision flow. Genuine incomplete movements remain separate exceptions. Corrections to already imported descriptions use the audited transaction-edit flow.
- Persist only the user's explicit recovery decisions; reopening the source alone performs no financial write.

Acceptance: retrying the exact bytes after a parser upgrade offers the corrected pending preview; stale decisions are fenced; a confirmed source retains exactly its existing cash records; both source ownership and audit history survive recovery.

### 5. Verify against realistic and adverse layouts

Use synthetic UBL-like fixtures with known independent answers, plus a private read-only check of the user's file. Required cases:

- Multiline narration/reference cells, explicit zero in the inactive amount column, blank instrument number, date month names, repeated headings, footers and an opening balance.
- Hundreds of pages, a row continued onto the next page, repeated same-date/equal-amount legitimate transactions, and an account/layout change.
- Missing or misread date/amount, both debit and credit populated, unmatched source text, altered running balance, missing page and equal-but-offsetting errors.
- Pending old-preview reparse, confirmation retry, concurrent/stale preview decisions, confirmed-source recovery and foreign-owner access denial.
- Browser: upload -> exceptions/all-rows preview -> confirm -> cashbook -> export -> reload; exact counts, full descriptions and totals agree.

Record denominators separately for cash-row recall, field correctness, complete narration, source coverage and false exception rate. Synthetic and real-layout measurements must remain distinct. A passing balance equation is one check, not a complete extraction accuracy score.

## Open-source and model choices

The immediate repair uses the already installed [pdf-parse](https://github.com/mehmet-kozan/pdf-parse) and PDF.js. Local inspection showed that the necessary transaction text is available; reconstructing logical rows addresses the reproduced failure without provider calls.

[pdfplumber](https://github.com/jsvine/pdfplumber) exposes character geometry, cropping and configurable table extraction. It is an option for an independent local baseline or a later Python worker if the existing Node path fails measured layout cases; no new runtime service is selected by this plan.

[Docling](https://docling-project.github.io/docling/) supports document layout, table structure and OCR. Evaluate it on synthetic challenging layouts if the native path remains insufficient. Scanned-statement OCR is still a separate unimplemented scope choice under the current PRD; benchmark resource needs and deployment fit before adopting a worker.

[TypeSafe JEV](https://docs.typesafe.ai/introduction) makes structured choices rather than generating text; its [input documentation](https://docs.typesafe.ai/concepts/state) covers text/JSON and does not support PDF/image input. [RunAnywhere's Eve decisions API](https://docs.runanywhere.ai/wally-cloud/decisions) exposes this useful decision interface with model ID `eve`. Its independent service is not evidence of identical model weights. The implemented fallback selects a narration column from extracted labels; PDF.js/pdf-parse still read the file, row assembly joins text, and code verifies cash fields and balances. The existing bounded assistant router remains available. No live model requests or credit spending were needed for the supplied recognized layout.

## Completion gate and next action

The local repair is implemented. RQ-04 remains in progress.

Next refresh the app and reupload the same statement. Review the grouped preview and explicitly save the proposed unresolved-row decisions. Verify that cash count/totals remain unchanged and the decisions survive reload. The product gate still requires user-confirmed persistence, broader realistic-layout measurements and ownership/retry verification; no general claim of universal PDF accuracy is made.
