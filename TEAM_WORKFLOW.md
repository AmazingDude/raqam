# Raqam team workflow

The active work split uses **three people**, as requested on 10 October. Names, registered roster and availability remain to confirm. Local Git is initialized on `main`; the intended remote is `https://github.com/AmazingDude/raqam.git`. See handoff for publication status. Use [TEAM_TASKS.md](TEAM_TASKS.md) for individual assignments and file ownership.

## Ownership

**Current assignment, 10 October:** the user is A, the platform/backend integrator, working on `codex/raqam-backend`, as reaffirmed in the current root `AGENTS.md` and `handoff.md`. An earlier frontend-track assignment is superseded. B owns the bookkeeping UI and independent browser journey; C owns the AI workflow and live model evaluation. B/C names and availability remain pending.

The user now requested **two agents within backend A**. [BACKEND_TASKS.md](BACKEND_TASKS.md) is the active backend ownership/dependency map: A1 (this agent) owns schema/contracts/reviews/platform gates/integration on `codex/raqam-backend`; A2 (teammate's agent) owns dedicated document/proposal/assistant services on `codex/raqam-backend-services`. Use separate clones/worktrees. A2's new route/test paths are explicitly delegated; the sole-editor rule still applies to shared migrations/contracts/dependencies. B/C assignments remain intact.

| Role | Responsibility | Coordination boundary |
| --- | --- | --- |
| A: Integrator/platform | Bootstrap, Clerk session middleware, token-aware Supabase clients/ownership policies, shared data contract, financial calculations, merges, deployment | Sole editor of package manifests/lockfile, shared schemas, migrations and infrastructure unless work is handed off |
| B: Bookkeeping UI | Import preview, records table, corrections, category review, summaries and source viewer | Consumes the agreed contracts; requests changes before editing them |
| C: AI workflow | Groq adapter, extraction, category/match proposals, evidence-backed assistant | Returns schema-validated proposals; does not directly approve or post books |

Person 1 = A, Person 2 = B, Person 3 = C. A1 coordinates A2's backend contributions, evaluation fixtures, financial/security checks and release integration; B independently checks fixture answers, runs the browser journey and owns the deck/demo script; C records live AI measurements and provider failure checks. A/B check C's AI results. Agent assignments do not confirm the event participant roster. Do not leave evaluation and presentation until the final hour.

## One shared contract before parallel implementation

Agree the minimum transaction, document, proposal, review-decision and source-reference shapes in a short contract task. Include amount representation, date interpretation and allowed states. Integrator owns changes. Frontend and AI teammates can then work against shared synthetic examples without inventing incompatible shapes.

Work should land as small demonstrable slices, not three independently completed applications. The first slice includes sign-in, a persisted owner-scoped record and a private source. In parallel, prove actual Groq OCR. Later slices add cashbook, AI and review behavior to that path.

## Hackathon Git process: direct pushes, optional PRs

For the current three-person hackathon, PRs are optional. Each person pushes small commits to their owned branch. A reviews the diff/check evidence, integrates completed slices sequentially and pushes the tested result to `main` directly. B/C do not independently push overlapping work to `main`. Review can be a quick paired diff check; record the checker and result in the task/handoff rather than requiring a PR ceremony. Existing repository branch rules still apply; this workflow does not change them.

1. Create or connect the intended team repository and record its URL. Do not publish private research or personal records accidentally.
2. Integrator creates the first working baseline and records its revision. Each person uses a separate clone, branch or worktree.
3. Claim one unblocked task with owner, status and expected files. Suggested branch naming: `codex/rq-XX-short-description`.
4. Keep changes local to that task. Coordinate dependency, schema, migration and global styling changes with their owner.
5. Before integration, sync with the current base and resolve conflicts while preserving other contributors' behavior.
6. Review against the task's acceptance criteria and run the applicable checks. Include verification evidence in the task/handoff entry; a PR is optional when useful for a larger change.
7. Integrator merges completed slices sequentially, performs a short combined-flow check and pushes the tested result to main directly. Record failures immediately.
8. At release freeze, pin the exact demo/submission revision. Use that revision for evaluation, deployment and the deck's reported results.

Do not use force pushes, destructive resets or broad file replacement to resolve ordinary integration conflicts.

## Task status

Use `todo`, `in_progress`, `in_review`, `blocked` and `done`. A task is `done` only when its acceptance criteria and required verification pass. A branch existing or an AI tool producing output does not count as done.

Update only your task row and append a short handoff entry. Integrator owns the summary and next-action sections of `handoff.md` to avoid concurrent rewrites. Coordinate any scope changes in `PRD.md` before implementing them.

A2 records progress in `docs/raqam/worklogs/A2.md`; A1 updates the shared backend task table. Coordinate A2's required root handoff append after syncing and while A1 is not editing that file. Both agents must not simultaneously edit shared planning files. A2 returns its tested branch/commits for A1's sequential integration; PRs remain optional.

## Groq free-tier coordination

The user selected Groq's free tier for the app runtime. One owner manages the integration and account-level request budget. Do not let every teammate run bulk evaluations against the same account simultaneously.

- Keep the API key server-side and out of commits, screenshots and browser bundles.
- Verify active model access and account limits before choosing model IDs.
- Queue extraction requests and handle rate-limit responses without an unbounded retry loop.
- Cache completed extraction by source content and prompt/model version; repeated tests should not needlessly consume the same requests.
- Keep live evaluation separate from tests using mocked provider failure responses. Both are useful, but they establish different things.
- Reserve enough actual request capacity for the demo. Do not promise rate-limit-free service from a free-tier prototype.

## Daily checkpoints

- Start: active tasks, owners, blockers, contract changes and time remaining.
- First integrated slice: run it together on the demo laptop.
- Midday: stop adding breadth if upload-to-reviewed-record behavior is still incomplete.
- Feature freeze: no stretch work while core acceptance remains unmet.
- Submission: verify repository access, deployment, instructions, presentation and the exact release revision.
- Sunday: arrive early and load the known working demo before 09:42.
