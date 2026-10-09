# Raqam

Raqam is edge runners' AI bookkeeping app for AICON'26 Financial Operations. The agreed core is a reviewed cashbook with OCR, category/match suggestions, evidence-backed questions, Clerk login and Supabase cloud persistence. The first user is a small service business using English and PKR.

**Current stage:** role-A platform/backend foundation on `codex/platform`. Local financial/security checks and the Next.js production shell are available; real Clerk/Supabase provisioning, the complete product journey, live AI evaluation and deployment remain pending.

## Start here

- [PRD](PRD.md): confirmed product choices, core scope, acceptance criteria, evaluation and remaining setup facts.
- [Build plan](BUILD_PLAN.md): phases, task owners, dependencies, release gates and stretch-feature rules.
- [Team workflow](TEAM_WORKFLOW.md): shared-repository coordination and integration rules.
- [Three-person assignments](TEAM_TASKS.md): user/A backend, B product UI/demo and C AI workflow.
- [Shared contracts](docs/raqam/CONTRACTS.md), [setup](docs/raqam/SETUP.md) and [validation](docs/raqam/VALIDATION.md): current interfaces, account provisioning and measured local checks.
- [Skills shortlist](docs/SKILLS.md): reviewed skills and when they are useful.
- [Handoff](handoff.md): current state, unresolved decisions and what the next person should do.
- [Raqam vocabulary](docs/raqam/GLOSSARY.md): current domain terminology.
- [Rules review](docs/RULES_REVIEW.md): retained Spec Kit, LangChain, backend and frontend guidance, with conflicts and limits.
- [Complete frontend bundle](docs/references/frontend/frontend-skills.zip): preserved ZIP; source files and nested archive also retained under `docs/references/frontend/`.

Earlier ShiftProof research is retained only in the original local workspace and excluded from this repository. It is not Raqam scope or evaluation data.

## Event anchors

- Day 2, 10 October 2026: mandatory on-site module 09:00-14:00; development session 09:00-13:30.
- Submission: Saturday night, 10 October. Team currently expects **23:59 PKT**, but this is **unconfirmed** until the organizer's announcement.
- Presentation: **11 October 2026, 09:42-09:47 PKT, SEECS CR-01**, per the team's allocation email.
- Required submission artifacts: accessible repository, deployed app and demo presentation (PPTX), plus any subsequently requested organizer fields.

## Team repository

Remote: [AmazingDude/raqam](https://github.com/AmazingDude/raqam), branch `main`. Read the PRD, build plan and team workflow first, then assign named owners before implementation. See the handoff for the latest repository sync status.

The original organizer PDFs (`BUILD WITH AI - Participant Guide.pdf` and `BUILD WITH AI - RuleBook.pdf`, approximately 138 MB combined) are excluded from Git. Share them separately with teammates; the PRD records their relevant PDF page references.
