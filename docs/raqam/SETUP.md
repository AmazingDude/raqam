# Role A setup and validation

User/A owns setup on `codex/raqam-backend`; B/C consume [CONTRACTS.md](CONTRACTS.md). Native identity and seven one-account live groups pass. Local tests and one-account checks alone cannot complete RQ-01.

## Local prerequisites

The default provider is Groq. Configure its API key plus both model IDs in ignored `.env.local`; the adapter validates both model settings even for a text operation. Gemini is also explicitly selectable with `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_VISION_MODEL` and `GEMINI_TEXT_MODEL`; confirm model access in that account before choosing IDs. `.env.example` lists the supported fields. The current local environment has no non-empty Groq, Gemini or Eve provider key. Restart the dev server after environment changes. Deployment environments need equivalent configuration supplied privately.

Read-only assistant smoke: `node --env-file-if-exists=.env.local --conditions=react-server scripts/smoke-assistant.mjs`. An optional `--url=http://localhost:3189` selects an isolated local server, while the Origin remains configured by APP_URL. Authenticated checks require an existing active session in a workspace named exactly `Raqam synthetic validation` or `Raqam cap validation`; ordinary business records are never read or sent to the model. A second active populated fixture enables actual foreign-evidence validation; otherwise the script explicitly reports the nonexistent-ID check and the remaining two-account gate. The script creates no accounts, sessions or financial records.

On this Windows sandbox, the default Node test runner may fail to spawn workers with `EPERM`. The successful Node 25.9.0 command is `node --conditions=react-server --test --test-isolation=none --test-concurrency=1 tests/backend/*.test.ts tests/security/*.test.ts`; the AI/client suite is `node --conditions=react-server --test --test-isolation=none tests/e2e/client-api.test.ts tests/ai/*.test.ts tests/ai/live/feasibility.test.ts`. These exact commands are verified on Node 25.9.0; do not assume `--test-isolation=none` exists on Node 22.

1. Keep adequate free space for dependencies/build output (roughly 2 GiB before a clean installation is a useful starting allowance). Cleanup initially left about 300 MiB; later available space rose to about 1.8 GiB, enabling the successful framework install/build. Authorized cleanup removed other-project caches/compiler output and seven confirmed Vite dist directories. No Raqam/reference files were deleted; no temp files older than one day were found.
2. Use npm and the lockfile. Node 22.18+ supports the current TypeScript test command; local runtime is 25.9.0. Pin a supported deployment Node LTS at framework bootstrap. Native TypeScript execution does not replace type checking.
3. Run `npm ci`, `npm test`, `npm run typecheck`. The tests disable subprocess isolation because sandbox child-process spawn failed; fixtures are synthetic and embedded database instances are isolated and closed.
4. Framework/SDK versions are pinned in the lockfile, with compatibility checked before installation. `npm run build` builds the platform shell; `npm run dev` starts local development. Product workspace screens and AI modules remain B/C work. `npm run typecheck` generates Next route types before strict compilation so a fresh clone does not depend on committed build output.

## Clerk/Supabase setup

1. Create a Raqam Clerk development application and select the team's login method. Put its publishable/secret keys privately in `.env.local` using `.env.example`. Reserve two distinct users for isolation checks.
2. Create a separate Raqam Supabase project. Add its project URL and publishable key to `.env.local`. Normal application requests use that key with the current Clerk session token; no service-role key belongs in ordinary app access.
3. Enable Clerk's Connect with Supabase integration, then add Clerk under Supabase Authentication → Third-party auth using this application's Clerk domain. The integration supplies the authenticated role claim. Use [native Clerk integration](https://supabase.com/docs/guides/auth/third-party/clerk); the JWT-template integration is deprecated.
4. Review/apply migrations in order: `202610100001_workspace_spine.sql`, `202610100002_csv_imports.sql`, then `202610100003_cashbook_review.sql`. The first creates private `raqam-sources`; the second adds import confirmation/history and removes direct transaction INSERT; the third adds reviewed description/category history and snapshot functions, removing direct cash DELETE. Do not apply over an unrelated project; these one-time migrations deliberately fail on conflicting existing names. All three are already applied to this linked project; do not reapply them. The existing SQL-editor migrations 001/002 were verified before recording their CLI history.
5. Set `APP_URL` to the app origin. `npm run check:env` reports missing names without values; it checks presence/URLs, not credentials. C can run `npm run check:env -- --ai` after Groq setup.
6. The installed Next.js 16 platform uses `src/proxy.ts` for Clerk session middleware and resource guards on every private API. Supabase clients are request-scoped with the current Clerk token via `accessToken`. Verify actual configuration against [Clerk middleware](https://clerk.com/docs/reference/nextjs/clerk-middleware). With missing configuration, the public setup page remains reachable and private APIs return 503 with no data.

Do not post keys to chat/repo/screenshots. Commit only empty `.env.example`. No account has been created by this work; accounts, billing choices and login configuration remain setup actions for the user.

## Live spine gate

Record revision, procedure, counts, checker and timestamp.

- A signs in, creates one workspace, saves/reloads one transaction and uploads/views one private image.
- B cannot read/insert/update/delete A's rows or files through database/Storage/API requests; repeat A→B. Signed-out/expired sessions cannot access saved records.
- Sign-in remains reachable; proxy/API route coverage, expiry, sign-out and account switch work without previous-user data.
- Private source retrieval uses authorized short-lived access; known other-user paths remain inaccessible.
- Upload a synthetic CSV, supported Excel workbook or selectable-text PDF statement, retrieve its preview, explicitly confirm corrections/rejections and reload cash/history. Scanned/image-only PDF statements are outside this import flow. Unknown amounts stay unresolved; originals persist; repeat upload/confirmation does not duplicate money/evidence. Verify two concurrent imports at the workspace cap roll back safely.
- Production build passes; verify the authenticated spine on the selected deployment when deployment is requested.

Embedded PostgreSQL tests validate SQL privileges/RLS with simulated JWT claims and a simplified Storage schema. They do not validate Clerk signatures, managed Supabase, Storage HTTP endpoints or browser behavior.

## Current readiness, 10 October

Local ignored `.env.local` has the application backend settings; the AI provider credentials are currently empty. Earlier read-only checks passed: Clerk credential and Supabase publishable key returned HTTP 200, and the five core relations deny anonymous reads. The user reports migration 008 applied and its supplied privilege check passes. Hosted status for 009/010 is not verified here; check exact migration history/schema before applying pending SQL manually. The fresh signed-out HTTP smoke passed on port 3187: 3 public/UI routes, 9 frontend private GET denials, and 27 platform private-request denials. This does not establish current signed-in persistence, live inference or two-user browser behavior.

After rebuilding with configured public keys, start `npm run start -- --hostname localhost --port 3187` and run `npm run smoke:platform -- --configured` to check signed-out failure behavior. Use the same hostname for server and client; binding only to 127.0.0.1 caused a local internal-proxy socket failure on this Windows host. This is separate from the signed-in persistence gate. The default smoke mode targets missing configuration.

## Native session and synthetic persistence check

The user signed into the Clerk dashboard and authorized saving the native claim. Codex verified the Development domain `smooth-gelding-4229.clerk.accounts.dev`, changed its empty custom session claims to `{ "role": "authenticated" }` and saved. Supabase's previously approved Clerk provider remains enabled. A fresh matching token now carries the role, and the managed limit-zero query passes HTTP 200. This supersedes the earlier 401/42501 blocker. Local-app and dashboard sign-in remain separate sessions; a new PC still needs its own test session.

Start the local app at `APP_URL` (currently localhost:3000). `npm run smoke:live -- --readiness-only` uses the existing development session to check the role and perform an authenticated limit-zero Supabase query. Tokens remain in memory. It creates no user/session and writes no records. It automatically selects an account only when exactly one exists; otherwise pass `--user=<test-user-id>`. The most recent active session of that selected test account is used.

Once readiness passes, `npm run smoke:live` exercises workspace save/reload, CSV preview/confirmation/retries, exact money and private image access. It writes only a workspace named `Raqam synthetic validation` and its fixed synthetic fixture; an existing differently named workspace causes it to stop. Records are retained so repeat runs test duplicate behavior. `npm run smoke:live -- --reviews` additionally tests reviewed edits, stale-write denial, history, summary and export after migration 003. Use `npm run check:services -- --reviews` to include anonymous denial on the new history table. None of these one-account checks completes two-user isolation, session expiry or browser account switching. Two development test accounts are now active; use the isolation script below for both directions.

## Linked database checks

Supabase CLI 2.120.0 is pinned as a development dependency. This clone is currently unlinked and has no CLI access token. Hosted project is `AI Con` (`umpgiibdwzahxztptplw`) in `edge runners`; authenticate/link deliberately before remote commands. CLI cache folders are ignored. `npx supabase db push --linked --dry-run` previews pending migrations before any application. Never repair migration history without verifying the corresponding hosted schema first; do not treat SQL-editor application as automatically recorded CLI history.

`npx supabase db query --linked --file scripts/check-database.sql --output json` runs 20 read-only schema, RLS, private-bucket, privilege and function checks; all currently pass. It does not test signed-in business behavior. `scripts/check-migration-drift.mjs` generates a read-only exact-body fingerprint query for the two migration-002 import functions; use an ignored temporary SQL file when checking an existing SQL-editor installation.

The user clarified that a teammate holds Clerk dashboard access on their own computer. No dashboard credentials should be shared. That teammate should open [Supabase integration setup](https://dashboard.clerk.com/setup/supabase), select the development instance matching `smooth-gelding-4229.clerk.accounts.dev`, and activate the integration. The local readiness script can verify the resulting role claim without dashboard access.

For a different instance or a future missing-role failure, follow [Supabase's manual native configuration](https://supabase.com/docs/guides/auth/third-party/clerk#manually-configuring-your-clerk-instance): in that development instance's Sessions → Customize session token, merge `"role": "authenticated"` into the existing claims and save. Preserve other claims. This customizes native session tokens; no JWT template or Supabase signing secret is required. The readiness script reports issuer matching and token freshness without printing the token.

Migrations `202610100004_import_resolution.sql` and `202610100005_review_conflict.sql` now have passing hosted behavior: 004 resolution/correction/rejection/retries/conflicts and user-applied 005 stale-review 409 denial. Do not reapply 001–005. `scripts/check-import-resolution.sql` provides five read-only resolution schema/security checks; the original 20-check script covers 001–003. SQL-editor applications do not automatically record CLI migration history: verify schema/history before future CLI pushes. This clone remains unlinked.

The earlier stale-review timeout is cleared by the repair; live conflicts now return 409. [Supabase's troubleshooting guidance](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b) explains why manually raising `40001` is unsuitable for application conflicts. Inspection found zero other active review requests; no backends were terminated. For future migrations, prepare the reviewed SQL file and let the user run it manually, per their speed preference.

## Continue on another PC

1. Clone `https://github.com/AmazingDude/raqam.git` with branch `codex/raqam-backend`, or fetch and switch to that branch in an existing clean clone. Read `AGENTS.md`, `handoff.md`, `PRD.md`, `BUILD_PLAN.md` and the linked workflow/contracts before editing.
2. Install Node 22.18+ (an active supported LTS is preferred), run `npm ci`, and copy `.env.example` to ignored `.env.local`. Obtain authorized environment configuration privately; Git does not transfer keys, dashboard access, CLI credentials or local sessions.
3. Run `npm run check:env`, `npm test`, `npm run typecheck` and `npm run build`. For managed schema checks use `npm run check:services -- --reviews`. Hosted migrations 001–003 are already applied to `AI Con`; do not rerun the SQL files.
4. Start `npm run dev` and sign into the local app with the designated development test account. Have the Clerk dashboard owner resolve the native-role claim above, then run `npm run smoke:live -- --readiness-only`. Only after that passes, run `npm run smoke:live -- --reviews`. This writes fixed synthetic records to its guarded validation workspace and retains them for retry checks. It refuses to mix fixtures into another business workspace.
5. Supabase CLI linking is optional for ordinary app development. If hosted SQL inspection is needed, authenticate with an authorized organization account and deliberately link `umpgiibdwzahxztptplw`; local CLI cache/link state is ignored and is not included in the branch. Preview any future migration using `db push --dry-run` before applying it.

The latest complete automated regression on the merged runtime passes **141/141 backend/security tests** and strict TypeScript. A production build was not rerun on this revision because the user's active app shares the `.next` output; prior build evidence is recorded separately. These local checks include synthetic selectable-text PDF statements and A2 semantic-matcher cases; a signed-in upload/browser pass remains open. Earlier evidence includes 16/16 signed-out private requests, 7/7 live one-account groups and 10/10 live two-account groups using `node --env-file-if-exists=.env.local scripts/smoke-isolation.mjs`; those managed-service checks were not repeated for PDF parsing. The live scripts require the designated synthetic validation workspaces and never modify ordinary business records. Storage mutation, concurrent-client, browser recovery, AI and deployment gates remain separate. See VALIDATION.md for current evidence.

## Current migration and provider status (10 October)

The user's read-only result confirms migration 008's three tables, forced context RLS, owner read/RPC grants and denied direct/anonymous access. The latest read-only output from [the 009/010 check](../../scripts/check-receipt-statement-migrations.sql) confirms the complete receipt-image registration safeguards, long-statement function definitions, 20,000-row import/confirmation checks, 50,000-row workspace caps, original-description preservation, snapshot cap and owner-only import RPC access. This verifies expected installed function behavior; no migration was run by this task. Do not reapply 008–010. If a later deployment's schema drifts, compare exact installed definitions before a manual change.

The presence-only check of ignored `.env.local` found no non-empty Groq key/model, Gemini key or Eve key. `.env.example` lists the supported settings. Choose a provider/model the account can actually access, set it privately, and restart the app. No live provider call was made during the latest integration checks.

## Long statements and Eve (10 October)

The 010 migration also fixes original-description lookup for native bank headings such as Narration. If it is pending, hosted imports above 50 rows will remain limited by the existing schema. PDF statements allow 20 MiB, 1,000 pages and 20,000 preview rows, subject to hosting upload/time limits. Scanned bank PDFs require OCR text before upload. See [long-statement implementation and limits](LONG_STATEMENTS.md).

Restart the development server after installing the updated dependencies/configuration. PDF statements allow 20 MiB, 1,000 pages and 20,000 preview rows, subject to hosting upload/time limits. Scanned bank PDFs require OCR text before upload. See [long-statement implementation and limits](LONG_STATEMENTS.md).

To use RunAnywhere Eve for Ask Raqam, add `ASSISTANT_PROVIDER=eve` and `RUNA_CLOUD_KEY=<your Cloud key>` to ignored `.env.local`, then restart the server. Create a **Cloud** key in console.runanywhere.ai; an on-device SDK key cannot call this endpoint. Keep the actual key out of chat/commits. Eve routes supported questions to verified tools; image OCR continues using the existing vision provider. Model credit/entitlement must be checked in the account console; published terms confirm a $5 welcome grant; this account balance/payment settings were not inspected.

Eve defaults to 20 attempted calls per UTC day per process, one at a time, without automatic retries. Set `EVE_DAILY_REQUEST_LIMIT=0` to disable calls or lower it to an integer from 1 to 20. Restarts/multiple instances have separate memory counters; account billing limits remain authoritative. PDF parsing consumes no Eve requests.
