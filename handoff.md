# Raqam handoff

**Last updated:** 10 October 2026, PKT. User/A's platform/backend foundation is locally validated; live account gates remain pending.

## Current state

- Product name confirmed: **Raqam**.
- Active assignments: **user = Person 1/A platform/backend/integrator, Person 2/B product UI/demo, Person 3/C AI workflow**. User authorized role-A implementation with validation at each step. A's branch is now `codex/raqam-backend` (renamed from `codex/platform`); B/C modules remain reserved. Names/availability for B/C and their contract acknowledgement remain pending.
- Team: **edge runners**; domain: **Financial Operations**.
- User clarified that Raqam is a **bookkeeping/accounting app inspired by Fortune**, with reconciliation included. The agreed hackathon core is a reviewed cashbook, rather than full double-entry financial statements.
- Confirmed persona/language/currency: **small service business, English, PKR**. Local-shop and multilingual workflows are later work.
- **OCR is core**: the user first suggested deferring it, then explicitly reversed that choice. The latest clarification controls.
- **Clerk login and Supabase database/private source storage are core**: the user explicitly selected these from the start after clarification. Do not substitute a local-only app or demo access code.
- Runtime AI: **Groq free tier**. Stack choice delegated; plan selects **Next.js + TypeScript** and native Clerk/Supabase third-party auth. Model IDs and account access must be verified at bootstrap.
- User requested Supabase middleware if it fits. Plan includes **Clerk session middleware + token-aware Supabase clients + resource authorization and row/file policies** within existing F01/RQ-01/P1. Clerk remains the sole session provider; Supabase Auth's separate SSR refresh flow is not needed for this design. See PRD section 8 for verified sources and version-dependent filenames.
- User requested a well-built PRD, phased goals, tested core before stretch goals, a relevant skills shortlist and this repository handoff. Ask about material uncertainties instead of assuming.
- Platform shell and shared contracts/financial helpers are implemented locally. **22/22 automated tests, strict typecheck and production build pass**; local HTTP smoke checks missing-configuration failure for all five private API requests. Embedded Postgres claims/Storage schemas are simulated. No live Clerk/Supabase/Groq validation, complete product browser journey, real transactions, deployment or customer validation has occurred. See `docs/raqam/VALIDATION.md`.
- Role-A foundation `fb466cb` and publication record `dd35cbc` are preserved on `origin/codex/raqam-backend`. Both old/new remote names were verified at the same full SHA before removing `codex/platform`. Main has not been merged. Hackathon workflow uses direct pushes to owned branches, with A reviewing/testing and pushing integrated slices to main; PRs are optional.
- Local Git is initialized on `main` with `origin` configured as `https://github.com/AmazingDude/raqam.git`. The three-person assignment update is published as `7a432a4`, preserving baseline `a1b9907` and rules/reference commit `be333ef`. Push succeeded and `git ls-remote` confirmed the full remote main SHA matched local HEAD on 10 October. Git metadata/network operations required narrowly scoped elevated access after the sandbox denied `.git/FETCH_HEAD` writes.

## Read these artifacts

- [PRD](PRD.md): product requirements and decision register. Proposed details are not accepted by default.
- [Build plan](BUILD_PLAN.md): milestone gates and task tracking.
- [Team workflow](TEAM_WORKFLOW.md): owner boundaries and integration process.
- [Individual tasks](TEAM_TASKS.md): three-person feature split, first deliverables and module ownership.
- [Contracts](docs/raqam/CONTRACTS.md), [setup](docs/raqam/SETUP.md) and [validation](docs/raqam/VALIDATION.md): implemented boundaries, account instructions and measured local evidence.
- [Skills](docs/SKILLS.md): relevant skills, dependencies and portability notes.
- [Vocabulary](docs/raqam/GLOSSARY.md): current Raqam terms.

## Time constraints

- User reported local time approximately **23:26 on Friday 9 October** and believes submission is **Saturday 10 October at 23:59 PKT**. Treat 23:59 as a planning assumption supplied by the user, not an organizer-confirmed cutoff.
- The PDFs confirm Saturday-night submission; exact clock time is announced at the briefing.
- Mandatory on-site Saturday module 09:00-14:00; development session 09:00-13:30.
- Allocated presentation: **Sunday 11 October 09:42-09:47 PKT, SEECS CR-01**.
- Exact available working hours and registered builder count remain unanswered; the user requested an active three-person work split on 10 October.

## Remaining setup facts

1. Organizer-confirmed submission cutoff; probable 23:59 is not confirmed.
2. Exact registered roster, named task owners and actual availability; active plan assigns three people with evaluation/demo distributed among them.
3. Git publication of the assignment update is complete. Hosting account remains unconfirmed.
4. User reported creating the Supabase project. Prepared the ignored `.env.local` with all required fields and provider instructions, preserving existing values. Clerk integration, credentials, database policies and live access remain unverified. Groq/model access belongs to C and remains untested.

Core scope questions were answered. Do not repeat them unless the user changes direction. Handle remaining setup facts through RQ-00 and the organizer briefing; record the answers when available.

## Immediate next action

Provision Clerk/Supabase, configure `.env.local` privately and apply the reviewed spine migration to the new Raqam project. Then verify real two-user identity/row/file/API isolation, save/reload and private source access before marking RQ-01 done. Fill B/C names and coordinate `docs/raqam/CONTRACTS.md`. C proves live OCR in their lane; A then completes atomic import/audited reviews. No stretch before the existing gate.

## Suggested skills

- `grill-with-docs`, with both `grilling` and `domain-modeling` dependencies: settle material scope and vocabulary.
- `tdd`: during implementation, for agreed financial-behavior interfaces; read its complete supporting references first.
- `code-review`: review an actual diff against the PRD and repo standards once Git/code exist.
- `playwright`: verify the real browser workflow when a running app exists.
- `handoff`: maintain continuity; the user's explicit instruction is to keep this file in the repo, overriding that skill's default temporary-directory destination.

These external skills have been researched, not installed. See `docs/SKILLS.md` for verified source links and setup caveats.

## Preserved previous work

`HACKATHON_IDEA_DECISION_BRIEF.md`, `SHIFT_PROOF_BUILD_PLAN.md`, root `GLOSSARY.md`, `scripts/generate_shiftproof_fixtures.py` and `data/shiftproof/` concern a previous candidate. They remain untouched in the original local workspace and are excluded from the Raqam Git repository. Their datasets do not validate Raqam.

The two large organizer PDFs are also excluded from Git; share originals separately. Their inspected page references remain in the PRD.

## Verification and environment

- Both event PDFs were directly inspected with the installed Python 3.12 `pypdf` runtime.
- PDF page references and judging requirements are recorded in the PRD/build plan; no criterion weights are invented.
- Next.js 16.4.0, React/DOM 19.2.8, Clerk 7.9.13, Supabase JS 2.117.3, Zod 4.6.5 and TypeScript 5.9.3 are pinned with npm's lockfile. Local Node is 25.9.0. Build/typecheck/runtime dependency audit passed; account compatibility still needs live checks.
- Current primary documentation for Groq vision/structured outputs/tool calling/rate limits and native Clerk/Supabase integration was inspected; links and caveats are in PRD section 8.
- Default `python` points to MSYS Python without PDF packages. PDF-capable Python: `C:/Users/Rehan/AppData/Local/Programs/Python/Python312/python.exe`.

## Session log

- 10 October: frontend publication verified. Committed B's slice as `b71c78c`, merged current main's C-planning commit `f95ddfc` without conflicts, and published `codex/raqam-frontend`. `git ls-remote` confirmed the initial remote tip exactly matched local merge `e801866`; the working tree was clean. C's six planning documents/session entries and A's foundation are preserved. No main push, PR or deployment was performed. Final touch-target build and post-sync HTTP smoke passed; application modules did not change during the documentation sync. Next: A reviews/integrates the branch and connects its remaining APIs; B-UI-01 remains in_review for that handoff.

- 10 October: B-UI-01 implemented and moved to `in_review` on `codex/raqam-frontend`. Added approved `DESIGN.md`, Jinna-like neutral landing, cashbook/import/document/category/match/assistant screens, evidence/edit/export dialogs, synthetic memory-only demo, existing-API client adapters and real Clerk workspace gate. Minimal root page wiring changed; A/C modules, dependencies and secrets preserved. Validation: strict typecheck, final production build, 22/22 existing tests, 18/18 documented synthetic browser scenarios, 360/768/1280 screenshot review, 7 contrast pairs and HTTP smoke (3 UI routes + 3 private GET denials). Fixed search/header spacing and explicit dialog focus wrapping. Downloaded example CSV verified. No live provider/persistence/account isolation, deployed journey or real AI measured. Next: A reviews this slice, updates the legacy root smoke expectation and integrates pending import/document/review/summary/assistant/export APIs using `docs/demo/FRONTEND_HANDOFF.md`. Local preview remains at localhost:3000; explicit IPv4-only binding failed with current middleware and was restored without platform edits.

- 10 October: user handed track A to another person and moved this chat to B/frontend. Claimed B-UI-01 on `codex/raqam-frontend` from `796ce4f`: `DESIGN.md`, `src/components/**`, `src/lib/client/**`, `src/app/(workspace)/**`, `tests/e2e/**`, `docs/demo/**` and minimal landing entry wiring in `src/app/page.tsx`. Approved app + landing plan with Jinna-like neutral colors. Backend/contracts/configuration remain A-owned; no core feature or live gate is marked done by this claim. Next: implement and validate the UI and clearly labeled development example.

- 10 October: completed BRANCH-RENAME/WORKFLOW task across Git branch refs and current branch/workflow documents. Renamed A's branch to `codex/raqam-backend`, published it, verified its SHA equaled the old remote tip, then removed the old remote name. Preserved the pending .env.local-preparation handoff entry; .env.local remains ignored. Adopted optional PRs with small owned-branch pushes and one integrator pushing tested integrations to main. Verification: branch SHA preservation, Markdown/whitespace checks; no application changes or repeated product tests. Next action remains private Clerk/Supabase setup and real two-user spine checks.
- 10 October: prepared `.env.local` for the user's new Supabase project, adding provider guidance and preserving all existing values; all required field names were already present. Verified Git ignores the file and opened it for editing. No credentials were printed or committed; no live provider checks run. Next action: fill Supabase/Clerk fields privately, enable their native integration and validate the persisted spine.
- 10 October: committed the validated platform slice as `fb466cb`, pushed `codex/platform` and verified the remote full SHA matched local HEAD. Working tree was clean; main was not merged. No PR, deployment or live provider operations performed. Next action remains Clerk/Supabase setup and real two-user spine verification.
- 10 October: completed role-A local foundation on `codex/platform` after researching complementary skills and applying retained API/TypeScript/Next/security guidance. Changed shared contracts, financial helpers, root platform/sign-in shell, middleware, private APIs, spine/RLS migration, tests, dependency/configuration files and readiness documents. Verified 22/22 tests, strict typecheck, production build, runtime dependency audit (0 reported vulnerabilities) and local HTTP fail-closed smoke (5/5 private requests). SQL claims/Storage are simulated; no live accounts, AI, deployment or complete product flow tested. Authorized cleanup removed other-project caches/compiler output and seven confirmed dist builds; source/reference files preserved. Known issues: providers unprovisioned, B/C acknowledgement/names and exact cutoff pending; import/review/match/tool integrations unfinished. Next action: follow SETUP.md and validate real two-user persisted spine. RQ-00/RQ-01 remain in_progress; downstream feature tasks are not marked done from helper tests.
- 10 October: publication completed. Rebased the five-file task-split commit onto `be333ef` without conflicts, pushed `7a432a4` to `origin/main`, and verified GitHub's main SHA exactly matched local HEAD. Git whitespace checks passed; working tree was clean after the push. No product tests or deployment performed. Known issues: names/availability, exact cutoff and provider access remain pending. Next action: distribute TEAM_TASKS.md and fill in owners before implementation readiness work.
- 10 October: user requested publication to main. Inspected the five assignment files, fetched remote main and identified the newer rules/reference commit to preserve. Prepared only the Raqam planning update for commit; prior no-commit/no-remote status above corrected from Git evidence. No application checks apply to this documentation-only change. Publication verification is recorded after pushing.
- 10 October: completed planning task TEAM-SPLIT across `TEAM_TASKS.md`, `TEAM_WORKFLOW.md`, `BUILD_PLAN.md`, `PRD.md` and `handoff.md`. Assigned three exclusive lanes (platform/backend, product UI/demo, AI) and distributed independent evaluation without a fourth-person dependency; added integration order and a two-person-start rule. Checked scope/dependency consistency, local links and Git whitespace. Known issues: names/availability/provider access and Git publication remain pending. Next action: distribute assignments, then agree contracts in RQ-00 when implementation is requested. No application code, product tests or deployment performed.
- 9 October: inspected workspace, verified event constraints and researched the linked grilling workflow and useful implementation skills.
- 9 October: user confirmed reviewed cashbook, small service business/English/PKR, OCR core, Clerk/Supabase core and Groq free tier; delegated stack choice.
- 9 October: created PRD, phased task board with release/stretch gates, shared-repo workflow, skills shortlist, agent instructions and context glossary. No application implementation, product test, deployment, Git initialization or skill installation performed.
- 9 October: checked local Markdown links/encoding and independently audited event/scope consistency. Corrected setup dependencies so an unannounced cutoff does not block building; staged export-access checks when export exists. Product checks remain unrun.
- 9 October: checked official Clerk middleware and Supabase third-party/SSR docs; added session middleware, token propagation and access tests to the PRD/build plan and platform ownership. Documentation only; application middleware and product tests remain unimplemented.
- 9 October: user supplied the GitHub remote and authorized pushing relevant files. Initialized `main`, selected only Raqam planning/team documents, and added ignores for secrets, build artifacts, previous-candidate research and large organizer PDFs. Git required a narrowly scoped `safe.directory` override because the folder belongs to Administrators; used the command-local override without changing global settings. Remote configuration and staging then failed with permission denied for `.git/config` and `.git/index.lock`. GitHub connectivity separately failed through the environment proxy. No commit or push occurred. Finish setup from the user's normal terminal; no application implementation or product tests performed.

- 10 October (Person C planning): user selected C/AI ownership and reported approximately 15–17 hours; all four core AI features retained. Saved the detailed [Person C plan](docs/ai/PERSON_C_PLAN.md) and [Person C handoff](docs/ai/handoff.md), covering contract proposals for A/B, OCR/categories/matches/grounded assistant, evaluation and demo behavior. Planning checks completed; no application implementation, live model requests, dependency installation, deployment or publication. Shared schemas/team plans remain unchanged. Next for C: agree C-00 contracts and prove C-01 live feasibility when implementation is requested.
- 10 October (Person C coding runbook): added [20 numbered implementation steps](docs/ai/IMPLEMENTATION_STEPS.md), linked from C's plan/handoff. Each step defines prerequisites, C-owned files, coding instructions, A/B dependencies, acceptance evidence and PRD cross-checks; repository hygiene/cloud readiness are explicit. Preparation checks completed; all implementation steps remain todo. No application/dependency/infrastructure changes or publication/deployment. Next: request steps 1–2 for baseline/contract agreement.
- 10 October (Person C steps 1–2): inspected the real Raqam checkout and documented baseline/tool availability in `docs/ai/baseline.md`; drafted PRD-aligned shared contract proposals and synthetic examples in `docs/ai/contracts.md` and `docs/ai/examples.md`. Updated the C handoff. Step 1 inspection complete; step 2 is in review because no app scaffold/shared executable schemas or A/B adoption evidence exist yet. Read-only/documentation checks only; no app tests/build, live AI, integration or deployment. Next: A confirms canonical exports/decisions and B confirms the response states/screens they can render.
- 10 October (Person C review corrections): fixed cached extraction payload shape and added the proposed A configuration handoff in `docs/ai/contracts.md` section 8. C handoff records the fixes; contract adoption remains in review. Documentation JSON/shape/link/whitespace checks only; no app code/dependencies/configuration or deployment changes.
