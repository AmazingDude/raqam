# Role A local validation, 10 October 2026 (PKT)

Checker: Codex, working for user/A on `codex/platform`. Revision: the platform-foundation commit carrying this record. Model/prompt version: none; no runtime AI was invoked. Inputs are synthetic test literals and a local embedded PostgreSQL fixture, not reserved live evaluation packets or customer data.

## Completed local slice

Shared types/runtime schemas; exact PKR parsing; CSV preview with original fields/errors; deterministic cash/category summaries; safe CSV export; Next.js/Clerk/Supabase platform shell; owner-derived workspace creation/read; paginated cashbook read; private source upload/retrieval; schema/RLS migration and bigint-text invoker view. Source upload does not create document extraction or cash movement. Product workspace UI and AI modules remain B/C work.

| Check | Procedure | Result | What it establishes / limit |
| --- | --- | --- | --- |
| Automated financial/security tests | `npm test` | **22/22 passed** | Exact amounts/totals, malformed/ambiguous inputs, repeated source identity, CSV formula protection, strict model/owner arguments, body/origin/upload guards; includes one embedded Postgres scenario |
| Type checking | `npm run typecheck` | Passed | Next route generation and strict TypeScript compilation; does not establish runtime vendor behavior |
| Production build | `npm run build` | Passed | Next.js 16.4.0 and installed SDKs compile into the platform routes and proxy |
| Real local HTTP smoke | Start `npm run start -- --hostname 127.0.0.1 --port 3187`; then `npm run smoke:platform` | Passed | Setup page 200, sign-in redirects to setup, health reports setup_required, security headers; all **5/5 private API requests** return 503 with null data and no-store while credentials are absent |
| Runtime dependency audit | `npm audit --omit=dev --audit-level=high` | 0 reported vulnerabilities | Registry audit for runtime dependencies at this check, not a code/security certification |
| Environment readiness | `npm run check:env` | Expected failure: 5 required names missing | No `.env.local` or verified accounts yet; checker prints names only |
| Repository hygiene | `git diff --check`, ignore checks/local links | Passed | `.env.local`, node_modules, .next and TypeScript build cache excluded; no credentials/private records in this slice |

The embedded PostgreSQL scenario switches between two simulated owners and anonymous/missing-claim access. It checks scoped row visibility, cross-owner insert/update/delete denial, same-workspace source foreign keys, duplicate files/rows, legitimate equal-value rows, private object ownership and exact amounts beyond JavaScript's safe-integer range. The migration executes in real embedded PostgreSQL, but Supabase schemas and JWT claims are simulated. This is not managed Supabase/Clerk/Storage HTTP verification, nor a multi-client concurrency test.

## Failures resolved during the slice

- The normal Node test runner's child-process isolation hit sandbox `spawn EPERM`; the package uses `--test-isolation=none` with independent synthetic fixtures.
- Next's environment typings initially made an empty configuration test fail TypeScript. The pure configuration boundary now accepts a string/undefined environment map. Tests/typecheck/build pass after the fix.
- Skill-installer catalog access timed out; direct upstream source pages and existing retained guidance were used. No external skill was globally installed.
- C: initially had about 160 MiB free. Authorized cache/compiler/build cleanup and later increased available space enabled dependency installation and builds. Cleanup did not delete project sources/reference archives.

## Open gates and next action

RQ-00 and RQ-01 remain **in_progress**. The user confirmed providers are not yet provisioned and asked for setup steps; follow [SETUP.md](SETUP.md), add credentials privately to ignored `.env.local`, and apply the reviewed migration to the new Raqam Supabase project. Restart development, or rebuild production, after configuring public keys.

Then verify real sign-in, session expiry, two-user row/file/API isolation, save/reload and private image access. Deployment, live Groq OCR, the browser product journey and reserved evaluation remain unrun. B/C names/contract acknowledgement and the organizer-confirmed cutoff remain pending.

Atomic CSV confirmation, audited transaction/document/category review, match constraints, scoped assistant execution and exposed summary/export endpoints still need implementation. The tested pure helpers do not complete RQ-04/RQ-06/RQ-09. Unreadable-image handling belongs to the OCR/review slice; signature checks alone do not prove an image is decodable.
