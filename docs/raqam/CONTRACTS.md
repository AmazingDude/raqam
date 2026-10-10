# Raqam shared contract v0.1

Owner: user/A on `codex/raqam-backend`. Types and runtime schemas live in `src/lib/contracts/`. B owns screens and C owns AI modules; neither redefines these shapes. A2 owns document/proposal/assistant service wrappers. The BA-00 command contracts below are A's canonical implementation boundary; C's retained planning shapes remain proposals until explicitly mapped/adopted. B/C acknowledgement is pending; request changes through A before diverging.

## Financial representation and states

- JSON money is a base-10 **integer paisa string**: `10005` means PKR 100.05. Database amounts use nonnegative bigint and must be read as text, never JavaScript numbers. Totals use BigInt internally; serialized net movement can be negative.
- CSV amount is a decimal string with at most two decimal places; direction carries the sign. Explicit zero is allowed. Unknown, blank, negative, excess-precision or unparseable amounts stay invalid, never zero. The template does not accept thousands separators or exponent notation.
- Dates use valid `YYYY-MM-DD`. Template/workspace currency is PKR; an unsupported currency column is rejected. OCR currency preserves original evidence or null, never an assumed PKR value.
- Only an accepted category is attached to a transaction; pending category values live in proposals. Import, category review and matching have separate states. A receipt never becomes a cash transaction.
- C uses `categorySuggestionSchema`/`matchSuggestionSchema` for raw AI output: no owner/proposal ID and only proposed/needs-review state. Full stored-proposal schemas include accepted/rejected history after user review. A's wrapper must scope every referenced record and assign ownership/IDs independently of the model.
- Extracted/corrected document fields remain separate and preserve nulls. User-confirmed D13 requires valid date, exact total and explicitly confirmed PKR for document acceptance; merchant/reference may remain unknown. Explicit zero is valid; unknown is not zero. This does not infer currency or prove settlement.
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

`assistantToolSchemas` allows exactly these four names. No owner/workspace argument is accepted. List/queue default limit 20, maximum 50; evidence 1–20 IDs in total; date ranges cannot be reversed. Execution now uses request-local cashbook/document reads and rejects inaccessible IDs. The provider receives read-only results, never a database client. Model loop cap is three rounds and three total provider attempts, with at most four unique tool executions.

| Tool | Arguments | Implemented internal evidence |
| --- | --- | --- |
| `list_transactions` | Optional date/category/review/match filters, limit/cursor | Scoped records, exact amounts and source references; next cursor |
| `get_cash_summary` | Optional dates, required scope `valid_imported_cash` | `CashSummary`, contributing IDs and unresolved row count |
| `get_review_queue` | Required kind, limit/cursor | Outstanding items, reasons/source references; next cursor |
| `get_record_evidence` | Transaction/document ID lists | Original/corrected fields, decision versions/timestamps and source locators; latest 20 decisions per record with explicit truncation |

## Planned API map for B/C

Implemented now: `GET/POST /api/workspace`, paginated `GET /api/transactions`, `POST /api/sources` (one private JPEG/PNG source file) and `GET /api/sources/{id}` (60-second signed link). Source upload returns `{ sourceId, duplicate }`; it does not create a document extraction or cash transaction. Signature/MIME checks do not establish image readability; C's OCR/review slice must handle unreadable sources. An upload saved before a metadata failure can be recovered on retry using its workspace/hash path. Real cloud behavior is pending provisioning.

CSV, transaction review/history, whole-workspace summary/export and assistant routes below are also implemented locally. Current main also contains document registration/list/detail/review scaffolding; extraction and proposal generation wrappers remain pending. JSON responses use `{ data, error: null }` or `{ data: null, error: { code, message } }`. Collections use `{ items, nextCursor }`. Missing/inaccessible records share `NOT_FOUND`; no raw provider/SQL exception or secret reaches clients.

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

### Assistant request and answer

`POST /api/assistant` accepts only `{ question: string }` (trimmed, 1–1000 characters, JSON body at most 8 KiB). Clerk supplies identity, the server loads that owner's workspace, and the request must have the configured app Origin. No client-supplied scope, conversation history, credentials or tool results are accepted. Responses are private and `no-store`.

The adopted route/UI schema is `src/lib/contracts/assistant.ts`: `{ workspaceId, question, text, records, citations, actionTrail, partial }`. Citations contain accessible transaction/document IDs and source references, never signed URLs. The UI resolves document previews through the existing private source endpoint. Action entries describe actual executed tools and coverage; no hidden reasoning is exposed. Questions survive failures and in-flight requests are cancelled on screen/account changes.

The model chooses tools and then selects observed result IDs using a small validated JSON response. Code renders all returned financial claims, amounts, counts and references. Arbitrary model prose, invented result IDs and mutable/foreign tool arguments never become an answer. Failed finalization, exhausted rounds and paginated/truncated observations produce a labelled partial answer or clarification. Unresolved import counts always cover the whole workspace even when cash dates are filtered. Repeated identical tool requests reuse the same request-local observation.

Each request has a 45-second deadline, three model rounds/total provider attempts, four unique read executions, and bounded model context. A per-instance guard allows one in-flight request and six requests per minute per owner, with a bounded 1000-entry map; this is not a distributed account quota. Document reads fail closed above 200 rows rather than claiming a partial aggregate is complete. This route uses the existing provider factory (Groq by default); it does not implement OCR/category/match route wrappers or close their release gates.

Error/status mapping: UNAUTHENTICATED 401, NOT_FOUND 404, INVALID_INPUT 422, CONFLICT 409, UNAVAILABLE 503. Mutation handlers must reject cross-origin cookie requests. Initial transaction-file guards are 1 MiB, 1–50 preview rows and 50 total workspace transactions; these are prototype guards, not measured host capacity. The proposed image cap still awaits its gate.

### CSV commands for B

`POST /api/imports` accepts exactly one multipart field `file`: `.csv`, `.tsv`, `.xls` or `.xlsx`, up to 1 MiB. Delimited text recognizes comma, semicolon, pipe and tab separators plus UTF-8, UTF-16 and Windows-1252. Excel reads the first worksheet containing a recognizable transaction table in its first 20 rows. Common date, description, direction, debit, credit, amount, reference and currency headings are mapped. Debit/credit pairs derive direction only when one side has a clear nonzero amount. PKR amounts with common grouping/decimal separators and common bank dates are normalized to exact preview values. Formula-based values in mapped transaction columns receive a clear file-level error and must be saved as values before upload; formulas in unrelated columns are ignored. Unsupported currencies, ambiguous directions, unknown amounts and malformed rows stay unresolved; values are never silently coerced to zero. The original bytes are private and content-hashed for repeat detection. The result remains `{ importId, preview, status, confirmation, duplicate }`; upload creates no cash. `GET /api/imports/{id}` returns the same stored batch without `duplicate`. Preview retains source header/row order and raw cell values, with a bounded canonical column map and editable draft fields.

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

## BA-00: document/proposal foundation, contract v0.2

Canonical exports are `documents.ts` and `proposals.ts`; existing `SupportingDocument`, `DocumentFields` and raw suggestion schemas remain compatible. Resource/request IDs are UUIDs because database IDs use UUIDs. Review versions are nonnegative Postgres integers. Never accept owner/workspace, arbitrary image URL/path, accepted model status or raw provider errors in commands. Authorization and semantic scope checks remain mandatory after shape validation.

### Public requests and results

| Endpoint | Schema / result | Behavior |
| --- | --- | --- |
| `POST /api/documents` | `documentRegistrationSchema`: `{ sourceId }`; `documentRegistrationResultSchema` | Register the caller's existing JPEG/PNG source; unique by source; returns `{ record, duplicate }`. No second upload convention or cash creation |
| `GET /api/documents/{id}` | `documentRecordSchema` | `{ document: SupportingDocument, reviewVersion, schemaVersion, extractionFailure }`; unknowns remain null |
| `POST /api/documents/{id}/extraction` | `documentExtractionRequestSchema`: `{ requestId, expectedVersion }`; `documentMutationResultSchema` | A2 loads an authorized source and calls C; browser cannot submit extracted fields. A2 durably reserves before the provider call; C1's proof does not supply production caching |
| `PATCH /api/documents/{id}` | `documentReviewSchema`; `documentMutationResultSchema` | Explicit `accept` with all fields satisfying D13, `correct` with all nullable fields, or `reject` without fields. Correction saves an unresolved review; acceptance is deliberate. Originals survive |
| `POST /api/category-proposals` | `categoryGenerationRequestSchema`: `{ requestId, transactionIds }`; `proposalBatchResultSchema` | 1–50 unique accessible IDs; server loads versions and protects accepted categories |
| `POST /api/match-proposals` | `matchGenerationRequestSchema`: `{ requestId, documentId }`; `proposalBatchResultSchema` | Server chooses scoped candidates for the reviewed document; no browser/model ownership or arbitrary candidates |
| `POST /api/reviews` | `proposalReviewSchema`; `proposalReviewResultSchema` | `{ requestId, proposalId, expectedVersion, decision }`; accept/reject, or `correct_category` plus category, or `correct_match` plus transaction ID **and transactionVersion**. BA-04/007 implements audited semantics and one-to-one allocation |

All endpoints retain the common API envelope. Collection routes use `{ items, nextCursor }`; default 20/max 50 and UUID keyset cursors under same-workspace ordering, never silently return a full financial summary from a page. Document mutations return `{ requestId, record, duplicate }`. Stored proposals use `ProposalRecord` with trusted ID/workspace, transaction snapshot version, proposal review version, validated provenance and a discriminated category/match suggestion. C output remains the existing raw suggestion shape; A2 enriches trusted snapshot versions before persistence.

Internal-only `documentExtractionSaveSchema`, `categoryPersistenceSchema` and `matchPersistenceSchema` are the A2-to-database seam, not public mutation bodies. Extraction is either complete with nullable fields and model/prompt/schema versions, or failed with one safe reason code. Failure is not a successful empty extraction. Category batches contain at most one proposal per transaction; match candidate pairs are unique. Neither can claim accepted/rejected user decisions.

### Migration 006 RPC interface (implemented/tested locally; hosted application pending)

| RPC | Parameters | Result |
| --- | --- | --- |
| `register_supporting_document` | `p_source_id uuid` | Document registration result |
| `reserve_document_extraction` | `p_document_id uuid, p_request_id uuid, p_expected_version integer, p_provenance jsonb` | `extractionReservationResultSchema`: reserved/busy with expiry, or cached with a document record |
| `save_document_extraction` | `p_document_id uuid, p_request_id uuid, p_expected_version integer, p_outcome jsonb` | Document mutation result |
| `review_supporting_document` | `p_document_id uuid, p_request_id uuid, p_expected_version integer, p_decision jsonb` | Document mutation result; decision contains action/fields only |
| `register_category_proposals` | `p_request_id uuid, p_provenance jsonb, p_proposals jsonb` | Proposal batch result |
| `register_match_proposals` | `p_request_id uuid, p_provenance jsonb, p_proposals jsonb` | Proposal batch result |

Ownership is checked before retry lookup. Same operation/request ID and identical target/version/payload returns the immutable original receipt, without reapplying or replacing subsequent reviews; changed payload returns `PT409`. Workspace locks serialize source registration/batches. Document locks serialize review/extraction; every successful mutation increments reviewVersion and preserves immutable prior/current state/actor/time. Extraction reruns cannot overwrite corrected, accepted or rejected document decisions. Stale snapshot/version or a new attempt to propose against a reviewed category/matched document conflicts. Do not use `40001` for application conflicts. Private existing sources, extracted originals and history are never removed by a failed provider call.

A2 calls `reserve_document_extraction` **before inference**. Only `reserved` starts a provider call. `busy` is a recoverable 409 with no new call; `cached` reuses the record (a saved failed operation remains a failure; explicitly retry with a fresh request ID). Reservations last 90 seconds; A2/C's complete extraction run must have a deadline of at most 60 seconds, including any bounded retries. Late writes, mismatched provenance or completions without an active reservation conflict. An expired request ID cannot restart; a new ID can reserve after expiry. The database checks the original version at completion as well, so concurrent user reviews survive. Lease expiry tests use fixture clock simulation; managed multi-client behavior remains a separate gate. This production boundary does not modify C1's standalone proof.

Migration 006 creates `supporting_documents`, `document_history`, `document_operations`, `document_extraction_jobs`, `ai_proposals` and `proposal_batches`, all owner-readable under RLS with ordinary writes revoked. Internal serializers/mutators are not executable by app roles. Only six authenticated owner-checking RPCs above can mutate the new tables. Source identity is unique and constrained to the same workspace/image type. Document operations preserve history and receipts; proposal batches are atomic and never create cash or assign accepted categories. It does **not** create accepted-match allocations or category/match review history: BA-04/migration 007 owns that behavior and must add active-match protection before enabling approvals. A2 maps selected database rows to the canonical result schemas for GET/list routes; internal serializers are deliberately private.

BA-04's review RPC will recheck proposal kind, transaction/document snapshot versions and ownership, enforce reviewed PKR/exact amount compatibility and one-to-one allocation, and preserve cash totals. An active accepted match prevents later document field edits until an explicit match-review operation handles the allocation; no silent unlink. No amount/date tolerance, FX or split payment is introduced.

### BA-04 / migration 007: explicit category and match review

`review_ai_proposal(p_proposal_id uuid, p_request_id uuid, p_expected_version integer, p_decision jsonb)` returns `{ requestId, proposal: ProposalRecord, reviewDecisionId, affectedTransactionIds, match: AcceptedMatch | null, duplicate }`. Owner checks precede immutable retry lookup. `p_decision` contains only decision-specific fields; request/proposal IDs and expectedVersion are separate arguments. Same key/identical original command reuses the saved receipt without touching later reviews; changed key payload, stale proposal version or already-final rejected state conflicts.

Accept/correct require current transaction/document input snapshots. Category accept/correction changes only the reviewed category/status and version; rejecting an accepted category clears it only while its transaction version still matches the saved review snapshot. Rejection of a pending stale proposal is allowed because it changes no cashbook fields. An unrelated manual category review is preserved. Correcting a match requires an explicit **transactionVersion** for the newly selected transaction; this adds the missing version guard to the earlier BA-00 draft.

Match approval requires a D13-accepted document and **exact** currency/amount compatibility with the imported transaction, not FX/tolerance/split allocation. A valid printed date is required; different transaction/document dates are not automatically considered equal or silently adjusted. The user explicitly reviews the proposed evidence. Partial unique indexes independently enforce one active allocation per transaction, document and proposal; same-workspace foreign keys bind the allocation to its own proposal review decision. Failed replacement leaves the old match active through atomic rollback. Explicit correction/rejection retains inactive allocation history, and every affected transaction gets a new immutable transaction review/version. Neither approval nor rejection changes original descriptions/dates/amounts/directions/sources or creates cash.

Allocated documents reject all field/status/version mutations, including no-op saves, until the owner explicitly changes/rejects the match. New AI match proposals against an already allocated record conflict; original batch retries still reuse immutable receipts. Accepted category/match values survive reruns. `cashbook_records.match_status` is now authoritative: accepted for active allocations, proposed for current unresolved match proposals against an accepted document, otherwise unmatched. The mapper supports pre-007 hosts only when the column is absent and rejects a malformed/null status. Summary/export reuse this projection without changing numerical totals. A2's current tool wrapper still rejects match filters until A2 adopts this published capability; A1 does not edit A2 modules.

`GET /api/reviews?proposalId=<uuid>&limit=20&cursor=0` supplies owner-scoped proposal history: `{ items, nextCursor }`, maximum 50, ascending proposal review versions. Items expose previous/current proposals, explicit decision, actor, timestamp and reviewVersion. Transaction-level history also includes the reviewed book/match changes. Review responses are immutable receipts; affectedTransactionIds tells B which records to reload for **current** state.

Migration 007 creates owner-readable, write-restricted `proposal_reviews`, `accepted_matches` and `proposal_review_operations`, guard triggers, the review RPC and projection. It is prepared for **manual** application after user-reported 006; no hosted application is claimed until verified. `scripts/check-proposal-reviews.sql` checks metadata/grants/indexes/projection only. True managed concurrency, live new routes and the combined C/B workflow remain separate gates.

### Assistant scope and C planning compatibility

The four existing `assistantToolSchemas` are canonical. Date filters apply to transactions by recorded cash date, inclusive, not upload time. A2's filtered summary must aggregate every scoped matching record under the bounded workspace cap. Unresolved import rows are a **whole-workspace** count because missing/invalid dates cannot reliably fall inside a selected range: return explicit `unresolvedImportRowScope: "workspace"` alongside the summary and requested range. Never describe that count as date-filtered. Whole-workspace existing `/api/summary` remains unchanged.

C's `docs/ai/contracts.md` is retained without editing C-owned files: amount representation maps to `MinorUnits`/`parseAmount`/`formatAmount`; review-readiness proposal maps to confirmed D13; raw category/match outputs map to existing suggestion schemas. Field-level raw text/issue provenance, durable operation leases, numeric fact registry and detailed assistant result schemas remain **unadopted proposals**, not implemented claims. A2/C should coordinate those seams before wiring them. Native Node/Groq proof baseline is documented in `docs/ai/FEASIBILITY.md`; C1 owns that runner.
