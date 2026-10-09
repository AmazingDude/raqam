# Skills for building Raqam quickly

**Research date:** 9 October 2026. Sources below were inspected. External skills are **shortlisted, not installed** in this workspace. This is a small selection, not a recommendation to install an entire marketplace during the event.

## Use first

| Skill | Where it saves time | When to use | Source |
| --- | --- | --- | --- |
| `grill-with-docs` | Resolves material product decisions and leaves a vocabulary trail | Now, while deciding core bookkeeping scope | [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md) |
| `grilling` | Asks only decisions whose prerequisites are settled | Dependency of the interview | [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md) |
| `domain-modeling` | Prevents teammates using different meanings for cashbook, match and confirmed record | Dependency of the interview; whenever domain language changes | [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md) |
| `tdd` | Catches financial logic failures early through behavior tests | Money normalization, repeat imports, review decisions, summaries and export | [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md) |
| `playwright` | Finds failures that unit tests miss in the actual upload/review/export flow | First integrated slice and deployed release verification | [SKILL.md](https://github.com/openai/skills/blob/main/skills/.curated/playwright/SKILL.md) |
| `code-review` | Checks both correctness against the PRD and maintainability | Before integrating completed behavior and at release freeze | [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md) |
| `handoff` | Keeps a fresh teammate or coding session from restarting decisions | End of a task/session or change of owner | [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md) |

`grill-with-docs` delegates to both `grilling` and `domain-modeling`; installing the wrapper alone is insufficient. The linked user guide explains this dependency: [grill-with-docs guide](https://github.com/mattpocock/skills/blob/main/docs/engineering/grill-with-docs.md).

## How to keep the skills lightweight

- One teammate owns clarification; all teammates consume the same PRD. Do not run separate interviews that produce competing scope decisions.
- Use `tdd` for behavior whose failure changes the books, not for cosmetic UI details. Read its supporting `tests.md` and `mocking.md` before applying it. Agree the public testing boundaries first.
- Use `playwright` to exercise the existing UI; its CLI workflow is not a replacement for a repeatable financial-logic test suite. Node/npm/npx exist on this machine; teammates verify their own setup.
- `code-review` needs an actual Git comparison point and a spec source. Use the branch base and `PRD.md`; report checks actually run. The upstream skill uses separate review agents. Read its complete instructions when invoking it.
- The upstream `handoff` defaults to a temporary directory. **The user explicitly requested a repo `handoff.md`, so Raqam uses that destination instead.** Refer to the PRD/task files rather than duplicating them in the handoff.
- Installed skills are not evidence that tests ran or that a build is complete.

## Optional only if useful

| Skill | Use condition | Source |
| --- | --- | --- |
| `to-tickets` | The team wants separate tracker tickets instead of `BUILD_PLAN.md`; configure the tracker first | [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md) |
| `to-spec` | A future change needs a synthesized spec after clarification; not needed to duplicate this PRD | [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md) |
| `vercel-deploy` | Vercel is selected and the team requests deployment; preview deployment is its default | [SKILL.md](https://github.com/openai/skills/blob/main/skills/.curated/vercel-deploy/SKILL.md) |

Do not add a paid integration or switch the project to a different hosting platform solely to use a skill. Do not trigger ticket publication, commits, deployment or broad agent orchestration merely by reading a skill.

## Setup for a shared repository

1. Read the source `SKILL.md` and supporting files; check prerequisites and licensing before installation.
2. Each teammate installs the selected source folders using their coding tool's skill installer. Prefer a shared, pinned source revision so behavior does not drift between teammates.
3. `grill-with-docs` requires the two dependency folders as well. Preserve relative supporting files for any copied skill.
4. Record the chosen source revision and installation method below. A teammate who cannot install a skill can still follow the repository's explicit PRD and task acceptance criteria.
5. Do not commit personal absolute paths, tokens or user settings. Do not vendor the whole skills repository into Raqam.

| Source | Revision used by team | Installed where | Status |
| --- | --- | --- | --- |
| `mattpocock/skills` | Not pinned yet | Not installed | Sources reviewed |
| `openai/skills` curated `playwright` | Not pinned yet | Not installed | Source reviewed |
| Deployment skill | Select only after host decision | Not installed | Optional |

Skills and supporting code have their own licenses. Record actual installed/copied resources in the submission attribution list.

## Suggested teammate prompts

**Task start:** "Read AGENTS.md, handoff.md, PRD.md and BUILD_PLAN.md. Work only on task RQ-XX. State its dependencies and acceptance criteria. Inspect current files before editing; coordinate shared-contract changes with the integrator."

**Testing:** "Verify the observable behavior for RQ-XX using independently specified expected values. Include correct records, ambiguity, failure and repeat-operation cases. Report what the checks do and do not establish."

**Review:** "Review the branch diff against RQ-XX and PRD.md. Identify missing behavior, financial errors and scope expansion. Cite the requirement and changed code. Do not report unrun tests as passed."

**Handoff:** "Update the task status and handoff.md with changed files, checks actually run, unresolved issues and the next action. Keep secrets and personal financial data out."
