# Track B frontend handoff

Design: [DESIGN.md](../../DESIGN.md). Branch `codex/raqam-frontend`, base `796ce4f`. The user switched this chat to B; another person now continues A. The root landing entry is the only changed A-owned application file: it imports B's `Landing` component. The Clerk root layout, sign-in, middleware, dependencies, schemas, APIs and migrations were preserved. B's CSS module includes a body-margin reset conditional on its own root surface; no root global stylesheet was edited.

Published to `origin/codex/raqam-frontend`; implementation commit `b71c78c`. Synced main's `f95ddfc` C-planning documents through merge `e801866`, verified on the remote. A's executable contract remains canonical; C's detailed proposals still need A/B agreement before live wiring. No main merge/push or deployment by B.

## Run and inspect

`npm run dev` or `npm run build` followed by `npm run start`.

- `/`: neutral black/white landing with an original code-rendered cashbook/source preview.
- `/demo`: synthetic development workspace. Import preview, corrections, category/match review, grounded-answer examples, evidence dialogs, review trail, CSV download and reset work in component memory. Reload resets the example. No Groq calls, private records or persisted decisions.
- `/workspace`: real Clerk gate; load/create workspace, paginated transaction reads, source upload and signed source viewing. No demo data fills gaps in real account responses.

## Integration map for A/C

| Boundary | Current frontend behavior | Required next slice |
| --- | --- | --- |
| Workspace GET/POST | Runtime-validated `{data,error}`; creates with `businessName` only | Validate real Clerk/Supabase setup/two-user access |
| Transactions GET | 50-record pages, original/source fields, search/date/direction filters | Actual persisted records; summary API with full scope and unresolved counts |
| Source POST / signed GET | One <=2 MiB JPEG/PNG; duplicate response honored; session source list; expiring viewer | Persistent source/document listing and OCR integration |
| Imports | Download real template; live confirmation unavailable; labeled demo preserves invalid originals | Agree request/response types, wire preview + atomic confirmation endpoints |
| Transaction correction | Labeled demo description/category edits preserve originals/history | Audited PATCH command and validated result |
| Document extraction/review | Source/proposed/corrected fields separated in example; unknown required fields block review | Document list, extraction and correction endpoints from A/C |
| Category/match review | Example explicit accept/change/reject; one-to-one guard; changed document releases its example match | Persisted proposals/review commands; atomic uniqueness and accepted-decision preservation on reruns |
| Assistant | Three exact example questions use deterministic visible records; simulated action trail and evidence | Agree grounded response/action/reference schema and scoped assistant API |
| Export | Safely encoded example CSV; real export remains unavailable | Scoped backend export covering full workspace/filter set, unresolved statuses and review trail |

`src/lib/client/api.ts` calls only implemented APIs and validates their responses. UI-only development fixtures consume A's shared types. Pure existing money/summary/export helpers are reused in the browser; no provider/server configuration is imported. Live totals are explicitly totals for filtered, loaded records; do not describe these as a full-workspace summary until that endpoint is connected. The demo import is a prepared scenario, not a browser copy of A's CSV parser.

Private data is held in component memory. Clerk account changes key/unmount the owned workspace; outstanding requests are aborted and source links expire. Real account-switch/storage behavior still needs live verification. Signed links and credentials are never put in localStorage or logs.

## Validation and limits

See [frontend browser checks](../../tests/e2e/FRONTEND_CHECKS.md) for observed interactions and viewport checks. Run `node tests/e2e/frontend-smoke.mjs` against the running production app for read-only route/authorization checks. Existing `npm test` covers A's numerical, CSV, contract, upload and simulated database security invariants. There is no configured lint command.

The prior `smoke:platform` root-page copy assertion must be updated by A during integration; the setup gate now lives at `/workspace`. Local preview uses the existing working `npm run start -- --port 3000` binding. Explicit IPv4-only binding caused the current middleware's localhost proxy to fail; no platform changes were made to work around it.

Full live CSV → OCR → review → assistant → export, real two-account isolation, provider failures, production deployment and release acceptance remain pending A/C integration. Screens and synthetic browser results do not close those gates. A reviews/integrates this branch sequentially; B does not merge directly into main.
