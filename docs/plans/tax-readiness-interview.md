# Pakistan tax-readiness interview

**Status:** user-authorized implementation following the current-main review; this is a readiness profile, not tax preparation or filing.

## Audience and task

A signed-in Raqam workspace owner in Pakistan answers a short, guided set of questions about their taxpayer type, residence, income sources, records and filing history, then reviews and explicitly saves a private profile for the current normal tax year.

## Visual direction

- **Tokens:** use the existing workspace system: ink `#18191b`, canvas `#f5f5f3`, white surface `#ffffff`, muted `#62656b`, success `#176444`; existing 4/8/12/16/24/32 px spacing; 10 px controls and 18 px main panels; system sans-serif.
- **Layout:** left rail stays as-is. Main column: title and scope note; a distinct July-to-June tax-year ribbon; a five-stage progress indicator; one question group at a time; review step with a generated records-to-gather list and explicit save confirmation.
- **Memorable element:** the tax-year ribbon clearly labels the period and year number so the user can see which filing period the questions describe.
- **Assets:** none. The workflow is informational and uses the existing Raqam visual language.
- **Privacy:** no CNIC/NTN, credentials, amounts or document uploads. Unsaved answers stay in memory; tax answers never go to Ask Raqam or any model.

## Done criteria

- Current Pakistani normal tax year is calculated using `Asia/Karachi` time and FBR's year-ending convention.
- Strict server/client schemas reject unknown or malformed values; tenant access derives from the Clerk session and RLS.
- Saving requires an explicit confirmation and is atomic; first-time examples never write to storage.
- Keyboard-operable, semantic, responsive UI with visible focus, no horizontal overflow at 360 px and a clear explanation that Raqam does not calculate or file tax.
- Meaningful contract/database tests, typecheck, lint/build where available, focused browser/render verification, and handoff update.

## Integration and manual setup

- Synced `origin/main` through `d7ff6b6`, preserving its business-profile and gated workpaper screens. The interview is reachable through **Tax readiness** and **Business profile → Tax profile**. The workpaper remains gated; a self-reported readiness profile does not satisfy its verified schedules/rules/calculation/review gates.
- Apply `supabase/migrations/202610100015_tax_readiness_profiles.sql` once using Supabase SQL Editor after reviewing installed migrations. Version 014 belongs to the upstream ledger. The initially supplied tax-profile file used 014 but had identical contents: if those contents were already applied manually, do not replay them under 015. Inspect the checker first and coordinate migration-history reconciliation with the integrator.
- Run `scripts/check-tax-readiness-migration.sql` afterward. Every flag should be true except `authenticated_direct_write_allowed`, `anonymous_table_access_allowed`, and `anonymous_save_allowed`, which must be false. This is a schema/grant check, not a deployed ownership test.
- Verify signed-in initial load, draft navigation, explicit save, reload, editing and a stale second-tab save after applying the migration. Use a second owner to verify hosted isolation when available. This task has not read or written hosted tax profiles.
- Current means the running normal Pakistan tax year: on 10 October 2026, TY2027 spans 1 July 2026–30 June 2027. The most recently ended year is not selected implicitly. Special tax years and prior-year returns are outside this interview.
- Drafts live in React memory. Changing workspace/account or reloading discards unsaved answers; navigation between workspace views retains them. Save failures retain the draft; stale saves require reloading before another confirmed attempt. No tax answers, amounts, identifiers or documents are sent to a model.

## Verification and handoff

**Status:** implementation and local verification complete; hosted setup/acceptance is not verified.

- Contract/service/database/client focused checks: **9/9**. Final integrated backend/security regression: **194/194**; final client regression: **30/30**. The real PGlite tests verify owner-derived storage, RLS/grants, explicit confirmation, exact choices, version conflicts and the read-only migration checker under simulated JWT claims. They do not establish hosted token verification or concurrent multi-session enforcement.
- Strict TypeScript passes. The standard `npm run build` passes with the existing pinned dependencies copied into the isolated worktree (no installation, dependency/configuration change or source changes to the PDF parser). Early Webpack-only attempts failed on existing auth/PDF bundling behavior; that workaround was abandoned and no unrelated auth/PDF edits remain. No lint script is available.
- Synthetic component browser checks cover empty-step gating, exclusive choices, focus movement, 360/768/1280 layouts, zero autosaves, explicit save, save/reload and conflict draft retention; six screenshots reviewed, zero page errors or model requests. Temporary verification page removed before the final build. Production browser checks verify the Business profile shortcut, demo guard, responsive workspace, retained gated workpaper and Ask Raqam navigation; demo makes no private tax requests.
- Production HTTP checks: home/sign-in/health/headers and **29/29** private requests fail closed with missing configuration; frontend checks **3/3** public/UI routes and **9/9** private GET denials. These are unconfigured local checks, not signed-in deployed isolation evidence.
- User reported SQL `42P07` because `tax_readiness_profiles` already exists. The migration is now transactional and retry-safe for that partial state: it preserves the table, re-applies the named owner policy, replaces the functions and restores grants. The expanded checker inspects required columns, owner policy, RLS, functions and privileges without reading profile data. No SQL was run by this task. Run the checker first; if all checks pass, no SQL is needed. If hosted state is incomplete, the user can rerun the updated migration. Never drop the table or its records based on the duplicate-table error alone. Signed-in save/reload and owner isolation remain unverified.
- Next: inspect installed schema when permitted, then signed-in profile save/reload/update and second-owner/second-tab acceptance. Full tax schedules, rule packs, deterministic tax calculation, practitioner review and filing remain outside this slice.
