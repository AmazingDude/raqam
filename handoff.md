# Raqam handoff

**Last updated:** 10 October 2026, PKT. Three-person work split documented; implementation not started.

## Current state

- Product name confirmed: **Raqam**.
- Active assignments: **Person 1 platform/backend/integrator, Person 2 product UI/demo, Person 3 AI workflow**. See `TEAM_TASKS.md` for individual tasks and exclusive file ownership. Evaluation is distributed across these three; no fourth-person dependency. Names and availability remain pending.
- Team: **edge runners**; domain: **Financial Operations**.
- User clarified that Raqam is a **bookkeeping/accounting app inspired by Fortune**, with reconciliation included. The agreed hackathon core is a reviewed cashbook, rather than full double-entry financial statements.
- Confirmed persona/language/currency: **small service business, English, PKR**. Local-shop and multilingual workflows are later work.
- **OCR is core**: the user first suggested deferring it, then explicitly reversed that choice. The latest clarification controls.
- **Clerk login and Supabase database/private source storage are core**: the user explicitly selected these from the start after clarification. Do not substitute a local-only app or demo access code.
- Runtime AI: **Groq free tier**. Stack choice delegated; plan selects **Next.js + TypeScript** and native Clerk/Supabase third-party auth. Model IDs and account access must be verified at bootstrap.
- User requested Supabase middleware if it fits. Plan includes **Clerk session middleware + token-aware Supabase clients + resource authorization and row/file policies** within existing F01/RQ-01/P1. Clerk remains the sole session provider; Supabase Auth's separate SSR refresh flow is not needed for this design. See PRD section 8 for verified sources and version-dependent filenames.
- User requested a well-built PRD, phased goals, tested core before stretch goals, a relevant skills shortlist and this repository handoff. Ask about material uncertainties instead of assuming.
- No application code has been built. No product tests, live transactions, deployment or customer validation have occurred.
- Local Git is initialized on `main` with `origin` configured as `https://github.com/AmazingDude/raqam.git`. Baseline planning commit `a1b9907` is published; remote `main` also contains `be333ef` (reviewed rules and retained references). On 10 October, fetching succeeded with narrowly scoped elevated Git access after the sandbox denied `.git/FETCH_HEAD` writes. The three-person assignment update is prepared for publication on top of that remote history; verify its delivery using the remote revision.

## Read these artifacts

- [PRD](PRD.md): product requirements and decision register. Proposed details are not accepted by default.
- [Build plan](BUILD_PLAN.md): milestone gates and task tracking.
- [Team workflow](TEAM_WORKFLOW.md): owner boundaries and integration process.
- [Individual tasks](TEAM_TASKS.md): three-person feature split, first deliverables and module ownership.
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
3. Publish the prepared three-person assignment update to the configured `origin/main` and verify the remote revision. Hosting account remains unconfirmed.
4. Clerk/Supabase/Groq accounts, credentials and model access have not been tested. Do not write keys into these documents.

Core scope questions were answered. Do not repeat them unless the user changes direction. Handle remaining setup facts through RQ-00 and the organizer briefing; record the answers when available.

## Immediate next action

Use `TEAM_TASKS.md` to distribute the three assignments and fill in names/availability. When the user requests implementation, start RQ-00 in `BUILD_PLAN.md`, agree contracts/file paths, then build the authenticated persisted spine and prove live OCR in parallel. Read the PRD first. Do not bootstrap an alternative product or add stretch features before the gate.

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
- Node/npm/npx exist locally. No app framework or package manifest exists yet.
- Current primary documentation for Groq vision/structured outputs/tool calling/rate limits and native Clerk/Supabase integration was inspected; links and caveats are in PRD section 8.
- Default `python` points to MSYS Python without PDF packages. PDF-capable Python: `C:/Users/Rehan/AppData/Local/Programs/Python/Python312/python.exe`.

## Session log

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

- 10 October (Person C step 3): verified current official Groq capability/model docs and recorded a bounded live-probe matrix in `docs/ai/feasibility.md`. Qwen 3.8 27B is listed for vision/JSON-object/tool capabilities but as preview; GPT OSS 20B is listed for strict structured output. Tool calling and Structured Outputs remain separate modes. Live step 3 is blocked: no A-approved runtime/runner, `.env.local` Groq key empty, process key absent; zero provider requests. No app/dependency changes or mocks. Next: A approves runner/runtime and enables secure account/limit check, then C performs probes.
- 10 October (Person C two-contributor split): user authorized division of original steps 4–20 and publishing a separate C collaboration branch. Added `docs/ai/TWO_PERSON_EXECUTION.md` and separate C1/C2 handoffs. C1 owns provider/OCR/categories and C-branch publication; C2 owns matching/tools/assistant plus evaluation harness/report. A/B ownership, original steps and acceptance gates are unchanged; step 3 live proof remains blocked. No application/dependency/deployment changes.
