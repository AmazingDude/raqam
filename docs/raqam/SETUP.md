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
4. Review/apply `supabase/migrations/202610100001_workspace_spine.sql` in the new project's SQL editor or agreed migration workflow. It creates private `raqam-sources`. Do not apply over an unrelated project; this one-time migration deliberately fails on conflicting existing names.
5. Set `APP_URL` to the app origin. `npm run check:env` reports missing names without values; it checks presence/URLs, not credentials. C can run `npm run check:env -- --ai` after Groq setup.
6. The installed Next.js 16 platform uses `src/proxy.ts` for Clerk session middleware and resource guards on every private API. Supabase clients are request-scoped with the current Clerk token via `accessToken`. Verify actual configuration against [Clerk middleware](https://clerk.com/docs/reference/nextjs/clerk-middleware). With missing configuration, the public setup page remains reachable and private APIs return 503 with no data.

Do not post keys to chat/repo/screenshots. Commit only empty `.env.example`. No account has been created by this work; accounts, billing choices and login configuration remain setup actions for the user.

## Live spine gate

Record revision, procedure, counts, checker and timestamp.

- A signs in, creates one workspace, saves/reloads one transaction and uploads/views one private image.
- B cannot read/insert/update/delete A's rows or files through database/Storage/API requests; repeat A→B. Signed-out/expired sessions cannot access saved records.
- Sign-in remains reachable; proxy/API route coverage, expiry, sign-out and account switch work without previous-user data.
- Private source retrieval uses authorized short-lived access; known other-user paths remain inaccessible.
- Unknown amounts stay unresolved; originals persist; repeats do not duplicate money/evidence. Atomic confirmation still needs implementation.
- Production build passes; verify the authenticated spine on the selected deployment when deployment is requested.

Embedded PostgreSQL tests validate SQL privileges/RLS with simulated JWT claims and a simplified Storage schema. They do not validate Clerk signatures, managed Supabase, Storage HTTP endpoints or browser behavior.
