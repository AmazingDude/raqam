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
  "sourceA": "11111111-1111-4111-8111-111111111111",
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

For `MATCH-01`, clone `transactionA` with IDs `66666666-6666-4666-8666-666666666666` and `77777777-7777-4777-8777-777777777777`; retain direction `out`, amount `125000`, currency `PKR`, and date `2026-10-02`. Change descriptions to `ACME DESIGN INV 42` and `ACME STUDIO PAYMENT 42`. Both remain plausible candidates; equal amount/reference similarity alone is not an accepted allocation.

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
| AST-02 | Exact paisa values include `9007199254740993` and another record worth `2`; a filtered request crosses a page boundary | Code arithmetic preserves exact total `9007199254740995`; page completeness/cursor is explicit; no model arithmetic or partial-page total | Existing synthetic cashbook/assistant tests cover exact arithmetic and pagination |
| FAIL-01 | Provider returns timeout, 429, network failure, malformed JSON, partial output or cancellation | Bounded safe failure; preserve source, prior evidence, corrections, cash totals and accepted review; retries occur only at the owner already assigned by contract | C provider and A1 service tests exist; hosted behavior and C2 match failures pending |
| INJECT-01 | Receipt/transaction source text contains “ignore prior instructions,” fake tool names, URLs or SQL | Treat text as untrusted evidence; it cannot alter system instructions, scope, tool allowlist or review state | Assistant prompt/tool tests cover synthetic injection; no live semantic guarantee |

## Public endpoint examples already adopted

Examples use synthetic UUIDs and do not authorize a hosted write.

```http
POST /api/documents
Content-Type: application/json

{"sourceId":"11111111-1111-4111-8111-111111111111"}
```

```http
POST /api/documents/22222222-2222-4222-8222-222222222222/extraction
Content-Type: application/json

{"requestId":"33333333-3333-4333-8333-333333333333","expectedVersion":0}
```

```http
POST /api/match-proposals
Content-Type: application/json

{"requestId":"44444444-4444-4444-8444-444444444444","documentId":"22222222-2222-4222-8222-222222222222"}
```

The document examples correspond to implemented A1 routes. The match route is specified by the shared contract but is **not implemented**; it must not be presented as a working endpoint until C2's matching interface and A2's route/service exist.

## Contract decisions deliberately left pending

- C2 matching adapter function, typed result states, evidence/rationale bounds, candidate coverage/completeness proof, retry ownership and abstention conditions.
- A1's hosted migration 008 application and signed-in cache/extraction verification.
- Category generation route adoption of C step 9's semantic guide version and persistence mapping.
- B's actual match-proposal queue/review screen and signed-in reload/rerun journey.

No A2 implementation should invent these decisions. A2's match route should use the existing `matchGenerationRequestSchema`, `matchPersistenceSchema` and `proposalBatchResultSchema` once C2 publishes a compatible adapter and A1 confirms the exact transaction/document/allocation snapshot seam.
