# Person C step 1 — observed repository baseline

**Inspected:** 10 October 2026, PKT. **Status:** baseline inspection complete.  
**Repository:** /home/home/Documents/work/Projects/Hackathon/raqam

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

Read-only checks: Git status/log/remotes/revision, file inventory, targeted requirement/ownership searches, command availability and tool versions. No credentials or env file were read. No packages installed. No application tests/build/lint/typecheck can run because no app scaffold or commands exist. This is a snapshot; re-inspect before implementation as teammates may add code.

