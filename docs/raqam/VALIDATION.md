# Role A local validation, 10 October 2026 (PKT)

The working branch was subsequently renamed to `codex/raqam-backend`, preserving the validated commits. The original validation record below retains its historical branch name. Branch/documentation changes do not alter the tested application code.

Checker: Codex, working for user/A on `codex/platform`. Revision: the platform-foundation commit carrying this record. Model/prompt version: none; no runtime AI was invoked. Inputs are synthetic test literals and a local embedded PostgreSQL fixture, not reserved live evaluation packets or customer data.

## Completed local slice

Shared types/runtime schemas; exact PKR parsing; CSV preview with original fields/errors; deterministic cash/category summaries; safe CSV export; Next.js/Clerk/Supabase platform shell; owner-derived workspace creation/read; paginated cashbook read; private source upload/retrieval; schema/RLS migration and bigint-text invoker view. Source upload does not create document extraction or cash movement. Product workspace UI and AI modules remain B/C work.

| Check | Procedure | Result | What it establishes / limit |
| --- | --- | --- | --- |
| Automated financial/security tests | `npm test` | **22/22 passed** | Exact amounts/totals, malformed/ambiguous inputs, repeated source identity, CSV formula protection, strict model/owner arguments, body/origin/upload guards; includes one embedded Postgres scenario |
| Type checking | `npm run typecheck` | Passed | Next route generation and strict TypeScript compilation; does not establish runtime vendor behavior |
| Production build | `npm run build` | Passed | Next.js 16.4.0 and installed SDKs compile into the platform routes and proxy |
| Real local HTTP smoke | Start `npm run start -- --hostname 127.0.0.1 --port 3187`; then `npm run smoke:platform` | Passed | Setup page 200, sign-in redirects to setup, health reports setup_required, security headers; all **5/5 private API requests** return 503 with null data and no-store while credentials are absent |
| Runtime dependency audit | `npm audit --omit=dev --audit-level=high` | 0 reported vulnerabilities | Registry audit for runtime dependencies at this check, not a code/security certification |
| Environment readiness | `npm run check:env` | Expected failure: 5 required names missing | No `.env.local` or verified accounts yet; checker prints names only |
| Repository hygiene | `git diff --check`, ignore checks/local links | Passed | `.env.local`, node_modules, .next and TypeScript build cache excluded; no credentials/private records in this slice |

The embedded PostgreSQL scenario switches between two simulated owners and anonymous/missing-claim access. It checks scoped row visibility, cross-owner insert/update/delete denial, same-workspace source foreign keys, duplicate files/rows, legitimate equal-value rows, private object ownership and exact amounts beyond JavaScript's safe-integer range. The migration executes in real embedded PostgreSQL, but Supabase schemas and JWT claims are simulated. This is not managed Supabase/Clerk/Storage HTTP verification, nor a multi-client concurrency test.

## Failures resolved during the slice

- The normal Node test runner's child-process isolation hit sandbox `spawn EPERM`; the package uses `--test-isolation=none` with independent synthetic fixtures.
- Next's environment typings initially made an empty configuration test fail TypeScript. The pure configuration boundary now accepts a string/undefined environment map. Tests/typecheck/build pass after the fix.
- Skill-installer catalog access timed out; direct upstream source pages and existing retained guidance were used. No external skill was globally installed.
- C: initially had about 160 MiB free. Authorized cache/compiler/build cleanup and later increased available space enabled dependency installation and builds. Cleanup did not delete project sources/reference archives.

## Open gates and next action

RQ-00 and RQ-01 remain **in_progress**. The user confirmed providers are not yet provisioned and asked for setup steps; follow [SETUP.md](SETUP.md), add credentials privately to ignored `.env.local`, and apply the reviewed migration to the new Raqam Supabase project. Restart development, or rebuild production, after configuring public keys.

Then verify real sign-in, session expiry, two-user row/file/API isolation, save/reload and private image access. Deployment, live Groq OCR, the browser product journey and reserved evaluation remain unrun. B/C names/contract acknowledgement and the organizer-confirmed cutoff remain pending.

Atomic CSV confirmation, audited transaction/document/category review, match constraints, scoped assistant execution and exposed summary/export endpoints still need implementation. The tested pure helpers do not complete RQ-04/RQ-06/RQ-09. Unreadable-image handling belongs to the OCR/review slice; signature checks alone do not prove an image is decodable.

## Backend continuation, 10 October 2026 (PKT)

Checker: Codex for user/A on `codex/raqam-backend`, fetched base `796ce4f`, plus the local CSV implementation carrying this entry. Primary project Markdown was reviewed and the complete retained Markdown inventory surveyed before continuation. Node 24.11.1/npm 11.6.2 on this host. No AI/model call or customer data was used.

Implemented original CSV Storage/preview registration, scoped batch retrieval/template, explicit row correction/rejection, atomic cash confirmation, immutable import decision history, retry receipts, preserved invalid rows and bounded input. Failed uploads recover only through authorized metadata lookup of the exact immutable hash path. Migration 002 removes direct cash INSERT so callers cannot bypass audit/cap checks.

| Check | Result | Limit |
| --- | --- | --- |
| `npm test` | **30/30 passed** | Synthetic inputs; two embedded Postgres scenarios with simulated auth/Storage |
| `npm run typecheck` | Passed | Strict compilation and route types |
| `npm run build` | Passed | Production compilation includes four import routes; final subsequent edits only affect SQL/tests/docs/smoke hostname |
| Configured local production HTTP smoke | Passed | Home/sign-in/health/headers and **9/9 private requests** return 401, null data, no-store while signed out |
| `npm run check:env` | Passed | Required backend names/URLs present, not a token integration test |
| Read-only service checks | Clerk credential and Supabase publishable key HTTP 200 | No records or credentials printed; native session integration remains unverified |
| Schema readiness | All five required relations return HTTP 404 / `PGRST205` | Migrations not visible through managed API; live gates remain open |

The CSV database scenario verifies cross-owner/anonymous denial, stored preview before cash creation, repeated source identity, atomic rollback on invalid/overflow rows, exact values beyond 2^53, reordered headers and blank original descriptions, actor/history preservation, immutable completed batches, direct cash-write denial, repeat confirmation and rollback when the workspace limit is exceeded. Workspace locking is implemented but multi-client concurrency has not been tested here.

Sandbox path resolution blocked the initial production build and sandbox networking blocked localhost; authorized elevated checks succeeded. Binding production to 127.0.0.1 initially caused Next's internal localhost proxy socket failure; binding both server/client to localhost resolved it. The test server was stopped after verification.

RQ-01 remains in progress; RQ-04 has a locally validated backend slice but requires managed migrations, native Clerk integration, two-user row/file/API checks and B's review journey. Audited edits after import, later resolution of confirmed unresolved rows, document/category/match reviews, assistant tools and summary/export routes remain unfinished. Apply migrations 001 then 002 after checking migration history, and record live evidence before claiming any persistence/release gate passed.

### Managed schema recheck after migration update

10 October 2026 (PKT), Codex on the same local backend slice: user reported migrations applied. Re-ran read-only `npm run check:services` once. Clerk server credential and Supabase publishable key checks pass (HTTP 200). `workspaces`, `sources` and `cashbook_records` now reject anonymous requests with HTTP 401 / `42501`, confirming those API relations are present and anonymous reads denied. `imports` and `review_decisions` still return HTTP 404 / `PGRST205`; the checker exits 1. Migration 002 is not visible yet. Check applied migration history and apply only the pending migration. No authenticated records were read/written, no migrations were applied by this check, and native token integration/two-user persistence remain unverified.

Latest recheck, 10 October 2026 (PKT), after the user's follow-up: `npm run check:services` exits **0**. Both credential/key probes pass (HTTP 200), and **5/5 required relations**, now including `imports` and `review_decisions`, deny anonymous reads (HTTP 401 / `42501`). This supersedes the missing-relation result above. Schema visibility is cleared; no signed-in records were read/written, and function behavior, native token integration and two-user persistence/isolation remain unverified.

## Reviewed cashbook continuation, 10 October 2026 (PKT)

Checker: Codex for user/A, same fetched backend base plus the local review slice. New files include migration 003, cashbook review contracts/mapping/persistence, transaction detail/history, summary/export routes and a live smoke script. Next dev generated an additive framework-guidance block in root AGENTS.md; its installed route-handler guidance was read. No AI was invoked.

- `npm test`: **32/32 passed**. The embedded import scenario now applies all three migrations and checks reviewed description/category persistence, clearing accepted categories, stale versions, unchanged-save history, exact snapshot/category/remainder totals, formula-safe reviewed export, rerun preservation, immutable history and owner/anonymous denial.
- `npm run typecheck` and `npm run build`: passed, including new detail/history/summary/export routes. One test query needed an explicit result type; compilation passed after that repair.
- Configured production smoke: **14/14 private requests** return 401 with null data/no-store while signed out; home/sign-in/health/header checks pass. Production test server stopped afterward. Local development remains available at localhost:3000 for the user's test session.
- Live native integration: an existing development test session was found. A fresh native token has no `role: authenticated`; a direct read-only managed Supabase limit-zero query returns **401/PGRST301**. `npm run smoke:live -- --readiness-only` exits 1. This verifies integration is failing, not the dashboard switches' exact states. Initial harness requests needed REST array normalization and JSON content type; both were corrected before this result. No test financial records/workspaces/images were created.
- The user reports **one test account**. Two-user isolation remains unrun. Live CSV/private Storage, audited edits, summary/export, session expiry and browser account switching remain unverified. New migration 003 still requires managed application; core relations from 001/002 remain visible.

The live script uses an existing selected development session, keeps tokens in memory and restricts writes to its named synthetic workspace. It does not create accounts/sessions, use a service-role client, or delete data. `--readiness-only` performs no financial writes; default persistence and `--reviews` are ready to run after native integration/migration setup. The root product UI and AI lanes remain reserved. Local progress does not complete RQ-01/RQ-04/RQ-06/RQ-09.

## Hosted database setup, 10 October 2026 (PKT)

Checker: Codex for user/A, same backend base plus the uncommitted continuation. User-authorized CLI login and organization-access recheck found `edge runners` with project `AI Con` (`umpgiibdwzahxztptplw`), matching the local Supabase URL. Pinned official CLI 2.120.0 was installed and linked; local CLI cache folders are ignored.

- Existing migrations 001/002 were verified through hosted relation/security checks and exact normalized function-body fingerprints for both import functions (2/2 match). Their earlier SQL-editor application had no CLI migration history; `migration repair --status applied` recorded only those verified versions.
- `db push --dry-run` identified only migration 003. `db push` applied it successfully. No existing migration was rerun.
- `db query --linked --file scripts/check-database.sql --output json`: **20/20 pass** for forced RLS, anonymous denial, invoker view, private source bucket, review version, revoked direct cash writes, and function execution/search-path rules.
- `npm run check:services -- --reviews`: both credential probes pass HTTP 200; **6/6 API relations** deny anonymous reads with HTTP 401/42501.
- `npm run smoke:live -- --readiness-only`: still fails before financial writes; fresh native Clerk token lacks the authenticated role, managed query returns **401/PGRST301**. The authenticated Supabase dashboard separately confirms its third-party provider list is empty. Exact Clerk connection form is prepared awaiting action-time confirmation; Clerk dashboard requires user sign-in before its compatibility setting can be inspected/enabled.

This supersedes migration-003-pending notes above. No financial test workspace/rows/images, account creation, deployment, Git push or merge occurred. One-account persistence, two-user isolation and product gates remain open.

### Approved Clerk provider connection

After explicit user approval, created Supabase's Clerk third-party connection using `https://smooth-gelding-4229.clerk.accounts.dev`; the dashboard visibly reports **ENABLED**. The initial bare-domain form submission was rejected before creation; submitting the same issuer with HTTPS succeeded. Fresh native readiness still fails because `role: authenticated` is absent, but the managed query now returns **401/42501** instead of PGRST301. This is consistent with signature trust working and the token receiving anonymous permissions; full authenticated access is not yet proven. No financial writes ran. The user reports Clerk dashboard sign-in, while the accessible tab still shows its sign-in screen after refresh; Clerk-side activation/access remains pending.

User subsequently clarified that Clerk is signed in on a teammate's computer and credentials cannot be shared. Clerk-side activation is assigned to that teammate; no credential transfer or local dashboard session is required. Recheck native readiness after their activation confirmation.

After the user reported activation, rechecked native readiness across the session refresh window. The token still lacks the role and Supabase returns 401/42501. Added issuer/freshness diagnostics to the harness; latest output verifies the fresh token issuer matches the configured Clerk instance (`issuerMatchesConfiguration: true`, `tokenIssuedRecently: true`, `roleConfigured: false`). Script syntax and Git whitespace checks pass. This does not inspect the teammate's dashboard; it establishes that the required claim is absent from this instance's freshly generated token. No persistence smoke writes ran. The documented manual native configuration is to merge `"role": "authenticated"` into this development instance's custom session claims and save, then recheck.

## Publication checks for PC handoff

10 October 2026 (PKT), user requested publishing this backend slice to its owned branch. Re-ran `npm test` (**32/32 pass**), `npm run typecheck` (pass) and `npm run build` (pass). Fetched origin; `codex/raqam-backend` had no divergence from base `796ce4f`. Environment and CLI cache ignore checks pass. These checks do not clear the native-role/persistence or release gates above. No new live financial records or deployment were created during publication preparation.
