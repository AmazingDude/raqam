# A2 foundation: BA-00/01

A1's document/proposal foundation is ready for service integration. Pull the published backend/main foundation and run `npm ci`; retain your separate `codex/raqam-backend-services` checkout. Current canonical boundaries are in [CONTRACTS.md](CONTRACTS.md), `src/lib/contracts/documents.ts` and `proposals.ts`. Existing raw C suggestion schemas/types remain compatible; detailed C planning shapes are not wholesale adopted.

## Manual migration

The user runs **only** `supabase/migrations/202610100006_documents_proposals.sql` next in the Supabase project's SQL editor, after existing 001–005. Paste the complete file, including BEGIN/COMMIT, and execute it once. Do not rerun earlier files or use an unverified CLI push. The new migration is tested locally but is not yet applied to the hosted project.

Then run `scripts/check-document-proposals.sql` in the SQL editor to check the new tables/functions and ordinary-write restrictions. No private record values are selected. The migration does not affect cashbook totals or existing accepted categories; new routes remain A2's work.

## Service sequence

1. Register only an accessible existing private image `sourceId`; `register_supporting_document` returns the canonical `{ record, duplicate }`. No new multipart convention, image URL or cash creation.
2. GET/list documents through owner-scoped tables; map snake_case rows to `documentRecordSchema`. Source locators use null row number. Preserve nullable extracted fields, explicit corrected fields and versions.
3. For extraction, validate `{ requestId, expectedVersion }`, load the scoped source, obtain C's model/prompt/schema versions and reserve via `reserve_document_extraction`. Only `reserved` may invoke C. Busy/cached states suppress duplicate calls; fresh IDs retry failed/expired attempts deliberately. Bound the full run to at most 60 seconds, honor cancellation and sanitize all provider errors. A2 passes the validated result to `save_document_extraction` before the 90-second lease expires. Model output/provenance cannot assign accepted status. C1's feasibility runner is not a production adapter.
4. Field review uses `review_supporting_document`: pass `p_decision` with action/fields only, and request ID/version as separate parameters. Acceptance requires explicit valid date, exact total and PKR; merchant/reference may be null. Correct saves needs_review; reject preserves fields. Retry receipts are immutable and can describe an older version; fetch current state after other reviews.
5. Load scoped transaction/document snapshots before C generation. Add trusted versions and validate `categoryPersistenceSchema`/`matchPersistenceSchema`, then call the corresponding proposal registration RPC. Browser bodies use generation-request schemas, not persistence schemas. Match candidates require a reviewed document. Foreign IDs, duplicates, accepted category reruns, stale versions and changed request payloads fail atomically. Generation reservation/cache beyond extraction remains a follow-up seam; do not claim those guarantees from document leases.
6. Stored proposals do not change books or allocate documents. BA-04/migration 007 implements category/match decisions and one-to-one allocation; do not emulate acceptance with direct writes. Match amount/currency differences may stay explicit needs-review candidates; only validated compatible allocations can later be approved.

## Verification boundaries

A1 tested the real embedded PostgreSQL migrations with simulated Supabase roles/JWT claims: document defaults/unknowns, acceptance policy, exact large amounts, originals/history, registration/retry receipts, conflict codes, foreign source/document/transaction denial, direct-write/private-helper/anonymous denial, batch rollback, reviewed-category preservation, lease expiry and late-output fencing. Lease expiry is simulated; no live OCR, hosted migration, managed concurrency or new endpoint checks are claimed.

A2 adds its owned service tests/live checks and records evidence in `docs/raqam/worklogs/A2.md`. All four assistant tool arguments remain canonical; filtered cash summaries must cover all matching records and explicitly label unresolved import counts as whole-workspace. No model-supplied ownership, mutable tools, service-role access or totals computed from a page.
