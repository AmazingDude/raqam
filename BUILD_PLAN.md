# Raqam build plan and task board

**Planning date:** 9 October 2026. This is a proposed execution schedule, not a claim that the team has started coding or committed to the listed working hours. Core requirements live in [PRD.md](PRD.md).

## Time anchors

- Mandatory Saturday on-site module: 09:00-14:00 PKT; development session 09:00-13:30.
- Saturday-night submission; **23:59 is provisional**, supplied by the user as probable. Verify at briefing and replace it here.
- Sunday demo: 09:42-09:47, SEECS CR-01.
- Plan to submit by **22:00 Saturday only if the official cutoff permits it**, leaving a buffer against the probable 23:59 cutoff. If the organizer sets an earlier time, move every freeze and submission checkpoint earlier.
- Named roster and actual availability are unconfirmed. Assign A/B/C and optional D before building. With fewer available hours, discuss the smallest acceptable scope with the user; do not assume stretch will fit.

## Phase gates

| Phase | Proposed time, PKT | Demonstrable outcome | Gate before proceeding |
| --- | --- | --- | --- |
| P0: Scope/setup readiness | Before Saturday build; <=30 minutes | Scope, named owners, repo and provider access checklist | Actual cutoff recorded when announced; required account provisioning assigned |
| P1: Authenticated spine + AI feasibility | Sat 09:00-10:30 | Sign in, store/reload one transaction and private source; live OCR on a new receipt | Two-user isolation works; Groq vision returns usable fields; early deployment reachable |
| P2: Bookkeeping workflow | 10:30-13:30 | CSV preview/import -> OCR review -> category review -> persisted cashbook and exact totals | A clean packet and an uncertain packet work through the integrated UI |
| P3: Reconciliation + grounded agent | 14:30-16:30 | Review semantic matches, ask supported questions, export | Full core journey works on deployed app; no silent errors or double allocations |
| P4: Evaluation and fixes | 16:30-19:00 | Reserved evaluation, failure/isolation tests, fixes and final measurements | All release gates pass; limitations recorded; required artifacts drafted |
| P5: Optional stretch | Earliest 19:00; <=45 minutes | At most one independently testable enhancement | Gate below is open; otherwise continue core fixes/presentation |
| P6: Release/demo/submission | 20:00-22:00 target | Pin release, browser smoke, final deck, links and submission | Correct release accessible and demo rehearsed; submit before confirmed cutoff |
| P7: Presentation readiness | Sun before 09:42 | Laptop, login, data, network, request quota and recording ready | Be at SEECS CR-01 early; app loaded before slot |

Breaks/travel and remaining official activities are outside these estimates. Reflow the schedule to actual attendance and availability; the afternoon times are proposals, not organizer instructions.

**If P1 is still failing at 10:30:** stop UI expansion and resolve access/OCR/isolation. **If a full core path is absent at 16:30:** close stretch, prioritize integration and state the concrete scope risk. Do not continue independent feature development hoping integration will happen at submission time.

## Task board

Roles: A platform/integrator, B bookkeeping UI, C AI workflow, D evaluation/demo. Assign names in `TEAM_WORKFLOW.md`. Pairing is expected; each completed task includes UI/API/state and verification relevant to that behavior.

| ID | Task | Blocked by | Suggested lead | Status |
| --- | --- | --- | --- | --- |
| RQ-00 | Record owners, cutoff and environment readiness | None | A + team | todo |
| RQ-01 | Bootstrap and deploy authenticated persisted workspace | RQ-00 setup readiness; cutoff may remain pending | A, B | todo |
| RQ-02 | Prove live Groq OCR on 3 fresh English images | RQ-00 setup readiness; cutoff may remain pending | C | todo |
| RQ-03 | Independently label dev/evaluation cases | None; follow confirmed PRD | D or B + A | todo |
| RQ-04 | Import/review CSV into persisted cashbook | RQ-01 | A, B | todo |
| RQ-05 | Upload/OCR/review a private supporting document | RQ-01, RQ-02 | C, B | todo |
| RQ-06 | Propose/review categories; display exact cash summaries | RQ-04 | C, A, B | todo |
| RQ-07 | Propose/review one-to-one reconciliation | RQ-04, RQ-05 | C, A, B | todo |
| RQ-08 | Answer grounded questions through scoped tools | RQ-06, RQ-07 | C, A | todo |
| RQ-09 | Export/reopen the reviewed cashbook | RQ-06, RQ-07 | B, A | todo |
| RQ-10 | Run reserved evaluation and release checks | RQ-03, RQ-05 through RQ-09 | D + team | todo |
| RQ-11 | Prepare deck, demo script and attribution | Can draft now; results require RQ-10 | D or B + team | todo |
| RQ-12 | Pin release, verify links and submit | RQ-10, RQ-11 | A + presenter | todo |

### RQ-00 - Readiness and contracts

- [ ] Assign registered builders and a single integrator; record actual availability.
- [x] Record repository URL/initial branch: `https://github.com/AmazingDude/raqam.git`, local branch `main`. Remote publication remains pending; see handoff.
- [ ] Provision Clerk, Supabase, Groq and hosting; verify credentials privately. No secrets in docs.
- [ ] Record exact deadline and briefing model/artifact changes when announced. Pending cutoff confirmation does not block setup or core implementation; it does block stretch and final submission scheduling.
- [ ] Agree transaction/document/proposal/review/source-reference contracts and testing boundaries.
- [ ] Select supported package versions and one package manager; agree file/module ownership.

### RQ-01 - Authenticated persisted spine

- [ ] Clerk login works locally and on an early deployment.
- [ ] Configure Clerk session middleware/proxy for the pinned Next.js version; app/API/required Clerk paths work and sign-in has no redirect loop. Keep database/AI work outside middleware.
- [ ] Protected server pages, routes and actions verify the session at data access; Supabase clients obtain the current Clerk token through `accessToken`. Server clients are request-scoped. Follow PRD section 8; do not add a separate Supabase Auth refresh flow.
- [ ] Owner can save and reload one record in Supabase and view one private source image.
- [ ] Native third-party-auth integration and ownership policies work with two test users.
- [ ] Existing API routes, database mutations and private source retrieval reject unauthenticated/cross-owner access. Test tool/export isolation as those endpoints are added and again in RQ-10.
- [ ] Check direct API access without a valid session, expired sessions, sign-out and account switching; saved records stay isolated and session recovery is visible.
- [ ] Auth/cloud failure is visible, not replaced by a fake success screen.

### RQ-02 - OCR feasibility

- [ ] Test 3 fresh English printed JPEG/PNG receipts through the proposed runtime model: clean, changed layout, unreadable required field.
- [ ] Schema validation, preserved unknowns and original-source reference work.
- [ ] Record actual model ID, access, account limits, latency and extraction errors.
- [ ] Demonstrate bounded handling of a provider error; agree supported image caps.
- [ ] Stop and surface a concrete blocker if live vision access cannot be established. OCR remains core unless the user changes the decision.

### RQ-03 - Independent fixtures

- [ ] Six development packets and twelve reserved packets prepared and labeled as synthetic.
- [ ] Another builder checks expected amounts, matches, categories and ambiguous outcomes.
- [ ] Reserve one unseen image layout; include equal amounts, repeats and missing fields.
- [ ] Gold answers remain outside app/model context; do not use ShiftProof cases.

### RQ-04 through RQ-09 - Complete core slices

- [ ] RQ-04: F02 import validation, preview, repeat detection and persistence demonstrated.
- [ ] RQ-05: F03 actual upload/OCR/correction works and never creates duplicate cash movement.
- [ ] RQ-06: F04/F06 categories are reviewable, corrections survive reruns, totals are exact and cash/profit labels are correct.
- [ ] RQ-07: F05 confirmation, rejection, ambiguity and concurrent double-allocation prevention work.
- [ ] RQ-08: F07 tool-backed answers, valid evidence, unavailable-data handling and bounded loop work.
- [ ] RQ-09: F08 CSV values/statuses agree with UI; reload/account switch preserves and isolates records.

### RQ-10 - Release gate

- [ ] All PRD core features and deterministic financial checks pass on the candidate release.
- [ ] Two-user database, Storage, API, tool and export isolation checks pass.
- [ ] Middleware route coverage, direct unauthenticated API access and expired/signed-out sessions pass on the deployed release.
- [ ] Live reserved OCR/category/match evaluation completed with denominators and corrections recorded.
- [ ] Six assistant questions have exact numeric answers/correct references or appropriate abstentions.
- [ ] Timeout/429/malformed-output/retry/re-import failures preserve existing data.
- [ ] Full browser journey passes twice on the deployment and demo laptop.
- [ ] Actual measured results and limitations recorded; no customer or accountant validation claimed.

**Evidence record per gate:** release revision, model/prompt version, command or manual procedure, dataset version, counts/results, known limitations, checker and timestamp. Until recorded, a gate is not passed.

### RQ-11/RQ-12 - Presentation and submission

- [ ] Five-minute script follows PRD section 11; presenter and backup operator assigned.
- [ ] Deck includes problem, AI workflow, live prototype, measured results, limits and team contributions.
- [ ] Record actual external code/models/data/templates/skills and licenses used.
- [ ] Release revision pinned; repo/deployment/deck represent that same release.
- [ ] Judge access instructions work without exposing API keys or a teammate's personal password. Verify the chosen login route on a fresh browser.
- [ ] Deployed link, repository access, PPTX and organizer fields checked; submit before actual cutoff.
- [ ] Honest recorded demo and saved example ready; saved/replayed outputs clearly labeled.
- [ ] Sunday laptop/network/login/Groq quota checked before arriving early at SEECS CR-01.

## Stretch gate

Every answer must be yes:

- [ ] RQ-01 through RQ-10 pass, with evidence.
- [ ] Required submission artifacts exist and the deployment is accessible.
- [ ] Exact cutoff is confirmed; >=4 hours remain before it.
- [ ] No unresolved critical money, access, persistence or workflow bug exists.
- [ ] Team selects one stretch, its owner, acceptance test and <=45-minute timebox.

If any answer is no, stretch stays closed. Core **OCR, Clerk and Supabase are not stretch features**. Use PRD section 10 for the ordered stretch list.

## Current progress

- [x] Product name and bookkeeping direction clarified.
- [x] Core cashbook, OCR, persona/language/currency, Clerk/Supabase and Groq choice clarified.
- [x] Event documents independently checked; probable cutoff distinguished from confirmation.
- [x] PRD, phased task board, shared-repo workflow, skills shortlist and handoff drafted.
- [ ] Actual app implementation started.
- [ ] Any product test or deployment completed.

Do not mark implementation tasks done because these planning documents exist.
