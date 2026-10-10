# Person C step 1 — observed repository baseline

**Updated:** 10 October 2026, PKT. **Current checkout:** `/home/home/Documents/work/Projects/Hackathon/raqam-ai-two-person`, branch `codex/ai-two-person`.

**Current integration:** A's baseline `4b1782cdc5bb1e236accc04512edbadeee5e4e47` is imported through a pending, uncommitted merge into C HEAD `75a4c61`. App, package/lock/config, canonical contracts/helpers, backend tests and migrations are present. C step3 files and ignored `.env.local` are preserved. C local changes have a retained safety stash and `/tmp/raqam-before-backend-0mp_m6lb` snapshot. No step4 implementation, commit, push or hosted migration is authorized in this integration task. A's case-colliding setup note is preserved as `docs/ai/PROVIDER_BASELINE.md` with reference-only updates.

Commands: pinned npm11.12.1 `ci`; `npm test` for A's offline backend/security suite; `npm run typecheck`; `node tests/ai/live/feasibility.test.ts` for C's offline CLI regressions. The package's test script does not include C tests, so run both explicitly. Local Node24.13.1 satisfies engines>=22.18.0; A recorded25.9.0 in `.node-version`. Native strip execution and strict compilation are separate checks.

Integration evidence: `npx --yes npm@11.12.1 ci --no-audit --no-fund` restored65 lockfile packages successfully; package/lock/config files were not modified. `npm test` passed38/38 offline backend/security tests; C CLI regressions passed17/17. Route type generation and strict `tsc --noEmit` passed after a C-only explicit guard for a possibly missing expected-fixture lookup. The first npm typecheck attempt ran before executable links were installed and failed `next: not found`; the installed-script check was rerun after restoration. No production build, live Groq call, hosted migration or service configuration was performed. Original frontend archive and all references are unchanged. Staged baseline diff reports two inherited extra EOF blank lines in A's migrations004/005; those files remain byte-identical to A rather than being reformatted during integration.

The remaining sections are the original step1 history, not the current application inventory.

## Publication update — 10 October2026

Reviewed C code19920fb is combined with main cd092e4 for publication. The earlier pending-merge descriptions above are historical records. Latest A/B foundation includes D13/document RPCs and B source UI; remaining receipt integration is listed in A_RECEIPT_INTEGRATION_HANDOFF.md. Current typecheck/build,66 AI module tests,17 offline feasibility,77 backend/security and four client API tests pass. No deployment or new live calls.

## Git snapshot

- Branch: docs/rules-and-team-split.
- HEAD: 7a432a48bf9861ad73043cb34efcf80a42991868, “Split Raqam feature work across three people.” origin/main resolves to the same revision. Origin is https://github.com/AmazingDude/raqam.git.
- The working tree was already dirty. Before this task, status showed:
  - Staged: BUILD_PLAN.md and part of handoff.md.
  - Staged and unstaged: handoff.md.
  - Untracked: docs/REPO_COMPARISON.md, docs/SKILL_INSTALLATION.json, docs/SKILL_SETUP.md, docs/TEAM_SPLIT.md, docs/ai/.
- Those files and their staged/unstaged states are prior work. Preserve them; do not stage the entire repo, stash/drop, reset, clean or bundle unrelated files.
- This task adds only docs/ai/baseline.md, docs/ai/contracts.md, docs/ai/examples.md and updates docs/ai/handoff.md.

## Observed project shape

The checkout contains planning, requirements and reference documentation. A search for project manifests, source, tests, deployment config and schemas found no app source, tests, Supabase migrations, GitHub workflows, package manifest, lockfile, TypeScript config, test runner config, Playwright config or project OpenAPI spec. An openapi.md match exists only in an archived skill reference. There is no app scaffold.

Host tools observed: Node v24.13.1; npm 11.8.0; pnpm 11.25.0 (Codex fallback path); Yarn unavailable; Bun 1.3.14; Python 3.12.3; Git 2.43.0. Tool availability does not choose a project package manager or runtime. No package scripts, app build/lint/typecheck commands, import alias, route convention or CI checks exist to record. A selects and pins the app toolchain at bootstrap.

The existing .gitignore excludes normal build output, local env/credentials and selected prior-candidate/organizer files. It deliberately retains the frontend references. No ignore, build or cloud config change is needed for this documentation task.

## Ownership and actual shared requirements

TEAM_TASKS.md and TEAM_WORKFLOW.md assign A the shared schemas/contracts, package/lockfile/root config, migrations, API routes, auth, persistence, exact calculations and integration. B owns pages, client/components, browser tests and demo. C owns the AI module, its tests and docs after A records the real layout. All source paths remain proposed; no app paths exist yet.

The PRD is the accepted product contract:

- CSV establishes cash movements; receipts support transactions and never add a second cash movement.
- Exact money, explicit currency, owner-scoped private sources, separate original/corrected values, and distinct review states.
- AI proposes extraction, categories and matches; users approve; code supplies authoritative totals.
- Section 7 identifies Workspace, Import/source, Transaction, Document, Proposal, Match and Review decision. Domain states are proposed, accepted, rejected and needs_review.
- F07 defines exactly four scoped, read-only tools: list_transactions, get_cash_summary, get_review_queue and get_record_evidence. Authenticated context supplies workspace scope. The assistant loop is bounded to three model/tool rounds.

There are no executable or separately adopted A/B schemas in this checkout. Field shapes, route names, amount serialization, enum spellings, source-locator encoding, tool pagination, fact registry and persistence/cache interface in contracts.md are proposals for A/B review, not existing team agreements.

## Checks and remaining baseline blockers

**10 October follow-up:** fetched and inspected A's `origin/codex/raqam-backend` at `4b1782cdc5bb1e236accc04512edbadeee5e4e47`. It now has a Next.js app, npm lockfile, Groq SDK 1.6.0/Zod 4.6.5/TypeScript 5.9.3, Node >=22.18.0, server-only, canonical contract v0.1 and native SDK runtime tests. Earlier observations of absent app/packages describe this C checkout, not current A work. This inspection does not merge the baseline or rerun A's reported tests. Local C proof uses Node v24.13.1 built-ins; SDK installation is no longer an A blocker. See contracts.md section10 for actual imports, resolved money/field shapes and outstanding BA-00 seam decisions. No app build/typecheck was run in this manifest-free C checkout.

Read-only checks: Git status/log/remotes/revision, file inventory, targeted requirement/ownership searches, command availability and tool versions. No credentials or env file were read. No packages installed. No application tests/build/lint/typecheck can run because no app scaffold or commands exist. This is a snapshot; re-inspect before implementation as teammates may add code.
