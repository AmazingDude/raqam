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

The latest signed-in check found an active development session, but its native token lacks the authenticated role. Supabase's approved third-party Clerk connection is now enabled for `https://smooth-gelding-4229.clerk.accounts.dev`; the fresh-token query reaches permission denial (401/42501), superseding the earlier 401/PGRST301 signature rejection. Activate Clerk's Connect with Supabase configuration following the linked native integration guide above. Fresh session tokens must carry `role: authenticated`. Sign in again if necessary after configuration. The Clerk dashboard tab accessible to Codex still needs sign-in; local-app sign-in and dashboard sign-in are separate sessions.

Start the local app at `APP_URL` (currently localhost:3000). `npm run smoke:live -- --readiness-only` uses the existing development session to check the role and perform an authenticated limit-zero Supabase query. Tokens remain in memory. It creates no user/session and writes no records. It automatically selects an account only when exactly one exists; otherwise pass `--user=<test-user-id>`. The most recent active session of that selected test account is used.

Once readiness passes, `npm run smoke:live` exercises workspace save/reload, CSV preview/confirmation/retries, exact money and private image access. It writes only a workspace named `Raqam synthetic validation` and its fixed synthetic fixture; an existing differently named workspace causes it to stop. Records are retained so repeat runs test duplicate behavior. `npm run smoke:live -- --reviews` additionally tests reviewed edits, stale-write denial, history, summary and export after migration 003. Use `npm run check:services -- --reviews` to include anonymous denial on the new history table. None of these one-account checks completes two-user isolation, session expiry or browser account switching. The user currently has one test account.

## Linked database checks

Supabase CLI 2.120.0 is pinned as a development dependency. This host is authenticated and linked to `AI Con` (`umpgiibdwzahxztptplw`) in `edge runners`; another clone must authenticate and link deliberately before remote commands. CLI cache folders are ignored. `npx supabase db push --linked --dry-run` previews pending migrations before any application. Never repair migration history without verifying the corresponding hosted schema first.

`npx supabase db query --linked --file scripts/check-database.sql --output json` runs 20 read-only schema, RLS, private-bucket, privilege and function checks; all currently pass. It does not test signed-in business behavior. `scripts/check-migration-drift.mjs` generates a read-only exact-body fingerprint query for the two migration-002 import functions; use an ignored temporary SQL file when checking an existing SQL-editor installation.

The user clarified that a teammate holds Clerk dashboard access on their own computer. No dashboard credentials should be shared. That teammate should open [Supabase integration setup](https://dashboard.clerk.com/setup/supabase), select the development instance matching `smooth-gelding-4229.clerk.accounts.dev`, and activate the integration. The local readiness script can verify the resulting role claim without dashboard access.

The reported activation has not yet appeared in fresh tokens from the matching instance. If the claim remains absent, follow [Supabase's manual native configuration](https://supabase.com/docs/guides/auth/third-party/clerk#manually-configuring-your-clerk-instance): in that development instance's Sessions → Customize session token, merge `"role": "authenticated"` into the existing claims and save. Preserve other claims. This customizes native session tokens; no JWT template or Supabase signing secret is required. The readiness script reports issuer matching and token freshness without printing the token.

## Continue on another PC

1. Clone `https://github.com/AmazingDude/raqam.git` with branch `codex/raqam-backend`, or fetch and switch to that branch in an existing clean clone. Read `AGENTS.md`, `handoff.md`, `PRD.md`, `BUILD_PLAN.md` and the linked workflow/contracts before editing.
2. Install Node 22.18+ (an active supported LTS is preferred), run `npm ci`, and copy `.env.example` to ignored `.env.local`. Obtain authorized environment configuration privately; Git does not transfer keys, dashboard access, CLI credentials or local sessions.
3. Run `npm run check:env`, `npm test`, `npm run typecheck` and `npm run build`. For managed schema checks use `npm run check:services -- --reviews`. Hosted migrations 001–003 are already applied to `AI Con`; do not rerun the SQL files.
4. Start `npm run dev` and sign into the local app with the designated development test account. Have the Clerk dashboard owner resolve the native-role claim above, then run `npm run smoke:live -- --readiness-only`. Only after that passes, run `npm run smoke:live -- --reviews`. This writes fixed synthetic records to its guarded validation workspace and retains them for retry checks. It refuses to mix fixtures into another business workspace.
5. Supabase CLI linking is optional for ordinary app development. If hosted SQL inspection is needed, authenticate with an authorized organization account and deliberately link `umpgiibdwzahxztptplw`; local CLI cache/link state is ignored and is not included in the branch. Preview any future migration using `db push --dry-run` before applying it.

The latest local release checks pass 32/32 tests, strict types and production build. Native-role readiness remains failing (fresh matching token lacks the role; 401/42501). One-account persistence, real two-user isolation, product UI, AI and deployment gates remain open.
