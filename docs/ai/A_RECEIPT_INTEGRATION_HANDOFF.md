# A handoff: finish the receipt backend for Person C steps 7–8

Prepared 10 October 2026 after integrating main revision cd092e4 with the reviewed C provider/extraction contribution. This is an integration task, not a request to rebuild completed platform work or start later AI features.

## Already present — reuse these

- Clerk/Supabase authenticated workspace, private POST /api/sources and GET /api/sources/{id}, upload/hash validation, and exact cashbook helpers.
- Canonical document schemas in src/lib/contracts/documents.ts. Confirmed D13 acceptance requires valid date, exact total and explicit PKR; merchant/reference may be null.
- Migrations 006/007: supporting documents, audited history, extraction reservations and stale/version guards. A records these as applied and behaviorally checked; do not edit/reapply 001–007.
- A2's readScopedReceiptInput in src/lib/server/documents/source.ts loads verified owner-scoped bytes, MIME and content hash with deadline/cancellation checks.
- B's live workspace has private source upload/viewing. Its field review is still a labeled example; live documents/OCR/review are awaiting APIs.
- C's server-only src/lib/ai/index.ts exports createAIProvider, extractReceipt and createExtractionCacheIdentity. Groq is default; Gemini generation remains unverified. Prompt receipt-extraction-v2; schema/normalization receipt-fields-v2. C's66 focused tests and current extraction defect fixes are present.

## 1. A1: adopt the C-to-A result and evidence mapping

Reconcile ReceiptExtraction with documentExtractionOutcomeSchema. C returns normalized documentFields, original raw field text/candidates, field uncertainty/issues, source/version and provider metadata. A's current complete outcome accepts only fields and modelVersion/promptVersion/schemaVersion. Define a validated, owner-private persistence home for the raw field observations/issues and source-field locators; do not silently discard them or send the entire C result to a strict schema that rejects it.

Map model → modelVersion; keep prompt/schema version values. A binds document/source IDs and reviewVersion from the database. C's proposed/needs_review status is not user acceptance. Apply D13 through acceptedDocumentFieldsSchema; an optional missing merchant/reference must not silently become a mandatory acceptance requirement. Unreadable/ambiguous date/total/currency cannot become reviewed without an explicit valid correction.

Map C failure reasons into extractionFailureSchema and canonical safe API errors. Cover configuration/auth/network/deadline/cancellation/budget failures explicitly; do not invent a successful empty extraction or expose raw exceptions. Document how cancellation is represented, since the current durable failure enum does not include it. No secrets, private URLs or provider continuation state in public responses.

If a shared contract/storage change is necessary, A1 owns it and allocates a new forward migration. The field evidence contract still needs B/C acknowledgement. Existing migrations remain intact.

## 2. A1 + A2: connect the durable operation interface

Use reserve_document_extraction(p_document_id,p_request_id,p_expected_version,p_provenance) once, before inference. Only reserved may invoke C; busy returns a recoverable conflict without another provider call; cached returns the validated saved result, clearly labeled cached. Database/cache errors are failures, not cache misses. A retry of a completed failed request remains failed; recovery uses a deliberate fresh request ID.

Use save_document_extraction with the same reservation/request/version and canonical outcome. Preserve the DB lease and stale-write fence. Current reservation lease is90s; complete operation deadline must be at most60s and below the actual host duration, reserving time for persistence/response. C enforces at most two provider attempts and20s per attempt; routes must not add blind retries or reset the deadline.

Reconcile createExtractionCacheIdentity with the existing per-document/provenance RPC cache. C identity includes owner/workspace/source hash/provider/model/prompt/schema/preprocessing; the current provenance schema includes only three version fields. A1 must record how provider/preprocessing are represented and compared durably, or extend the accepted schema/RPC with a forward migration. Do not pass extra fields into the existing strict provenance schema or use a process-local Map to claim cross-instance deduplication.

Corrections and accepted/rejected documents remain authoritative. Existing RPCs can reuse completed same-provenance output and reject changed-provenance reruns on completed/reviewed documents; do not bypass that guard. Document this restriction and coordinate any explicitly supported new-proposal rerun policy with C. A old-result retry receipt may describe an earlier snapshot; return/reload current document state separately so B never replaces current corrections with the old receipt.

## 3. A2: implement the document service and public routes

Own src/lib/server/documents/** and src/app/api/documents/** under BACKEND_TASKS.md BA-02. Reuse source upload and registration RPCs; do not introduce another multipart upload convention.

Deliver owner-scoped register/list/read, POST /api/documents/{id}/extraction and PATCH /api/documents/{id} correction/accept/reject. Use the canonical schemas, same-origin mutation guard, Clerk-derived ownership and request-scoped token-aware DB client. Verify every referenced document/source and ignore browser-supplied ownership.

Extraction flow: authenticate/load workspace → validate command → load current document/version → reserve → for reserved only load readScopedReceiptInput → call extractReceipt with source/version/bytes and trusted request ID/deadline/abort/budget → map/validate outcome → save atomically → return safe live/cached/failure result. C never receives a database/admin client and never inserts cash.

Reviews use review_supporting_document with explicit fields/action, expectedVersion and immutable request ID. Preserve extracted originals and corrections/history; conflicting stale edits return409 without losing the user's draft. Add document history retrieval needed by B. Keep queries bounded and owner scoped.

## 4. A1: provision the actual server runtime

Keep GROQ_API_KEY private; set verified GROQ_VISION_MODEL=qwen/qwen3.8-27b and GROQ_TEXT_MODEL=openai/gpt-oss-20b in the chosen server environment after verifying account access. Model settings are currently injected only in local proof processes. No NEXT_PUBLIC AI secrets. Groq SDK/Zod/native Node are already pinned; no tsx/new framework is required.

Supply one account request coordinator/allowance, queue small OCR requests and reserve demo/evaluation capacity. Measure the actual host-compatible deadline. Missing config/429/timeout must preserve sources, records and review history. Do not switch to Gemini or fall back between providers automatically; Gemini live capability is not established.

## Acceptance before C steps 7–8 can pass

A's public-interface/service checks must demonstrate registration retry, complete cache reuse without another OCR request, busy/outage distinction, cross-owner denial, expired/stale completion rejection, and correction/accepted-state preservation. Use real DB/RPC checks for durable guarantees; scripted providers establish failure handling only. Check malformed output, timeout/429, cancellation and safe errors.

With B, run the real signed-in flow: fresh receipt upload → live extraction with original source beside fields → explicit correction/review → reload → repeat extraction/upload/cache → retained correction/history. Test an unreadable total and provider failure recovery. Compare authoritative transaction count and exact cash totals before/after; receipt operations must not alter them. Test private sources and account switching with two users. Record candidate revision, actual checks and any unresolved gate.

B owns wiring the live document list, editable fields/history and recovery states against A's routes. That UI wiring is a remaining joint dependency, not A rebuilding B's screens. A/C2's later assistant/category/match tasks are outside this immediate receipt handoff.

Return to C: accepted export paths/result/evidence mapping, RPC/cache identity policy, measured deadline/budget interface, implemented route names and test evidence. C then adapts only its owned orchestration/tests and verifies the integrated slice. Publishing C's code does not mark steps7–8 complete.

## Publication candidate checks

Combined latest-main/C candidate: typecheck,66 AI module tests,17 offline feasibility regressions,77 backend/security tests, four frontend client API tests and production build with empty AI settings passed. Feasibility child-process tests first hit sandbox EPERM and then passed on the normal subprocess runner. No new live AI, hosted writes, browser journey or deployment was performed. Secret scan found no configured private values in259 tracked candidate files; ignored local env and frontend archive/reference contents were preserved.

## Update after team main c2ffec2

A2 document registration/list/detail/review service routes are now integrated and compile in the combined production build. Reuse these implementations rather than rebuilding them. Section3's remaining route work is extraction and document history, plus completion of the evidence/cache adapter in sections1–2 and joint verification. Existing route presence is not signed-in receipt-flow acceptance. Category generation/listing and B's live OCR/category proposal controls remain pending.
