# Long statement import and Eve

## Implementation

- `pdf-parse` 2.4.5 (Apache-2.0) supplies native ruled-table extraction. Its pinned PDF.js 5.4.296 dependency is shared with the positional fallback for tables without borders. No Python service or model download is needed for this path.
- PDF.js's worker is resolved from the installed package, kept external to the Next bundle, and included with fonts/CMaps in deployment tracing. The previous compiled route looked for a nonexistent worker in `.next/server/chunks`, causing a valid upload to be reported as unreadable.
- Tables are extracted in 25-page batches. Positional text is released after each page. The complete source bytes/hash, raw fields and PDF page numbers remain attached to the preview; numerical normalization stays deterministic. Repeated column headings are excluded. Unknown financial values remain unresolved.
- Review renders 50 rows per page and preserves choices across all pages. Confirmation remains explicit, atomic and retry-safe.
- Migration 010 allows 20,000 rows per import and 50,000 transactions per workspace. Source arrays are indexed once during confirmation/resolution. The snapshot returns all records plus an overflow sentinel; validation refuses oversized snapshots instead of reporting partial totals. Native bank headers use the preview's description index, with compatibility for older previews.
- Assistant summaries, review counts and record evidence inspect the complete validated scope; model-visible pages and returned source lists remain bounded.

## Limits and setup

| Item | Application bound |
| --- | --- |
| Selectable-text PDF | 20 MiB, 1,000 pages, 20,000 rows |
| Extracted text | 2 million text items, 20 million characters |
| CSV/TSV/Excel | Existing 1 MiB / 50-row guard |
| Workspace cash records | 50,000 after migration 010 |
| Review page | 50 rows |
| Explicit correction request | 16 MiB |

Apply `202610100010_long_statement_imports.sql` manually after migrations 001-009. Restart Next after dependencies/configuration change. The host must support the upload size and processing time; the import route requests a 300-second duration. These bounds are not a measured hosting capacity guarantee.

Password-locked PDFs need an unlocked copy. Image-only/empty pages require OCR or another bank export; mixed selectable/scanned files fail rather than return silently incomplete totals. Account tables with changing column meanings must be imported separately. A private UBL sample was inspected locally: cash fields agree with an independent extraction and running balances reconcile, but wrapped narration and page text produce false review rows. Logical row reconstruction, balance checks and saved-preview recovery are planned in [STATEMENT_IMPORT_PLAN.md](STATEMENT_IMPORT_PLAN.md); those repairs are not implemented yet. Other real bank layouts and universal bank-format accuracy remain unmeasured.

## Eve

RunAnywhere's documented model ID is `eve`, served at `https://inference.runanywhere.ai/v1/decisions`. It answers choices/yes-no/scores and does not generate text or accept chat completion requests. This integration uses a single choice to route a user question to the existing scoped tools; code supplies validated date arguments, executes the lookup and renders verified observations. Uncertain routing and unsupported periods ask for clarification. Specific record evidence requests currently require the existing conversational provider; Eve's bounded router asks for clarification.

Set `ASSISTANT_PROVIDER=eve` and server-only `RUNA_CLOUD_KEY` in ignored `.env.local`. The default assistant provider remains the configured Groq/Gemini provider until this explicit setting is supplied. A Cloud key is required; model entitlement and available credit are account-specific. No live call or account-balance verification was performed. The published RunAnywhere terms confirm a $5 welcome grant and prepaid credits, with requests refused after the balance is exhausted. Eve does not replace PDF reading, OCR, financial arithmetic or human confirmation.

## Verification

- 400-page selectable-text synthetic statement: 8,000/8,000 rows, preserved hash/page provenance, exact PKR inflow/outflow totals; upload exceeds the old 1 MiB guard.
- Compiled Next route: 300-page synthetic multipart upload, 6,000/6,000 rows and exact net movement, with worker/font assets in the deployment trace. Run `node scripts/check-pdf-runtime.mjs` to reproduce; it builds/cleans only an isolated fixture beneath `.next`.
- SQL migration checks: 1,000 initial cash rows, native Narration original fields, unresolved-row correction, immutable retries, foreign-owner denials, complete snapshots, and atomic rollback at 50,000 records.
- Eve tests use scripted responses, not a live model: validated routing, date handling, uncertain/malformed decisions, missing keys, credit/auth denial, bounded responses, cancellation, and summaries/review/evidence beyond the first 50 records.

Final combined revision: 121/121 backend/security tests, 67/67 provider/Gemini/category/client checks and production build with strict TypeScript pass. Production tracing includes worker/fonts. Eve configuration presence is confirmed without exposing the key; account entitlement/balance and a live model response remain unverified.

Hosted migration, signed-in upload/persistence, real bank layouts, scanned-statement OCR and live Eve access remain to be verified.

## Primary references

- [pdf-parse API and license](https://github.com/mehmet-kozan/pdf-parse/blob/main/README.md)
- [PDF.js Node example](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs)
- [Next external server packages](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages)
- [RunAnywhere Eve decisions API](https://docs.runanywhere.ai/wally-cloud/decisions)
- [TypeSafe Jev decision primitives](https://docs.typesafe.ai/introduction)
- [Docling](https://github.com/docling-project/docling): open-source layout/table/OCR alternative for a future dedicated scanned-statement worker; not installed in this task.


### Conservative Eve usage

User requested conservative usage after supplying the key. The adapter sends at most one network request per question, without automatic retries; its final answer step is local. Only the user's bounded question is sent for routing, never the full PDF or cashbook. PDF parsing uses no Eve calls.

Eve calls are serialized across users in each Node process. The default limit is 20 attempted calls per UTC day; attempts count even if a request fails. `EVE_DAILY_REQUEST_LIMIT` can lower that limit (0 disables calls); values above 20 or invalid settings fail closed. This memory guard resets on process restart and is separate for each server instance. It is not an account-wide dollar cap; the provider's prepaid balance/billing controls remain authoritative. No automatic credit-purchase or top-up integration exists in Raqam.

[RunAnywhere billing terms](https://www.runanywhere.ai/legal/terms) confirm the promotional $5 welcome grant, prepaid credits purchased through the console, and refused requests when credit is exhausted. The account's current balance, payment-method and top-up settings were not inspected. Tests use scripted responses and consume no provider credits.
