# Raqam shared contract v0.1

Owner: user/A on `codex/raqam-backend`. Types and runtime schemas live in `src/lib/contracts/index.ts` and `schemas.ts`. B owns screens and C owns AI modules; neither redefines these shapes. A selected this first contract under the user's implementation request. B/C acknowledgement is pending; request changes through A before diverging.

## Financial representation and states

- JSON money is a base-10 **integer paisa string**: `10005` means PKR 100.05. Database amounts use nonnegative bigint and must be read as text, never JavaScript numbers. Totals use BigInt internally; serialized net movement can be negative.
- CSV amount is a decimal string with at most two decimal places; direction carries the sign. Explicit zero is allowed. Unknown, blank, negative, excess-precision or unparseable amounts stay invalid, never zero. The template does not accept thousands separators or exponent notation.
- Dates use valid `YYYY-MM-DD`. Template/workspace currency is PKR; an unsupported currency column is rejected. OCR currency preserves original evidence or null, never an assumed PKR value.
- Only an accepted category is attached to a transaction; pending category values live in proposals. Import, category review and matching have separate states. A receipt never becomes a cash transaction.
- C uses `categorySuggestionSchema`/`matchSuggestionSchema` for raw AI output: no owner/proposal ID and only proposed/needs-review state. Full stored-proposal schemas include accepted/rejected history after user review. A's wrapper must scope every referenced record and assign ownership/IDs independently of the model.
- Extracted/corrected document fields remain separate and preserve nulls. Accepted documents will require validated financial fields; that review command remains to implement.
- Source references carry source ID and logical CSV row number (header is row 1). Preview also preserves physical line numbers for multiline fields. Supporting images have a null row number.
- Hashes cover exact source bytes; database identity is unique per workspace/type/hash and source/row. Equal-valued distinct rows remain legitimate. CSV registration/confirmation implement repeat detection; cloud Storage behavior remains to verify. Failed uploads recover only when the exact owner-scoped hash path is visible through Storage object metadata.

## Owned interfaces and test boundaries

| Interface | Owner | State |
| --- | --- | --- |
| `previewCsv(text)` | A | Pure preview including ordered `header`, original values, counts/errors, exact amounts/hash; persisted by the import routes |
| `calculateCashSummary(records, workspaceId, unresolvedCount)` | A | Validates shape/scope/uniqueness; exact cash totals, accepted categories and unreviewed remainder |
| `exportCashbook(records, workspaceId)` | A | Exact decimal amounts, original/reviewed descriptions, statuses/source references; spreadsheet formula escaping |
| Authenticated database/client wrapper | A | Implemented resource guards and request-scoped Clerk-token client; real account provisioning/live tests pending |
| OCR/category/match/assistant engines | C | Pending; return validated proposals to A's route wrappers |
| Product pages/client components | B | Reserved for B; consume shared shapes |

Local scope checks do not authenticate callers. Server handlers must derive workspace ownership from a verified Clerk session and enforce database policies. Clients/model arguments cannot supply trusted ownership. Test expected values are literal synthetic examples; financial tests do not mock internal calculation modules.

## Read-only assistant tools

`assistantToolSchemas` allows exactly these four names. No owner/workspace argument is accepted. List/queue default limit 20, maximum 50; evidence 1–20 IDs in total; date ranges cannot be reversed. Tool execution is pending and must reject inaccessible IDs. C receives scoped read-only executors, never a service-role client. Model loop cap remains three rounds under the PRD guidance.

| Tool | Arguments | Planned result |
| --- | --- | --- |
| `list_transactions` | Optional date/category/review/match filters, limit/cursor | Scoped records, exact amounts and source references; next cursor |
| `get_cash_summary` | Optional dates, required scope `valid_imported_cash` | `CashSummary`, contributing IDs and unresolved row count |
| `get_review_queue` | Required kind, limit/cursor | Outstanding items, reasons/source references; next cursor |
| `get_record_evidence` | Transaction/document ID lists | Original/corrected fields, decisions and source locators |

## Planned API map for B/C

Implemented now: `GET/POST /api/workspace`, paginated `GET /api/transactions`, `POST /api/sources` (one private JPEG/PNG source file) and `GET /api/sources/{id}` (60-second signed link). Source upload returns `{ sourceId, duplicate }`; it does not create a document extraction or cash transaction. Signature/MIME checks do not establish image readability; C's OCR/review slice must handle unreadable sources. An upload saved before a metadata failure can be recovered on retry using its workspace/hash path. Real cloud behavior is pending provisioning.

CSV, transaction review/history and whole-workspace summary/export routes below are also implemented locally. Document/proposal/match/assistant routes remain planned. JSON responses use `{ data, error: null }` or `{ data: null, error: { code, message } }`. Collections use `{ items, nextCursor }`. Missing/inaccessible records share `NOT_FOUND`; no raw provider/SQL exception or secret reaches clients.

| Route | Responsibility |
| --- | --- |
| `GET/POST /api/workspace` | Load/create the verified owner's one workspace |
| `POST /api/imports`, `POST /api/imports/{id}/confirmation` | Store original CSV/preview; atomically confirm valid rows |
| `GET /api/imports/{id}`, `GET /api/imports/template` | Retrieve scoped stored preview/receipt; download authenticated PKR template |
| `GET/POST /api/imports/{id}/resolutions` | Read current confirmed row outcomes; explicitly correct/reject outstanding rows after migration 004 |
| `GET /api/transactions`, `PATCH /api/transactions/{id}` | Cashbook queries and audited reviewed corrections |
| `GET /api/transactions/{id}`, `GET /api/transactions/{id}/reviews` | Reviewed record/version and paginated immutable edit history |
| `POST /api/documents`, `POST /api/documents/{id}/extraction` | Private image upload/extraction through C's adapter |
| `PATCH /api/documents/{id}` | Reviewed field correction with originals preserved |
| `POST /api/category-proposals`, `POST /api/match-proposals` | Persist C's suggestions separately from accepted records |
| `POST /api/reviews` | Explicit review commands, history and atomic match uniqueness |
| `GET /api/summary`, `GET /api/export` | Scoped deterministic summaries/export |
| `GET /api/sources/{id}` | Short-lived private source access after authorization |
| `POST /api/assistant` | Session-scoped question execution and action trail |

Error/status mapping: UNAUTHENTICATED 401, NOT_FOUND 404, INVALID_INPUT 422, CONFLICT 409, UNAVAILABLE 503. Mutation handlers must reject cross-origin cookie requests. Initial CSV guards are 1 MiB, 1–50 rows and 50 total workspace transactions; these are prototype guards, not measured host capacity. The proposed image cap still awaits its gate.

### CSV commands for B

`POST /api/imports` accepts exactly one multipart field `file`, a UTF-8 `.csv`. The result is `{ importId, preview, status, confirmation, duplicate }`; upload creates no cash. `GET /api/imports/{id}` returns the same stored batch without `duplicate`. Preview adds ordered `header` to the existing shape so reordered columns preserve original descriptions correctly.

Confirmation accepts `{ rows: [{ rowNumber, action: "correct", transaction }, { rowNumber, action: "reject" }] }`. `rows` defaults to `[]`. The full corrected transaction uses `cashRowSchema` in `src/lib/contracts/imports.ts`, including exact `amountMinor` string, PKR and nullable reference. Omitted valid rows are imported; omitted invalid rows remain unresolved. Confirmation is an explicit user action. Originals remain intact. The result is `{ importId, importedCount, rejectedCount, unresolvedCount, duplicate }`.

Confirmation writes all cash/history/status in one database transaction. Repeating a completed request returns its original receipt and never reapplies changed corrections. Originals, the confirmation plan and its initial receipt remain stored unchanged. The workspace lock serializes confirmations; multi-client behavior still requires managed database validation.

After migration 004, `GET /api/imports/{id}/resolutions` returns `{ importId, rows: [{ rowNumber, outcome, transactionId }], importedCount, rejectedCount, unresolvedCount }`. Outcomes are `imported`, `rejected` or `unresolved`; only imported rows have a transaction ID. These are current cumulative counts, unlike the original confirmation receipt. Pending batches return CONFLICT until confirmed.

`POST /api/imports/{id}/resolutions` accepts `{ requestId, rows }`: a client-generated UUID and 1–50 explicit correction/rejection decisions using the same full corrected cash shape above. Only originally unresolved, still outstanding rows can be decided. Nothing is auto-imported by this command. A correction creates cash and immutable history; rejection creates history without cash. Original CSV fields remain intact, including unknown amounts and blank descriptions.

The result is `{ importId, requestId, correctedCount, rejectedCount, remainingUnresolvedCount, transactionIds, duplicate }`. Correction/rejection counts describe this request; the remaining count is its saved receipt. Retrying the same ID and exact decisions returns that receipt with `duplicate: true`, without overwriting later cashbook reviews. Reusing the ID with different decisions or trying to decide an already reviewed row returns CONFLICT. Use a fresh GET for current totals after other decisions. Invalid input or the 50-transaction workspace cap rolls back all cash, history and the request receipt together. Ownership is checked before retry lookup; clients cannot supply a trusted owner/workspace.

### Reviewed cashbook commands for B

After migration 003, `GET /api/transactions/{id}` returns `{ transaction, reviewVersion }`. `PATCH` accepts `{ expectedVersion, description?, category? }` with at least one change field. The category must be an explicit guide label or null; a label becomes accepted, while null clears it to needs_review. Money/date/direction/source/owner changes are rejected. Description edits preserve original fields. Changes atomically increment the version and append immutable previous/current values and actor/timestamp. An unchanged save creates no history. A stale request returns 409 CONFLICT; reload before reviewing again. An import retry never overwrites these edits.

`GET /api/transactions/{id}/reviews?limit=20&cursor=0` returns `{ items, nextCursor }` in ascending version order; each item has the shared review-decision fields plus `reviewVersion`. The cursor is the previous page's last version as a string. Only this transaction's reviewed edits appear; import-row decisions remain in the import history.

`GET /api/summary` returns `CashSummary` for the whole workspace. `GET /api/export` downloads `raqam-cashbook.csv` with original/reviewed descriptions, exact decimal amounts, accepted categories and review/match/source statuses. `X-Raqam-Unresolved-Import-Rows` reports excluded rows. Both endpoints reject query filters until filtered summaries are implemented; neither silently totals only the first page. They read one database snapshot under RLS. Unresolved counts include invalid rows in pending imports and unresolved outcomes in confirmed imports; rejected rows are excluded. More than 50 visible cash records fails safely rather than emitting truncated financial results.

## Database spine

`supabase/migrations/202610100001_workspace_spine.sql` creates owner workspaces, source metadata and imported transactions. It supplies RLS, private bucket policies, exact bigint constraints, composite same-workspace source references and duplicate-source/row uniqueness.

Apply `202610100002_csv_imports.sql` second. It adds stored import batches, immutable import-row review history, registration and atomic confirmation functions. Direct transaction INSERT is revoked so cash creation cannot bypass audited confirmation or its cap. Transaction UPDATE remains unavailable; subsequent reviewed edits, documents/proposals and matches need later migrations. The confirmation function uses explicit session-owner verification, a fixed empty search path and authenticated-only execution.

`202610100003_cashbook_review.sql` adds transaction review versions/history, removes direct transaction DELETE and supplies scoped snapshot/review functions. Direct transaction UPDATE remains revoked; only the audited function changes reviewed descriptions/categories. Hosted migrations 001–003 are already applied; do not reapply them.

`202610100004_import_resolution.sql` adds owner-readable immutable resolution receipts, authenticated owner-checked atomic decisions and a current outcome snapshot. It updates summary/export unresolved counts from immutable row history while preserving initial confirmation receipts. Ordinary clients cannot directly write receipts or transactions. Hosted one-account resolution/correction/rejection/retry/conflict behavior now passes. Document/proposal/match persistence remains future work.

`202610100005_review_conflict.sql` is a forward repair for the already-applied review function. It preserves owner/audit/version behavior and uses `PT409` for stale application decisions. Migration 004 also uses `PT409` for resolved-row/request-key conflicts. Never manually raise `40001` for these decisions: it denotes retryable serialization failure and can trigger an infinite managed PostgREST retry loop. Migration 003 remains unchanged for migration history. User reports applying the supplied repair; live stale-review now returns 409 CONFLICT promptly, and all seven one-account groups pass. Do not reapply 001–005. CLI migration history for SQL-editor applications needs verification before future CLI pushes.

The `cashbook_records` security-invoker view casts bigint to text while retaining underlying RLS. Cashbook reads currently return unmatched status because the match tables/review slice do not exist yet; that slice must update the view/mapper before accepted matches are introduced.

Local security tests execute the migration in embedded PostgreSQL with simulated Supabase schemas/JWT claims. Managed Supabase, verified Clerk tokens, Storage HTTP requests and two live users remain required before RQ-01 passes.
