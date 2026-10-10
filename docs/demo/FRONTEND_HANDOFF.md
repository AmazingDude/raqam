# Track B frontend handoff

## Landing-page review requirement

Before editing `src/components/marketing/**`, read [the landing-page review](FRONTEND_REVIEW.md) for the findings against Alisha's commit `9644cdc`. The marketing component's `AGENTS.md` points to the same review.

Design: [DESIGN.md](../../DESIGN.md). Branch `codex/raqam-frontend`, base `796ce4f`. The user switched this chat to B; another person now continues A. The root landing entry is the only changed A-owned application file: it imports B's `Landing` component. The Clerk root layout, sign-in, middleware, dependencies, schemas, APIs and migrations were preserved. B's CSS module includes a body-margin reset conditional on its own root surface; no root global stylesheet was edited.

Original UI published at `123c642` (implementation `b71c78c`, main sync `e801866`). On 10 October, resumed B in an isolated managed checkout because the original checkout contains uncommitted AI work. Pulled the frontend branch (already current) and synchronized published backend `87aeb1a`; both handoff histories are preserved. B-API-01 connects the existing bookkeeping APIs. A's executable contract remains canonical; C's detailed proposals still need A/B agreement before live wiring. No main merge/push or deployment by B.

## Run and inspect

`npm run dev` or `npm run build` followed by `npm run start`.

- `/`: neutral black/white landing with an original code-rendered cashbook/source preview.
- `/demo`: synthetic development workspace. Import preview, corrections, category/match review, grounded-answer examples, evidence dialogs, review trail, CSV download and reset work in component memory. Reload resets the example. No Groq calls, private records or persisted decisions.
- `/workspace`: real Clerk gate; load/create workspace, transactions, stored CSV preview/decisions, audited description/category edits/history, whole-workspace totals, scoped export, source upload and signed viewing. No demo data fills gaps in real account responses.

## Integration map for A/C

| Boundary | Current frontend behavior | Required next slice |
| --- | --- | --- |
| Workspace GET/POST | Runtime-validated `{data,error}`; creates with `businessName` only | Validate real Clerk/Supabase setup/two-user access |
| Transactions GET / summary | 50-record pages and table filters; server full-workspace cash/category totals and excluded-row count; unknown totals on failure | Verify the signed-in combined browser journey |
| Source POST / signed GET | One <=2 MiB JPEG/PNG; duplicate response honored; session source list; expiring viewer | Persistent source/document listing and OCR integration |
| Imports | Real template/upload/stored preview, full corrections/rejections, explicit confirmation, current outcomes and subsequent unresolved-row decisions | Signed-in journey; reopen a prior batch by re-uploading the same CSV until A adds a listing endpoint |
| Transaction correction | Audited versioned PATCH, original values, saved paginated history; conflicts preserve drafts and require reload/comparison | Signed-in concurrent-browser and persistence checks |
| Document extraction/review | Source/proposed/corrected fields separated in example; unknown required fields block review | Document list, extraction and correction endpoints from A/C |
| Category/match review | Example explicit accept/change/reject; one-to-one guard; changed document releases its example match | Persisted proposals/review commands; atomic uniqueness and accepted-decision preservation on reruns |
| Assistant | Three exact example questions use deterministic visible records; simulated action trail and evidence | Agree grounded response/action/reference schema and scoped assistant API |
| Export | Real whole-workspace CSV download, verified response type/excluded-row count, recoverable auth/server errors; example export stays separate | Signed-in UI/export parity; filters are explicitly table-only |

`src/lib/client/api.ts` calls only implemented APIs and validates their responses. Requests use shared import/review schemas; response adapters stay B-owned. Live summaries validate exact money and category/remainder reconciliation, then show the full workspace independently of table filters. Failed refreshes clear old totals. Pure money/summary/export helpers support the labeled demo; no provider/server configuration is imported. Confirmation retries preserve sent choices; unresolved-resolution retries preserve both choices and the UUID. Current outcomes are reloaded after a receipt because retry receipts may be older than later decisions. New decisions require an explicit status refresh after an uncertain request. Originals remain visible.

Private data is held in component memory. Clerk account changes key/unmount the owned workspace; outstanding requests are aborted and source links expire. Real account-switch/storage behavior still needs live verification. Signed links and credentials are never put in localStorage or logs.

## Validation and limits

See [frontend browser checks](../../tests/e2e/FRONTEND_CHECKS.md) for observed interactions and viewport checks. Run `node tests/e2e/frontend-smoke.mjs` against the running production app for read-only route/authorization checks. Existing `npm test` covers A's numerical, CSV, contract, upload and simulated database security invariants. There is no configured lint command.

The prior `smoke:platform` root-page copy assertion must be updated by A during integration; the setup gate lives at `/workspace`. The isolated B checkout uses port 3001 and no copied credentials. Set ignored private configuration and the matching APP_URL deliberately for real browser testing. No platform changes were made to work around auth configuration.

For synthetic browser failure checks, run `node tests/e2e/prepare-browser-harness.mjs`, then `npm run dev -- --port 3001` and open `/b-checks`. Its visible test banner and intercepted API responses never contact Supabase. Remove the temporary route with `node tests/e2e/prepare-browser-harness.mjs --remove` before the final build/commit; the helper refuses to overwrite or delete a changed route. The harness is a UI test fixture, not live backend evidence. Run `node --test tests/e2e/client-api.test.ts` for client contract/error checks.

Full live CSV → OCR → review → assistant → export, real two-account isolation, provider failures, production deployment and release acceptance remain pending A/C integration. Screens and synthetic browser results do not close those gates. A reviews/integrates this branch sequentially; B does not merge directly into main.
