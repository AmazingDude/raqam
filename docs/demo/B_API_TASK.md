# B-API-01 — Live bookkeeping UI

Status: in_review. Owner: Track B, 10 October 2026. Implemented; A review and the configured signed-in combined browser journey remain pending.

Continue the approved DESIGN.md and B-UI-01 implementation on codex/raqam-frontend. Consume the published Track A contracts for stored CSV preview/confirmation/resolution, reviewed description/category edits and history, whole-workspace summary and export.

Owned files: src/lib/client/**, src/components/workspace/**, tests/e2e/** and docs/demo/**. Append verification to handoff.md. Synchronize published backend prerequisites without changing their contracts, migrations, dependencies or API behavior. Preserve both sides of the handoff merge. The original AI checkout and its staged/unstaged work stay untouched.

Acceptance: explicit row decisions and confirmation, stable resolution retry IDs, original values retained, unknown amounts excluded, stale edit recovery with drafts preserved, server-provided full-workspace totals clearly separate from table filters, scoped CSV download with error recovery, and session-bound abort/unmount behavior. Keep pending OCR/proposal/assistant integrations visible. Verify strict types, build, financial/security suite, client contract/error scenarios and browser responsive/keyboard behavior. Synthetic API checks must be labeled; do not claim a deployed/live product gate from mocks.

Verification: final strict types/production build; 37/37 financial/security tests; 4/4 client contract/error tests; 14/14 synthetic browser groups and 360/768/1280 screenshot inspection; 3/3 UI routes and 9/9 unconfigured signed-out private GET denials; fixture route 404. See tests/e2e/FRONTEND_CHECKS.md for command evidence and live limitations. No new dependency, hosted migration, account change, main integration or deployment.
