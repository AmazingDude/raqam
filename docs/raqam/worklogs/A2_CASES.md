# A2 synthetic contract cases

**Purpose:** Development fixtures for A2 service/adapter work, reconciled to `docs/raqam/CONTRACTS.md` at main `3f4fa8f`. These are not the reserved evaluation set and contain no customer records or expected-answer labels. Any IDs below are illustrative only; tests generate isolated synthetic UUIDs.

## Contract and test-seam inventory

| Seam | Inputs/outputs adopted today | Test use and limit |
| --- | --- | --- |
| `createCashbookTools` | Request workspace, injected `readSnapshot`, deadline and optional signal; exposes read-only transaction/summary tools | Synthetic snapshots test scoping, arithmetic, filtering, paging and cancellation; no hosted auth/RLS claim |
| `createAssistantTools` | Workspace, deadline/signal and injected cashbook/document/history readers; returns validated tool observations | Tests tool facts, queue/evidence scope, partial pages and failure; no provider or browser claim |
| `createDocumentService` | Workspace plus injected persistence adapter; register/detail/list/review | Adapter tests cover canonical validation and errors; A1 owns the authenticated route and database implementation |
| `extractDocument` | Authenticated session/workspace, document ID, request/body, bounded operation and injected environment/fetch | Scripted provider/storage/database tests cover the service path; migration 008 must be hosted before live route acceptance |
| `validateCategorySuggestions` | Raw suggestions, authoritative transaction records, workspace ID | Pure guard only; it permits partial sets and is not a generation or persistence seam |
| C match engine | No exported production function/result yet | A2 must wait for C2 to publish it; do not add a local matcher/mock fallback to production |

## Synthetic cases

The cases below reuse these fictional, non-production seeds. Test code should generate fresh UUIDs while preserving the values and relationships. `owner-a` and `owner-b` are fixture labels, not Clerk identities.

```json
{
  "workspaceA": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "workspaceB": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "transactionImportSourceA": "11111111-1111-4111-8111-111111111111",
  "receiptSourceA": "33333333-3333-4333-8333-333333333333",
  "documentA": "22222222-2222-4222-8222-222222222222",
  "transactionA": {
    "id": "55555555-5555-4555-8555-555555555555",
    "workspaceId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "source": {"sourceId":"11111111-1111-4111-8111-111111111111","rowNumber":2},
    "date":"2026-10-02",
    "originalDescription":"ACME DESIGN STUDIO INV SYN-0042",
    "description":"Acme Design Studio invoice SYN-0042",
    "direction":"out",
    "amountMinor":"125000",
    "currency":"PKR",
    "reference":"SYN-0042",
    "category":null,
    "categoryStatus":"needs_review",
    "matchStatus":"unmatched"
  },
  "cleanReceiptFields": {
    "counterparty":"Acme Design Studio",
    "date":"2026-10-01",
    "totalMinor":"125000",
    "currency":"PKR",
    "reference":"SYN-0042"
  },
  "unknownReceiptFields": {
    "counterparty":"Acme Design Studio",
    "date":null,
    "totalMinor":null,
    "currency":null,
    "reference":"SYN-0042"
  }
}
```

In the JSON fixture, `transactionImportSourceA` is the transaction CSV source and `receiptSourceA` is the receipt image source. They must remain distinct because the database constrains each source to one source type. The document registration request below uses `receiptSourceA`; `transactionA.source.sourceId` uses `transactionImportSourceA`.

For `MATCH-01`, clone `transactionA` with IDs `66666666-6666-4666-8666-666666666666` and `77777777-7777-4777-8777-777777777777`. Change their source row numbers to `3` and `4` respectively (the original stays at row `2`); retain the transaction import source ID, direction `out`, amount `125000`, currency `PKR`, and date `2026-10-02`. Change descriptions to `ACME DESIGN INV 42` and `ACME STUDIO PAYMENT 42`. Both remain plausible candidates; equal amount/reference similarity alone is not an accepted allocation. Distinct source rows satisfy the adopted per-source row uniqueness constraint.

`AST-02` uses an isolated two-record snapshot made by cloning `transactionA` and changing only the listed fields:

```json
[
  {"id":"66666666-6666-4666-8666-666666666666","workspaceId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","source":{"sourceId":"11111111-1111-4111-8111-111111111111","rowNumber":5},"date":"2026-10-02","originalDescription":"Synthetic exact-value fixture one","description":"Synthetic exact-value fixture one","direction":"out","amountMinor":"9007199254740993","currency":"PKR","reference":null,"category":null,"categoryStatus":"needs_review","matchStatus":"unmatched"},
  {"id":"77777777-7777-4777-8777-777777777777","workspaceId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","source":{"sourceId":"11111111-1111-4111-8111-111111111111","rowNumber":6},"date":"2026-10-02","originalDescription":"Synthetic exact-value fixture two","description":"Synthetic exact-value fixture two","direction":"out","amountMinor":"2","currency":"PKR","reference":null,"category":null,"categoryStatus":"needs_review","matchStatus":"unmatched"}
]
```

Call `list_transactions` first with `{"dateFrom":"2026-10-02","dateTo":"2026-10-02","limit":1}`. It must return the first ID, exact amount string `9007199254740993`, and that ID as `nextCursor`. Call again with the same date filters, `limit:1`, and `cursor:"66666666-6666-4666-8666-666666666666"`; it must return the second ID and `nextCursor:null`. A whole-snapshot summary must report exact `outflowMinor:"9007199254740995"`; neither page alone may be described as the complete filtered total.

`FAIL-01` uses these literal injected provider behaviors. Each run begins with a fresh pending document and keeps the same source, prior evidence, corrections, review state and cash snapshot:

| Scripted input at the provider seam | Expected observable result |
| --- | --- |
| Fetch rejects once with `new Error("synthetic network failure")`, then returns a valid extraction response | At most one bounded recovery attempt; success only after validating the second response; provider retries remain disabled underneath the service retry policy. |
| Response is HTTP `429` with header `retry-after: 120` and body `{"error":{"message":"Synthetic rate limit"}}` | No blind immediate retry; persist/return a safe `provider_rate_limited` failure within the two-attempt maximum. |
| Response is HTTP `200` with assistant content `{"unexpected":"Synthetic malformed output"}` | Return/persist `invalid_model_output`; do not create normalized fields from it. |
| Fetch remains pending until its request signal aborts with `new DOMException("Scripted cancellation","AbortError")` | Return/persist `cancelled`; no late result may overwrite the current record. |
| Provider does not settle before the injected operation deadline | Return/persist the adopted timeout failure; do not retry beyond the original deadline. |

The receipt-service cases align with `tests/backend/receipt-extraction-service.test.ts`; provider network/timeout cases align with `tests/ai/provider.test.ts`. These definitions do not claim every row above is already covered by one integrated test.

| ID | Fixture | Expected result and invariant | Current status/dependency |
| --- | --- | --- | --- |
| DOC-01 | Complete, owner-scoped JPEG receipt; readable counterparty, valid date, PKR total and reference | Extraction proposal keeps original observations and normalized values; document remains unaccepted; cashbook row count and exact totals do not change | Scripted C/A evidence exists; live hosted route still awaits migration 008 and configured model |
| DOC-02 | Complete receipt image with unreadable total, ambiguous date, or unknown currency | Unknown/ambiguous fields remain `null` with explicit issue/state; D13 acceptance fails until valid date, total and explicit PKR are supplied | Canonical schemas and local tests exist |
| DOC-03 | Source is foreign, incomplete, missing, or a transaction CSV rather than a receipt image | Deny before private bytes/provider use; foreign/missing identity is not disclosed; no document or cash is created | A1 route/service tests exist; hosted isolation still pending |
| DOC-04 | Repeat registration of the same owner/source, including concurrent retry | Return the same document with duplicate/retry semantics; do not create a second document or cash row | Contract/schema and local DB tests exist; migration 008 host verification pending |
| DOC-05 | Extraction at version `v` completes after a user correction/acceptance advances the document version | Stale result conflicts or is non-actionable under A1's operation; original evidence/history and current correction remain intact | Local migration/service tests exist; hosted 008 and signed-in route check pending |
| DOC-06 | Cached extraction identity repeats for the same authorized owner, workspace, source hash and processing versions | Return the durable completion or saved failure without reading source bytes or calling provider; a changed source/model/prompt/schema/preprocessing identity cannot hit the old entry. Owner scope is checked before cache access, so another owner never learns whether an entry exists. | Local 008/cache tests exist; hosted cache verification pending |
| CAT-01 | Eligible transaction set plus one already accepted category | Accepted record is excluded from C inference/persistence; rerun preserves accepted category and exact cash totals | C module tests and A1 review tests exist; category route awaits C step 9 guide/version adoption |
| MATCH-01 | One reviewed PKR receipt and two scoped outflow transactions with identical exact amount/currency and plausible descriptions | Preserve both plausible candidates or abstain for review; amount equality alone never creates an accepted match | C2 engine and A2 route are absent; case is prepared, not executable end-to-end |
| MATCH-02 | Candidate has wrong direction, non-PKR currency, unequal amount, unreviewed/missing required document fields, or stale document/transaction version | Do not propose an actionable incompatible pair; preserve unknowns; stale snapshots conflict; cash and active allocations remain unchanged | A1 review/schema rules exist; generation behavior awaits C2 result contract and A2 service |
| MATCH-03 | C output contains duplicate/foreign transaction or document IDs, omitted candidate coverage, malformed fields, or claims accepted state | Reject the batch safely; IDs/versions are rebound or checked against the trusted snapshot; never persist model ownership/acceptance | A1 schemas constrain persistence, but C2 output/coverage schema is pending |
| MATCH-04 | Candidate snapshot cannot prove it contains the complete bounded pool or current active allocations | Do not return a successful proposal batch or treat absence from a partial page as “no match”; surface only an error/review state after A1/C2 adopts the exact result mapping | A1/C2 snapshot seam pending |
| AST-01 | Assistant receives a request with forged workspace/owner/tool arguments or foreign evidence IDs | Reject before any database read or return the same non-disclosing not-found policy adopted for evidence; trail contains only tools actually run | Current A2 tool/route tests cover synthetic path; live two-account/browser check remains |
| AST-02 | Exact paisa values include `9007199254740993` and another record worth `2`; the literal filtered request crosses a one-record page boundary | Code arithmetic preserves exact total `9007199254740995`; the two cursor calls above return distinct complete pages; no model arithmetic or partial-page total | Existing synthetic cashbook/assistant tests cover exact arithmetic and pagination; concrete fixture now recorded above |
| FAIL-01 | Provider receives the five literal injected behaviors above: one recoverable network error, 429 with `Retry-After: 120`, malformed successful response, caller cancellation and deadline expiry | Bounded safe failure/recovery; preserve source, prior evidence, corrections, cash totals and accepted review; retry only at the owner assigned by contract | Receipt service and provider tests cover overlapping cases; the table is the acceptance matrix, not a claim of one integrated test. Hosted behavior and C2 match failures remain pending |
| INJECT-01 | Receipt/transaction source text contains “ignore prior instructions,” fake tool names, URLs or SQL | Treat text as untrusted evidence; it cannot alter system instructions, scope, tool allowlist or review state | Assistant prompt/tool tests cover synthetic injection; no live semantic guarantee |

## Public endpoint examples already adopted

Examples use synthetic UUIDs and do not authorize a hosted write.

```http
POST /api/documents
Content-Type: application/json

{"sourceId":"33333333-3333-4333-8333-333333333333"}
```

```http
POST /api/documents/22222222-2222-4222-8222-222222222222/extraction
Content-Type: application/json

{"requestId":"44444444-4444-4444-8444-444444444444","expectedVersion":0}
```

```http
POST /api/match-proposals
Content-Type: application/json

{"requestId":"55555555-5555-4555-8555-555555555555","documentId":"22222222-2222-4222-8222-222222222222"}
```

The document examples correspond to implemented A1 routes. The match route is specified by the shared contract but is **not implemented**; it must not be presented as a working endpoint until C2's matching interface and A2's route/service exist.

## Contract decisions deliberately left pending

- C2 matching adapter function, typed result states, evidence/rationale bounds, candidate coverage/completeness proof, retry ownership and abstention conditions.
- A1's hosted migration 008 application and signed-in cache/extraction verification.
- Category generation route adoption of C step 9's semantic guide version and persistence mapping.
- B's actual match-proposal queue/review screen and signed-in reload/rerun journey.

No A2 implementation should invent these decisions. A2's match route should use the existing `matchGenerationRequestSchema`, `matchPersistenceSchema` and `proposalBatchResultSchema` once C2 publishes a compatible adapter and A1 confirms the exact transaction/document/allocation snapshot seam.
