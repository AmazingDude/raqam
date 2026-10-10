# Receipt extraction and integration evidence

Date: 10 October 2026. C1 scope: Person C steps 6–8 and C-owned Gemini review fixes. Working tree on codex/ai-two-person; the pending A baseline merge and unrelated changes remain uncommitted. This record separates C module behavior from A/B application acceptance.

## Step 6 — extraction module

**State: in_review.** Added src/lib/ai/extraction.ts and the versioned src/lib/ai/prompts/extraction.ts over A's DocumentFields, source reference, documentFieldsSchema, exact parseAmount, image signature guard and provider public operation. The result is a proposal; it cannot accept a document, write a transaction, or mutate corrections or cash totals.

The prompt directs the model to read visible print only, ignore instructions inside the document, distinguish subtotal from final total, return a fixed field envelope, preserve original strings and report multiple plausible payable totals. Unknown values remain null. Code normalizes safe strings, exact PKR amounts and explicit calendar dates (ISO or unambiguous English month names with a year). Ambiguous slash dates, missing year, unknown/foreign currency, unreadable values and multiple totals produce review issues. It never defaults currency from workspace settings or fills a missing year from upload time. Source identity is bound from trusted input; model output cannot assign it.

**Live synthetic evidence:** An initial live output exposed aliases outside the strict schema. Prompt receipt-extraction-v2 then named the exact allowed keys and prohibited aliases. One fresh receipt-clean.png request through the real Groq provider and extraction module succeeded in one attempt, 907ms, on qwen/qwen3.8-27b: Northstar Workspace; 2026-10-09; 450000 minor units; PKR; NS-104; status proposed, no unresolved fields. The result matched the independently known synthetic receipt. A previous v1 attempt failed validation after two bounded requests; a schema-free diagnostic showed the aliases and led to v2. This is one controlled clean synthetic sample, not OCR accuracy or quality evaluation. No personal financial data was used.

Scripted coverage includes clean normalization and raw text preservation; missing/unreadable total and currency; ambiguous date; multiple totals; unsupported USD without PKR normalization; malformed/foreign source-shaped output; injected instruction content; invalid image rejection; deterministic cache identity changes across owner, source bytes and processing versions. C proposals contain no correction field or accepted state.

## Step 7 — identity and durable rerun

**State: blocked after independent identity work.** createExtractionCacheIdentity uses an ordered JSON tuple hashed with SHA-256 over owner, workspace, source content hash, provider/model, prompt/schema and preprocessing versions. Scripted checks establish stable same-input identity and separation across owners, source content and versions.

The accepted A operation/reservation/cache/snapshot interface remains pending in docs/ai/contracts.md. No database cache lookup, durable reservation, in-progress status, cache hit, cache-outage distinction, stale-publication check or correction merge was implemented. This is an A-owned integration dependency; adding a local Map or invented C protocol would misrepresent durable or agreed behavior. Cache-hit, stale-result and correction-preservation-through-A-interface tests therefore remain pending. C extraction output contains a new proposal only and no correctedFields or accepted state.

## Step 8 — app integration

**State: blocked; no end-to-end acceptance.** A's authenticated private source upload exists at POST /api/sources, with retrieval under /api/sources/[id]. This checkout has no receipt extraction/document-review route, persisted extraction/review-history schema or correction endpoint, and no B receipt upload/review screen. The home page remains a setup/sign-in shell. There is no real application path to test correction persistence/reload, duplicate retry, stale-result rejection, unknown-field completion or before/after cash totals. No route or UI was fabricated and no A/B files were edited. Playwright/browser integration was not run because the required receipt page/routes are absent.

Required next collaboration: A adopts/implements the durable operation and stale-snapshot wrapper plus extraction persistence; B implements upload/source/extracted-field/correction/review states against the accepted outcome; C then wires only its module and jointly runs signed-in upload → review → correction → reload → same-source retry, unreadable-total and timeout/429 recovery, and before/after exact cash-summary comparison. A configured test environment and B browser path are also needed for authenticated acceptance.

## Gemini adapter fixes

Fixed four C-owned defects recorded in PROVIDER_LIVE_REVIEW.md: printable header-safe API-key validation accepts punctuation and rejects whitespace/control characters; image/text schemas use Google's responseJsonSchema and tool declarations use parametersJsonSchema; tool request envelopes and aggregate text are validated before requests; returned tool behavior must respect required/none choice. Added public-interface regression tests. Gemini model-list authentication returned HTTP200; generation on an older listed candidate returned404 and two current-model attempts returned503. Successful Gemini generation/schema/OCR/tool capability remains unverified; Groq remains the step6 live path.

## Checks and limits

- Focused AI tests: node --conditions=react-server --test --test-isolation=none tests/ai/extraction.test.ts tests/ai/gemini.test.ts tests/ai/provider.test.ts — 66/66 passed after the five extraction review fixes and extraction-level failure regressions.
- npm run typecheck — passed after C code additions.
- Live Groq extraction — one successful synthetic v2 run above; earlier v1 failure and bounded diagnostic are recorded honestly.
- npm test: 38/38 backend/security tests passed. npm run build: production build passed through the normal subprocess runner after the sandboxed TypeScript --showConfig invocation failed. npm run typecheck passed. No lint script exists. Playwright is available (npx present), but the receipt UI is not.
- No cache/storage/auth route, B UI, shared schema, package/lock/config, migration or frontend archive file was changed. No commit, push or deployment.

## Step 6 review fixes and retest

10 October2026: fixed all five reproduced defects. Explicit unreadability now forces null/unreadable even when plausible text is present. Primary and singleton candidate totals are compared through the exact financial parser; contradictory values remain null and both observations are retained, while equivalent formatting stays usable. Dates accept complete supported English month names/abbreviations only and every unresolved path preserves the exact raw text. Currency fallback recognizes only an explicit PKR amount prefix; ordinary words NET/DUE/TAX remain unknown. Explicit currency fields are checked against the Node runtime ISO currency list.

Seven new public-interface tests cover the five fixes plus structured provider failure propagation and safe handling of unexpected provider rejection. Each reproduced semantic bug was observed failing before its correction;15 extraction tests and66 combined AI tests now pass. All38 backend/security tests, strict typecheck and production build with empty AI settings pass. No lint command is configured. The build used the previously approved normal subprocess runner because sandboxed builds had failed at TypeScript --showConfig.

Current prompt version remains receipt-extraction-v2; schema/normalization version is receipt-fields-v2, so the versioned cache identity changes with this semantic policy. Prior907ms live clean OCR evidence used receipt-fields-v1; no new live/provider/browser calls were run in this fix task. Step6 remains in_review for A/B outcome/evidence policy adoption. The operation/cache/snapshot interface and receipt review routes/UI are still absent in this checkout, so step7/8 acceptance remains blocked. No A/B code/configuration/dependencies, frontend references or later steps were changed. No commit/push/deploy.
