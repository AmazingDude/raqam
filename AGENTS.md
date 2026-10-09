# Raqam working instructions

## Read first

1. `handoff.md` for the current state and immediate next action.
2. `PRD.md` for confirmed scope and unresolved decisions.
3. `BUILD_PLAN.md` for the active task and its dependencies.
4. `TEAM_WORKFLOW.md` before editing shared files or integrating work.
5. `docs/raqam/GLOSSARY.md` for Raqam terminology.

## Scope and decisions

- Raqam is the current project: bookkeeping is primary, reconciliation is supporting.
- The earlier ShiftProof plans, root `GLOSSARY.md` and `data/shiftproof/` describe a different candidate. Preserve them; do not implement them as Raqam requirements.
- The PRD marks proposals and unanswered questions explicitly. Do not silently turn them into accepted requirements. Ask the user about material product choices.
- The user authorized planning documents and publishing the relevant Raqam files to `https://github.com/AmazingDude/raqam.git`. Application implementation, dependency installation, external issue publication and deployment have not been requested in this planning task.
- Do not add stretch features until the release gate in `BUILD_PLAN.md` is met and the feature is selected by the team.

## Shared repo

- Claim one task and name its files/modules before changing code. Work on an individual branch or worktree once Git is configured.
- One integrator owns shared contracts, dependency files, migrations and merges. Coordinate changes to these files first.
- Do not discard another person's changes or overwrite concurrent edits. Inspect the current state before patching.
- Review and test completed behavior before merging. A model reporting success is not test evidence.
- Keep secrets and private financial records out of commits, logs and examples.

## Financial behavior

- AI proposes extraction, categories and matches; numerical totals come from validated code.
- User-reviewed records and AI suggestions must remain distinguishable.
- Never convert an unknown amount to zero or invent a counterparty, category, date or source reference.
- Missing documents and unmatched records are review needs, not proof of fraud or nonpayment.
- An invoice, receipt or customer message does not by itself prove a bank transaction settled.
- Test ambiguous and correct cases as well as discrepancies. Keep evaluation answers out of model/application context.
- Report measured results with denominators; label synthetic data and any simulated/replayed results honestly.

## Handoff discipline

After a completed task or a change in scope, update that task's status and append a short entry to `handoff.md`: changes, verification, known issues and next action. Do not claim unrun checks passed.
