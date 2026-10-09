# Raqam: three-person task split

**Updated:** 10 October 2026, PKT. Planning assignment complete; implementation tasks remain `todo`. Person numbers are placeholders for names. This plan does not establish the registered roster or authorize implementation/deployment in this planning session.

## Ownership at a glance

| Person | Main work | Exclusive file/module ownership once bootstrapped |
| --- | --- | --- |
| 1 (A): Platform/backend + integrator | Clerk, Supabase, imports, persistence, exact totals, export, API authorization and integration | `src/lib/contracts/**`, `src/lib/server/**`, `src/app/api/**`, `supabase/**`, `tests/backend/**`, `tests/security/**`, `tests/evaluation/**`; root configuration, package manifest/lockfile, `.env.example`, middleware/proxy, root layout/global CSS |
| 2 (B): Product UI + demo | Import preview, cashbook, receipt review, category/match review, summaries, assistant UI and export controls | `src/app/(workspace)/**`, `src/components/**`, `src/lib/client/**`, `tests/e2e/**`, `docs/demo/**` |
| 3 (C): AI engine | Groq integration, OCR, category proposals, match proposals, grounded assistant and AI measurements | `src/lib/ai/**`, `tests/ai/**`, `docs/ai/**` |

These are proposed paths for the selected Next.js app, not existing application files. A records the actual layout at bootstrap before parallel edits. Page files belong to B; API route files belong to A; AI implementations called by those routes belong to C. Colocate each owner's module tests in their assigned test directory. Nobody edits another person's files without an explicit handoff.

## Person 1: platform, backend and integration

1. **Readiness/contracts (RQ-00):** record names/availability, provider provisioning and deadline confirmation; publish the shared transaction/document/proposal/review/tool/error shapes and synthetic development examples. Agree exact money representation, states and client API calls with B/C before they wire integrations.
2. **Authenticated spine (RQ-01):** bootstrap the app, own dependencies/configuration, Clerk middleware and request-scoped Supabase clients, tables/migrations and row/private-file policies. Save/reload one transaction and private image; prove two-user isolation. Own early deployment when implementation/release is requested.
3. **Cashbook backend (RQ-04/RQ-06):** CSV parsing/validation, preview and confirmation endpoints, original rows, content-hash duplicate detection, review history, exact cash/category totals and record queries. Invalid amounts remain unresolved. Totals come from code.
4. **Review and AI endpoints (RQ-05/RQ-07/RQ-08):** source upload/retrieval, proposal persistence, reviewed document/category updates and one-to-one match approval. Enforce allocation uniqueness atomically. Wrap C's modules with session/workspace checks; supply the four PRD read-only assistant tools through scoped backend functions.
5. **Export/release (RQ-09/RQ-10/RQ-12):** safely encoded CSV, reload/account-switch verification, deterministic/security tests, sequential merges and release evidence. Own final link/revision checks and submission coordination when requested.
6. **Independent evaluation (RQ-03):** prepare six development and twelve reserved synthetic packets with expected answers; B independently checks them. Keep reserved answers/generators out of the application and model context.

**First deliverable:** agreed contracts and an authenticated save/reload/private-source path with isolation evidence. Do not wait for all backend endpoints before handing over working slices.

## Person 2: screens, review flows and presentation

1. **UI foundation (RQ-01):** workspace navigation, loading/error/empty states and client service wrappers against A's contracts. Coordinate root layout/global styles with A; own feature components and scoped styles.
2. **Import/cashbook (RQ-04):** CSV template download/upload, valid/invalid row preview and counts, correction/confirmation controls, transaction table and reviewed-description/category editing.
3. **Document review (RQ-05):** receipt upload controls, private source viewer beside extracted fields, correction/unresolved states and bounded retry controls. OCR must not create cash transactions.
4. **Bookkeeping/reconciliation (RQ-06/RQ-07):** category proposals with accept/change/reject actions, exact backend-provided cash summaries, coverage/remainder counts and match candidate review with ambiguity visible.
5. **Assistant/export (RQ-08/RQ-09):** question panel, tool/action trail and clickable evidence, recoverable errors, export controls and reopening the cashbook.
6. **QA/demo (RQ-03/RQ-10/RQ-11):** independently check A's fixture labels; run the full deployed browser journey twice, including account switching. Draft the five-minute script/deck early; add measured results and actual contributions after evaluation.

**First deliverable:** import preview and cashbook screens consuming the shared development examples. Temporary mocks must be labeled and replaced by real endpoints before acceptance; they do not prove persistence or live AI.

## Person 3: AI processing and grounded answers

1. **Live OCR proof (RQ-02):** verify actual Groq vision access on three fresh English printed receipt images, including an unreadable required field. Record model/prompt version, latency, errors and account limits; coordinate supported image limits with A/B.
2. **OCR pipeline (RQ-05):** server-only provider adapter, extraction schema validation, preserved missing fields, bounded retries/429 handling and versioned cache identity. A owns private storage/cache persistence; C defines extraction/cache behavior and returns proposals to A's route wrapper.
3. **Categories (RQ-06):** implement the PRD category guide, transaction-linked suggestions and reasons, with abstention for ambiguity. Return proposals; A persists them and preserves user decisions.
4. **Matching (RQ-07):** propose one-to-one candidates from amount/date/reference/semantic evidence; expose multiple candidates and unsupported relationships. A owns confirmation/uniqueness; C never approves matches.
5. **Assistant (RQ-08):** bounded read-only tool-calling loop using A's four scoped tools, validated arguments, deterministic numeric results and accessible evidence references. Return a concise action trail and recoverable failures.
6. **AI evaluation (RQ-10):** provider-failure tests and live measurements on frozen prompts/models. A/B control reserved inputs and score against independent answers; C records denominators, abstentions, corrections and latency. Manage the shared Groq request budget and reserve demo capacity.

**First deliverable:** real OCR output with validated fields and an explicit unresolved result. Prove vision access while A prepares the authenticated spine.

## Integration order and conflict rules

1. A freezes the first contract and file map with B/C. Only then wire the feature code; B can sketch UI and C can prove provider access while setup is pending.
2. A establishes the baseline revision; each person uses a separate clone/branch. Suggested branches: `codex/platform`, `codex/bookkeeping-ui`, `codex/ai-workflows`. The remote is configured and the planning baseline is published; check handoff and remote main for the assignment update's publication status.
3. Integrate small slices in order: auth/save/private source + OCR proof; CSV cashbook; receipt review; categories/summaries; matches; assistant/export. Follow the dependencies and gates in [BUILD_PLAN.md](BUILD_PLAN.md).
4. A alone changes shared contracts, root configuration, dependencies, migrations, middleware, API routes and global styles. B/C request a change and continue work in their own modules; do not independently redefine types or API responses.
5. Each slice includes its owner's relevant checks and a review by another person. A runs a combined-flow check after each merge. Evaluation/deck drafting run alongside features, not at the end.
6. Claim one task before edits and list files in its handoff entry. Contributors append their own entries; A owns summary/status coordination in shared planning documents. New features remain behind the existing stretch gate.

When only two people are working initially, keep A and B in their lanes. Reserve C's AI modules for the third person; A/B use agreed development examples for interface work and keep live AI tasks pending. Core AI still requires C's completed work before release. A time-critical OCR proof may be explicitly handed to A and then returned to C, with the handoff recorded before either edits the same files.

## Planning task record

**TEAM-SPLIT — done:** three-person assignments and ownership boundaries documented. Files: `TEAM_TASKS.md`, `TEAM_WORKFLOW.md`, `BUILD_PLAN.md`, `PRD.md`, `handoff.md`. Verification: consistency with PRD core scope and task dependencies, relative link targets and Git whitespace check. No application behavior, tests or deployment completed.
