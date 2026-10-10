# Role A setup and validation

User/A owns setup on `codex/raqam-backend`; B/C consume [CONTRACTS.md](CONTRACTS.md). The Next.js platform shell and local financial code run; live provider checks remain pending. Local tests alone cannot complete RQ-01.

## Local prerequisites

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
- Upload a synthetic CSV, retrieve its preview, explicitly confirm corrections/rejections and reload cash/history. Unknown amounts stay unresolved; originals persist; repeat upload/confirmation does not duplicate money/evidence. Verify two concurrent imports at the workspace cap roll back safely.
- Production build passes; verify the authenticated spine on the selected deployment when deployment is requested.

Embedded PostgreSQL tests validate SQL privileges/RLS with simulated JWT claims and a simplified Storage schema. They do not validate Clerk signatures, managed Supabase, Storage HTTP endpoints or browser behavior.

## Current readiness, 10 October

Local ignored `.env.local` is populated; Groq fields remain C's responsibility. `npm run check:env` passes required backend presence checks. The latest read-only `npm run check:services` passes: Clerk credential and Supabase publishable key checks return HTTP 200; all five required relations (`workspaces`, `sources`, `cashbook_records`, `imports`, `review_decisions`) are visible and deny anonymous access (HTTP 401 / `42501`). Do not rerun migrations to resolve the former missing-table issue; it is cleared. Confirm native Clerk integration and run the live spine gate next. This checker does not validate signed-in tokens, function behavior or two-user isolation.

After rebuilding with configured public keys, start `npm run start -- --hostname localhost --port 3187` and run `npm run smoke:platform -- --configured` to check signed-out failure behavior. Use the same hostname for server and client; binding only to 127.0.0.1 caused a local internal-proxy socket failure on this Windows host. This is separate from the signed-in persistence gate. The default smoke mode targets missing configuration.

## Native session and synthetic persistence check

The user signed into the Clerk dashboard and authorized saving the native claim. Codex verified the Development domain `smooth-gelding-4229.clerk.accounts.dev`, changed its empty custom session claims to `{ "role": "authenticated" }` and saved. Supabase's previously approved Clerk provider remains enabled. A fresh matching token now carries the role, and the managed limit-zero query passes HTTP 200. This supersedes the earlier 401/42501 blocker. Local-app and dashboard sign-in remain separate sessions; a new PC still needs its own test session.

Start the local app at `APP_URL` (currently localhost:3000). `npm run smoke:live -- --readiness-only` uses the existing development session to check the role and perform an authenticated limit-zero Supabase query. Tokens remain in memory. It creates no user/session and writes no records. It automatically selects an account only when exactly one exists; otherwise pass `--user=<test-user-id>`. The most recent active session of that selected test account is used.

Once readiness passes, `npm run smoke:live` exercises workspace save/reload, CSV preview/confirmation/retries, exact money and private image access. It writes only a workspace named `Raqam synthetic validation` and its fixed synthetic fixture; an existing differently named workspace causes it to stop. Records are retained so repeat runs test duplicate behavior. `npm run smoke:live -- --reviews` additionally tests reviewed edits, stale-write denial, history, summary and export after migration 003. Use `npm run check:services -- --reviews` to include anonymous denial on the new history table. None of these one-account checks completes two-user isolation, session expiry or browser account switching. The user currently has one test account.

## Linked database checks

Supabase CLI 2.120.0 is pinned as a development dependency. This host is authenticated and linked to `AI Con` (`umpgiibdwzahxztptplw`) in `edge runners`; another clone must authenticate and link deliberately before remote commands. CLI cache folders are ignored. `npx supabase db push --linked --dry-run` previews pending migrations before any application. Never repair migration history without verifying the corresponding hosted schema first.

`npx supabase db query --linked --file scripts/check-database.sql --output json` runs 20 read-only schema, RLS, private-bucket, privilege and function checks; all currently pass. It does not test signed-in business behavior. `scripts/check-migration-drift.mjs` generates a read-only exact-body fingerprint query for the two migration-002 import functions; use an ignored temporary SQL file when checking an existing SQL-editor installation.

The user clarified that a teammate holds Clerk dashboard access on their own computer. No dashboard credentials should be shared. That teammate should open [Supabase integration setup](https://dashboard.clerk.com/setup/supabase), select the development instance matching `smooth-gelding-4229.clerk.accounts.dev`, and activate the integration. The local readiness script can verify the resulting role claim without dashboard access.

For a different instance or a future missing-role failure, follow [Supabase's manual native configuration](https://supabase.com/docs/guides/auth/third-party/clerk#manually-configuring-your-clerk-instance): in that development instance's Sessions → Customize session token, merge `"role": "authenticated"` into the existing claims and save. Preserve other claims. This customizes native session tokens; no JWT template or Supabase signing secret is required. The readiness script reports issuer matching and token freshness without printing the token.

Migrations `202610100004_import_resolution.sql` and `202610100005_review_conflict.sql` are prepared and locally validated, but are not applied to the hosted project. Review/apply these pending migrations in order. After application, `scripts/check-import-resolution.sql` provides five read-only resolution schema/security checks. The original 20-check script covers migrations 001–003; passing it does not prove 004/005 are installed. Current outcome/resolution routes require 004. Migration 005 preserves review behavior while repairing stale-decision errors from retryable `40001` to `PT409`.

Do not rerun the live stale-review check until migration 005 is applied. The existing hosted function can trigger an infinite PostgREST retry loop for a deliberate conflict. [Supabase's troubleshooting guidance](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b) also says existing looping backends need to be stopped manually; inspect only the exact test requests and terminate only verified affected backends after authorization. Do not terminate unrelated sessions or restart the whole project by default.

## Continue on another PC

1. Clone `https://github.com/AmazingDude/raqam.git` with branch `codex/raqam-backend`, or fetch and switch to that branch in an existing clean clone. Read `AGENTS.md`, `handoff.md`, `PRD.md`, `BUILD_PLAN.md` and the linked workflow/contracts before editing.
2. Install Node 22.18+ (an active supported LTS is preferred), run `npm ci`, and copy `.env.example` to ignored `.env.local`. Obtain authorized environment configuration privately; Git does not transfer keys, dashboard access, CLI credentials or local sessions.
3. Run `npm run check:env`, `npm test`, `npm run typecheck` and `npm run build`. For managed schema checks use `npm run check:services -- --reviews`. Hosted migrations 001–003 are already applied to `AI Con`; do not rerun the SQL files.
4. Start `npm run dev` and sign into the local app with the designated development test account. Have the Clerk dashboard owner resolve the native-role claim above, then run `npm run smoke:live -- --readiness-only`. Only after that passes, run `npm run smoke:live -- --reviews`. This writes fixed synthetic records to its guarded validation workspace and retains them for retry checks. It refuses to mix fixtures into another business workspace.
5. Supabase CLI linking is optional for ordinary app development. If hosted SQL inspection is needed, authenticate with an authorized organization account and deliberately link `umpgiibdwzahxztptplw`; local CLI cache/link state is ignored and is not included in the branch. Preview any future migration using `db push --dry-run` before applying it.

The latest local checks pass 37/37 tests, strict types, production build and 16/16 signed-out private requests. Native-role readiness now passes HTTP 200. Hosted migration 004, real two-user isolation, product UI, AI and deployment gates remain open. See VALIDATION.md for the separate one-account synthetic persistence result.
