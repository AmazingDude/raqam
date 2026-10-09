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
- Hashes cover exact source bytes; database identity is unique per workspace/type/hash and source/row. Equal-valued distinct rows remain legitimate. Hash/schema constraints exist; persisted repeat-upload behavior still needs route/Storage integration.

## Owned interfaces and test boundaries

| Interface | Owner | State |
| --- | --- | --- |
| `previewCsv(text)` | A | Pure preview: original values, valid/invalid counts, row errors, exact amounts and content hash; not persisted import |
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

Other routes below are planned. JSON responses use `{ data, error: null }` or `{ data: null, error: { code, message } }`. Collections use `{ items, nextCursor }`. Missing/inaccessible records share `NOT_FOUND`; no raw provider/SQL exception or secret reaches clients.

| Route | Responsibility |
| --- | --- |
| `GET/POST /api/workspace` | Load/create the verified owner's one workspace |
| `POST /api/imports`, `POST /api/imports/{id}/confirmation` | Store original CSV/preview; atomically confirm valid rows |
| `GET /api/transactions`, `PATCH /api/transactions/{id}` | Cashbook queries and audited reviewed corrections |
| `POST /api/documents`, `POST /api/documents/{id}/extraction` | Private image upload/extraction through C's adapter |
| `PATCH /api/documents/{id}` | Reviewed field correction with originals preserved |
| `POST /api/category-proposals`, `POST /api/match-proposals` | Persist C's suggestions separately from accepted records |
| `POST /api/reviews` | Explicit review commands, history and atomic match uniqueness |
| `GET /api/summary`, `GET /api/export` | Scoped deterministic summaries/export |
| `GET /api/sources/{id}` | Short-lived private source access after authorization |
| `POST /api/assistant` | Session-scoped question execution and action trail |

Error/status mapping: UNAUTHENTICATED 401, NOT_FOUND 404, INVALID_INPUT 422, CONFLICT 409, UNAVAILABLE 503. Mutation handlers must reject cross-origin cookie requests. Caps, pagination and concurrency checks belong on the server. Initial CSV guard is 1 MiB; proposed 50-transaction/10-image workspace caps and image sizes await the host/provider gate, rather than being claimed as measured limits.

## Database spine

`supabase/migrations/202610100001_workspace_spine.sql` creates owner workspaces, source metadata and imported transactions. It supplies RLS, private bucket policies, exact bigint constraints, composite same-workspace source references and duplicate-source/row uniqueness. Transaction UPDATE is not granted yet; audited review functions will own corrections. Documents/proposals/review history/matches and atomic import confirmation need later migrations.

The `cashbook_records` security-invoker view casts bigint to text while retaining underlying RLS. Cashbook reads currently return unmatched status because the match tables/review slice do not exist yet; that slice must update the view/mapper before accepted matches are introduced.

Local security tests execute the migration in embedded PostgreSQL with simulated Supabase schemas/JWT claims. Managed Supabase, verified Clerk tokens, Storage HTTP requests and two live users remain required before RQ-01 passes.
