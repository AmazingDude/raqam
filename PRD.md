# Raqam - Product Requirements Document

**Version:** 0.1, 9 October 2026  
**Team:** edge runners  
**Domain:** Financial Operations, AICON'26 Build With AI  
**Status:** core product choices confirmed. Receipt and category routes/review controls, selectable-text statement import and the bounded assistant are implemented in the integrated codebase. Automated verification passes. The user's read-only hosted checks confirm migration 008's permissions and the expected 009/010 functions, safeguards and grants. Live OCR/category inference, the complete signed-in browser journey and deployment remain unverified. See [BUILD_PLAN.md](BUILD_PLAN.md) and [handoff.md](handoff.md) for the current checkpoint.

## 1. Product decision

**Raqam is an AI bookkeeping assistant for a small service business. It turns imported transactions and receipt images into a reviewed cashbook, supports reconciliation, and answers questions with evidence from the business's records.**

Bookkeeping is the primary workflow. Reconciliation supports it. The hackathon version is a cashbook with reviewed categories and cash summaries, rather than a complete double-entry accounting system.

The user explicitly selected:

- Small service business; English; PKR.
- Reviewed cashbook as core; P&L, balance sheet, tax, forecasting and bank feeds beyond core.
- **OCR in the core**, following a later clarification that supersedes the earlier suggestion to defer it.
- **Clerk login and Supabase persistence/storage in the core**, rather than a local-only workspace.
- Groq free tier for runtime AI; stack selection delegated to the implementation recommendation.
- A tested core before any stretch feature starts.

## 2. Problem and user

**Primary user:** an owner/operator of a small service business who organizes transactions and receipts without a dedicated finance team. This persona is selected for the MVP, not validated through customer interviews.

Transactions arrive with inconsistent descriptions, supporting receipts live separately, and categorization requires repetitive review. A chat-only summary does not produce a dependable set of books.

**Job:** "Help me organize my cash transactions, attach the right evidence, resolve uncertain entries, and understand the recorded cash activity."

**Value hypothesis:** AI-assisted preparation reduces manual transcription and sorting while a review step keeps uncertain results visible. Customer demand, willingness to pay and real time savings remain unvalidated.

## 3. Hackathon requirements and time boundaries

| Requirement | Raqam response |
| --- | --- |
| Problem -> input -> meaningful AI -> output -> impact | Disorganized cash records -> CSV, Excel, text-based PDF statements and receipt images -> extraction, categorization, semantic matching and tool-backed questions -> reviewed cashbook -> measured prototype correctness and review effort |
| AI Integration Depth | AI participates in preparing records and investigating questions; code supplies financial totals and evidence lookup |
| Problem-Solving Quality | Complete import-to-review-to-export workflow with explicit uncertainty |
| Demo & Presentation | One small business, a few receipts, one correction, one unresolved case and a live grounded question |
| Creativity & SDG Impact | Explainable review and accessible bookkeeping; potential alignment with SDG 8.3 through small-business capability, without claiming proven formalization or jobs created |
| Industrial Impact | Specific owner workflow and exportable result; show measured correctness/latency, not invented adoption or savings |

The five criteria are listed in RuleBook PDF p.15. No numerical criterion weights are specified. The 85%/15% allocation on p.16 concerns judges, not feature scoring.

- Mandatory Day 2 module: **10 October 09:00-14:00 PKT**; development session 09:00-13:30 (Guide PDF p.6).
- Submission: **Saturday night, 10 October** (Guide PDF pp.5,14). User's current expectation is **23:59 PKT**, still **unconfirmed**; RuleBook PDF p.13 says the exact deadline is announced at the briefing.
- Presentation: **11 October 09:42-09:47 PKT, SEECS CR-01**, confirmed by the team's allocation email.
- Required: accessible repository, deployed link, demo presentation/PPTX and subsequently requested organizer fields (RuleBook PDF p.13; Guide PDF p.14).
- Main development must occur during the official period; disclose significant external resources and actual team contributions (RuleBook PDF pp.7-10,24).

See [BUILD_PLAN.md](BUILD_PLAN.md) for proposed calendar milestones. Confirm the cutoff at briefing and immediately reflow the plan if it is earlier. The Sunday presentation is not the submission deadline.

## 4. Core boundaries

One owner account has one business workspace for the MVP. Different signed-in owners have isolated workspaces. Shared organization membership and accountant collaboration are deferred until after the hackathon.

Engineering size targets: up to **50,000 transactions and 10 receipt images per workspace**, processed in small batches; a **20-transaction, 3-image** demo. The PDF/cashbook bounds were expanded at the user's request on 10 October for long bank statements; they are application guards, not vendor limits or measured hosting capacity. Validate them during the first technical gate and document any agreed adjustment.

| Core | Beyond core |
| --- | --- |
| Clerk sign-in; cloud records and private source images in Supabase | Organizations, roles, invitations, subscription billing |
| CSV/TSV, Excel `.xls`/`.xlsx` and selectable-text PDF statement imports with preview, common bank-column mapping and row errors | Scanned/image-only bank statements, universal parsing of unknown schemas, live bank connections |
| English printed receipt/invoice images, JPEG/PNG, OCR and correction | Handwriting, Urdu/Roman Urdu, multi-page PDF and layout guarantees |
| AI category proposals; reviewed transaction records | Automatic accounting treatment, tax categories, unattended posting |
| One-to-one transaction/document matching with review | Split payments, many-to-many allocations, FX, refunds/netting workflows |
| Cash-in/cash-out/net movement and reviewed-category summaries | P&L, balance sheet, double-entry journal, tax filing, forecasting |
| Bounded assistant using record/summary tools and references | Arbitrary web research, autonomous financial actions or general financial advice |
| CSV cashbook export and persistent review history | Invoice creation, collections, payments or card issuance |

Unsupported inputs must be identified, not silently forced into a simpler supported case. No application feature initiates, approves, retries or blocks a real payment.

## 5. User journey

1. Sign in and open the owner's business workspace; load a labeled synthetic example or import the user's authorized sample.
2. Upload a supported CSV, Excel workbook or selectable-text PDF statement; preview direction/date/amount interpretation, correct or reject invalid rows, and confirm import.
3. Upload receipt images. OCR returns proposed fields with the original image visible. Confirm/correct required fields or mark the document unresolved.
4. Run bookkeeping preparation. Review category and match proposals; accept, change or reject them.
5. View the cashbook, cash movement summary, reviewed-category breakdown and unresolved-record queue.
6. Ask a supported question. The assistant uses scoped tools and returns evidence references, counts and uncertainty.
7. Export the cashbook; sign out/in or reload and verify records and review decisions persist.

## 6. Core features and acceptance criteria

Every feature below is required for the agreed core. Completion is measured by observable behavior, not by presence of a screen.

### F01 - Identity, cloud workspace and private sources

- Clerk sign-in/sign-out works on the deployed URL and the demo laptop.
- Session middleware covers app/API requests; protected server pages, routes and actions verify identity where data is accessed. Sign-in remains reachable without redirect loops.
- Supabase persists transactions, source metadata, extracted fields, proposals and review decisions. Original images are in a private bucket.
- Ownership comes from the verified session; client-supplied owner IDs do not grant access.
- Database policies and Storage policies deny cross-owner access. Verify read, insert, update, delete, export and source-file access with two distinct test users.
- Reopening the app restores the same confirmed records. No data from the previous signed-in user remains visible after account switch.
- Direct API requests without a valid session fail; expired sessions recover through Clerk or require sign-in without exposing saved records.

### F02 - Transaction import and cashbook foundation

- Provide a downloadable CSV template with `date`, `description`, `direction` (`in`/`out`), `amount` and optional `reference`; also accept CSV/TSV, Excel `.xls`/`.xlsx`, and selectable-text PDF account statements with recognizable date/description/amount-direction or debit/credit columns. PDF statements allow up to 20 MiB, 1,000 pages and 20,000 transaction rows; CSV/Excel retain their 50-row guard; scanned/image-only PDFs are identified and require OCR outside this import flow. Import PKR only; map common date and amount notation into a preview, keep ambiguous or foreign-currency values unresolved, and require formula-based imported cells to be saved as values first.
- Preserve the original file and row references. Preview valid rows, invalid rows and counts before confirmation; never silently drop a row.
- Validate amount, direction, date and currency. Unknown/unparseable amounts stay unresolved, never zero.
- Confirmed valid rows create transaction records; corrections retain original source values and the user's decision.
- Re-importing the same file is detected and does not duplicate transactions. Equal-valued distinct rows are not automatically treated as duplicates.
- Allow editing a transaction's reviewed description/category with a persisted decision trail. Manual transaction creation is stretch unless needed as an explicit recovery action selected by the team.

### F03 - Receipt image OCR and field review

- Accept JPEG/PNG within validated app/host size limits. Reject unsupported or unreadable inputs with a clear recovery action.
- Extract merchant/counterparty, document date, total, currency if present and reference if present. Preserve missing values and uncertainty.
- Show the source image beside editable proposed fields. Required uncertain financial fields prevent the document being marked reviewed.
- OCR by itself never creates a second cash transaction. Imported bank transaction files, including supported text-based PDF statements, are the cash-movement source; receipts support those records.
- Identical image re-upload does not create duplicate supporting evidence or repeat completed OCR unnecessarily.
- Provider error, malformed output, timeout or rate limit leaves the source and existing books intact. Retrying is bounded and idempotent.

### F04 - AI-assisted categorization

- Suggest one category from a small explicit cashbook category guide, with a brief reason and source transaction ID.
- Initial guide: customer receipts, software/services, premises/utilities, travel, other operating cash activity, transfers/owner movements and uncategorized. These are review labels, not a validated chart of accounts or tax treatment.
- Ambiguous descriptions return `needs_review` or `uncategorized`; a model's confidence is not permission to post.
- User accepts or corrects each proposal; a deliberate batch acceptance is allowed only after the proposals are visible.
- Preserve accepted decisions when the AI is rerun. A changed proposal must not silently replace a user's category.

### F05 - Supporting reconciliation

- AI proposes matches using amount, date, reference and semantic counterparty/description evidence.
- Amount alone or a similar name alone cannot establish a confirmed match. Multiple plausible candidates produce a review request.
- User confirms, rejects or changes a proposed match. A document and transaction can each have at most one active match in the core.
- Server validation prevents a document being allocated twice, including concurrent approval attempts.
- Differences in currency/amount or unsupported split-payment cases remain unresolved with a reason. No unexplained tolerance is applied.
- Unmatched records are labeled as needing evidence or a match; never automatically labeled fraud, missing money or nonpayment.

### F06 - Reviewed cash summaries

- Display validated imported cash inflows, cash outflows and net movement separately from category-review and document-match coverage.
- Cash totals include all valid imported transactions once, regardless of category/match status. Show unresolved import rows excluded from totals and their count.
- Reviewed-category totals use only accepted categories and show the uncategorized/unreviewed remainder separately. These components reconcile to the relevant cash totals.
- A receipt never adds cash to the totals. Reclassifying an owner transfer changes category reporting, not the underlying cash movement.
- Use integer minor units or exact decimals; never floating-point arithmetic for money.
- Label net movement as cash movement, not profit. Show opening/closing cash balances only if a confirmed opening balance exists; otherwise omit them.

### F07 - Grounded bookkeeping assistant

- Support scoped record lookup, unresolved-record investigation and cash/category summaries. Example questions: "Which outflows need receipts?", "What did we record under software?", "What remains unreviewed?"
- The model selects from a small allowlist of read-only tools. Application code executes them against the authenticated workspace and validates arguments/results.
- Numerical answers use deterministic tool outputs. Returned record/source references must resolve to accessible evidence.
- Show a concise action trail: tool used, records consulted, calculation result and references. Do not expose or claim private chain-of-thought.
- Pending categories/matches remain described as proposals. Queries cannot approve records or rewrite the cashbook.
- Missing data yields a scoped clarification. Out-of-scope tax/investment/payment requests are not answered as established bookkeeping facts.
- Bound the tool loop, context and provider retries; show a recoverable failure rather than inventing a successful answer.

### F08 - Export and review trail

- Export rows with dates, original descriptions, exact amounts/direction/currency, accepted categories, review status, match status and source references.
- Exported values/counts agree with the current cashbook and summaries. Include unresolved statuses rather than implying everything is reconciled.
- Preserve review decisions with timestamps and previous/current values where applicable. This is a prototype history, not a tamper-proof audit certification.
- Safely encode CSV text that spreadsheet applications might treat as formulas.

## 7. Minimum data and state model

This is a shared-contract specification, not a prescribed implementation file layout.

| Entity | Required information |
| --- | --- |
| Workspace | ID, owner Clerk subject, business name, currency |
| Import/source | ID, owner/workspace, content hash, source type, private storage location, original name, status |
| Transaction | ID, workspace, source row, date, description, direction, exact amount, currency, optional external reference, reviewed category/status |
| Document | ID, workspace, source image, extracted fields, corrected fields, extraction/review status, model/prompt version |
| Proposal | ID, workspace, category or match proposal, referenced records, rationale, status |
| Match | ID, workspace, transaction ID, document ID, accepted decision; unique active allocation |
| Review decision | ID, workspace, actor, target, action, prior/new values, timestamp |

Keep distinct states for `proposed`, `accepted`, `rejected` and `needs_review`. Imported cash records, category review and matching each have separate status; "unmatched" does not mean "not imported". Source values remain distinct from corrected values.

### Assistant tool contract

Agree these four read-only tools in RQ-00; frontend, AI and backend contributors share their shapes.

| Tool | Input | Result |
| --- | --- | --- |
| `list_transactions` | Bounded date/category/review/match filters | Scoped records, exact amounts, IDs and source-row references |
| `get_cash_summary` | Date range and explicit reporting scope | Code-calculated inflows/outflows/net movement, reviewed category totals, unreviewed remainder and contributing record IDs |
| `get_review_queue` | Unreviewed categories, unmatched records or unresolved document fields | Outstanding items, reasons and existing source references |
| `get_record_evidence` | A bounded list of transaction/document IDs | Accessible original fields, corrected fields, review decisions and source locators |

The authenticated session supplies workspace ownership independently of model arguments. Every tool rejects inaccessible IDs. Financial values have an exact canonical representation and an explicit currency. Absence findings reference the supplied dataset scope, not an invented receipt. The assistant cannot invoke approval, category-change, deletion or payment tools.

Recommended loop cap: three model/tool rounds per question, followed by a partial-result or clarification response if unfinished. Treat document text as evidence, never as instructions granting tools or changing ownership.

## 8. Recommended implementation

The user delegated stack choice. Choose **Next.js + TypeScript**, a small component library/Tailwind, Zod validation, **Clerk**, **Supabase Postgres and private Storage**, and the **Groq SDK**. Use one package manager and one lockfile. Pin supported versions at bootstrap; no application dependencies are installed by this document.

- One full-stack app reduces frontend/backend contract and deployment coordination. Use server routes for Groq requests and authenticated operations. [Next.js route handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- Use the current Clerk third-party-auth integration with Supabase, passing Clerk session tokens and defining row/storage access policies. Clerk user subjects are text; do not assume Supabase UUID user identities. Avoid the deprecated JWT-template integration. [Supabase Clerk integration](https://supabase.com/docs/guides/auth/third-party/clerk)
- Prefer user-scoped Supabase access. A service-role key must not be used to bypass ownership checks for ordinary app operations.
- Groq currently documents `qwen/qwen3.8-27b` for vision. Treat it as a candidate requiring an account-level smoke test; do not assume a text model supports images. [Groq vision](https://console.groq.com/docs/vision)
- Candidate text/tool model: `openai/gpt-oss-20b`, subject to access and behavior checks; keep model IDs configurable. Do not assume the development assistant's GPT-6.1 Sol access supplies runtime API credentials.
- Extraction/category calls may use supported structured output; the agent loop uses tool calls separately. Groq currently documents structured-output/tool-use incompatibility, so do not combine those modes without verified support. Schema validity does not establish factual correctness. [Structured outputs](https://console.groq.com/docs/structured-outputs), [local tool calling](https://console.groq.com/docs/tool-use/local-tool-calling)
- Queue OCR calls and budget requests across teammates. Handle 429/retry-after, bounded timeouts and cache invalidation by model/prompt version. Inspect actual account quotas; free tier is not a throughput guarantee. [Groq rate limits](https://console.groq.com/docs/rate-limits)
- Recommended host: a single Next.js-compatible deployment such as Vercel preview, subject to account availability and organizer requirements. Deploy the authenticated spine early to expose configuration issues.

Do not add agent frameworks, vector databases, web browsing or a Python service unless a demonstrated requirement needs them.

### Session middleware and Supabase access

Include this within **F01 / RQ-01 / P1**, owned by the platform integrator; it is required auth plumbing within the existing core schedule.

- Use `clerkMiddleware()` for session integration. Pin versions first: Next.js 16+ uses `proxy.ts`; 15 and earlier use `middleware.ts`. Include API and required Clerk routes in the matcher. Enforce authorization at the server resource, rather than relying on middleware alone. [Clerk middleware reference](https://clerk.com/docs/reference/nextjs/clerk-middleware)
- Create request-scoped server Supabase clients with an `accessToken` callback obtaining the current Clerk token; browser clients use the active Clerk session. Configure native third-party integration in both dashboards. Database and private Storage policies enforce the verified Clerk subject's workspace ownership. [Supabase Clerk integration](https://supabase.com/docs/guides/auth/third-party/clerk)
- Clerk remains the sole login/session provider. Supabase's SSR `updateSession` example refreshes a **Supabase Auth** session. For this Clerk-only design, do not add that separate cookie-refresh flow or a second login. [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)
- Keep financial calculations, database queries and model calls out of middleware. Verify direct unauthenticated API access, session expiry, sign-out, account switching and two-user row/file isolation during P1; repeat against the completed release.

## 9. Validation plan and release gate

Local financial/security tests have started under role A. Counts, commands and limitations are in `docs/raqam/VALIDATION.md` and `handoff.md`; they do not pass the live release gates below. The following are **planned engineering gates**, not official competition thresholds.

### Test layers

1. **Deterministic behavior:** exact amount/date/direction normalization, totals, repeated imports, category updates, uniqueness of accepted matches, export consistency and failure preservation.
2. **Identity/persistence:** middleware route coverage, direct unauthenticated API access, sign-out/invalid/expired sessions, two-user access isolation, private image access, account switching, reload restoration and owner-scoped AI/export operations.
3. **Live AI evaluation:** production OCR/category/match/assistant routes against independently labeled synthetic inputs. Mock provider tests do not establish model accuracy.
4. **Browser/deployment:** sign in -> import -> OCR -> review -> match -> summary -> grounded question -> export -> reload on the real deployment and demo laptop.

### Dataset

- Prepare 6 development packets and **12 reserved evaluation packets**: 4 straightforward/consistent, 4 with discrepancies or unsupported relationships, 4 ambiguous/incomplete.
- Each packet contains a small bank CSV and 1-3 rendered receipt images. Vary merchant descriptions, references, dates, amounts and image layouts; reserve an unseen layout for evaluation.
- Include different legitimate transactions with equal amounts, repeated uploads, unreadable totals, two plausible matches, and a document containing irrelevant instructions.
- Use an explicit category guide for labels. Another builder independently checks expected totals, matches, labels and ambiguity before evaluation.
- Keep gold answers, case labels and generators out of app/model context. Old ShiftProof fixtures are unrelated and cannot count as Raqam evaluation.
- Freeze prompts and model configuration before running reserved cases. If tuning follows a failed evaluation, disclose reuse and reserve additional fresh cases for a final measurement.

### Metrics and minimum release conditions

| Area | Measurement / gate |
| --- | --- |
| Money and export | Exact agreement on every deterministic test and all reviewed evaluation records; zero silent duplicated/dropped cash movements |
| Access/persistence | All planned two-user isolation and persistence checks pass |
| OCR | Report exact normalized critical fields correct/total **before correction**, plus unresolved fields; target >=90% on readable supported fields |
| Categorization | Report correct suggestions/eligible labeled records and abstentions separately; target >=85% on explicit cases; ambiguous cases must remain reviewable |
| Matching | Report precision, recall and candidate coverage separately; targets >=90% precision and >=80% recall on supported labeled matches; zero double allocations |
| Assistant | 6 reserved questions, including an unavailable-data question; all numeric answers exact and all references correct, or a clear abstention rather than unsupported claims |
| Failures | Rate limit, timeout, malformed output and repeat operation preserve existing records and expose a recovery action |
| Demo | Complete live path twice on the release revision; reserve request quota; record actual OCR/full-flow latency and review corrections |

Thresholds are small-sample prototype gates. Show counts and failures alongside percentages. Do not claim bank-grade accuracy, accountant validation or production readiness.

Time a manual review and assisted review of comparable small packets if time permits. Report actual procedure, corrections and limitations; one team exercise is not proof of customer productivity.

## 10. Stretch goals

Start **one** stretch only after every core feature works, the release gates pass, required submission artifacts exist, and at least four hours remain before the **confirmed** cutoff. If the cutoff remains unknown, keep stretch closed. Timebox a stretch to 45 minutes; revert or leave it off if it threatens the tested path.

| Order | Stretch | Dependency / stop condition |
| --- | --- | --- |
| 1 | Learn from user category corrections within the same workspace | Core category history is correct; do not claim trained personalization from a few rules |
| 2 | One-page PDF report of the reviewed cash summary | Export is already correct; rendering and source references must be checked |
| 3 | Single-page PDF input | Image OCR is stable; conversion must use the same reviewed pipeline |
| 4 | Simple invoice generation from explicit confirmed fields | Cashbook remains source of truth; no automatic payment status |
| 5 | Urdu/Roman Urdu or voice input | Separate labeled tests; never claim English evaluation establishes multilingual accuracy |

**After the hackathon:** live bank feeds, double-entry accounting/P&L/balance sheet, forecasting, taxes, many-to-many matching, payments, organization collaboration and shop/inventory workflows. These need separate requirements and validation and are not spare-time promises.

## 11. Five-minute presentation

| Time | Content |
| --- | --- |
| 00:00-00:30 | Owner's bookkeeping problem and Raqam's concrete promise |
| 00:30-01:10 | Signed-in workspace; import a short CSV and upload a new receipt |
| 01:10-02:10 | Live extraction/category proposal; confirm one correction with the source visible |
| 02:10-03:00 | Confirm a semantic match and show an ambiguous case staying unresolved |
| 03:00-03:45 | Cashbook and exact summaries; ask one evidence-backed question |
| 03:45-04:25 | Export/persistence and measured evaluation results with denominators |
| 04:25-05:00 | AI architecture, business impact hypothesis, limitations and team contributions |

Prepare signed-in access before the slot; verify sign-in separately during QA. A saved example can keep explanation moving while a request runs, but label saved output as saved. Keep an honest recorded demonstration available for network failure; do not present replay as live AI.

## 12. Risks and scope-change rules

| Risk | Response |
| --- | --- |
| Clerk/Supabase not provisioned or integration fails | First build gate; use documented native integration and test policies immediately. Do not silently replace cloud/login with a local prototype |
| Groq vision access or OCR reliability insufficient | Test before UI breadth. Narrow supported image conditions transparently; changing OCR out of core requires the user's decision |
| Free-tier throttling | Small sequential batches, cached completed extraction, retry-after handling and shared request budget |
| Too much core for available hours | Raise the concrete blocker early. Simplify layout and accepted input breadth; do not remove user-selected OCR/auth/cloud requirements without agreement |
| Bookkeeping overclaim | Report cash movement and review labels; no P&L, tax, legal or fraud conclusions |
| Conflicting teammate code | Shared contract, named integrator, small branches, frequent integrated checks |
| Attractive UI but weak AI | Demonstrate unfamiliar descriptions, actual OCR, bounded tool execution, evidence and ambiguity handling |

## 13. Decision register

| ID | Decision | State / evidence |
| --- | --- | --- |
| D01 | Name: Raqam; bookkeeping primary, reconciliation supporting | Confirmed by user |
| D02 | Reviewed cashbook; financial statements beyond core | Confirmed by user |
| D03 | Small service business; English; PKR | Confirmed by user |
| D04 | OCR core | Latest user clarification supersedes earlier stretch suggestion |
| D05 | Clerk login + Supabase records/private image storage core | Confirmed by user |
| D06 | Groq free tier runtime; stack choice delegated | Confirmed by user; account/model access not tested |
| D07 | Next.js/TypeScript; native Clerk/Supabase integration | Selected recommendation under delegated stack choice; bootstrap verifies compatibility |
| D08 | Submission likely 10 Oct 23:59 PKT | User expectation; organizer confirmation pending |
| D09 | Active work split: three people; named owners and actual availability | Three-person assignment requested on 10 October; see TEAM_TASKS.md. Exact registered roster/names/availability pending |
| D10 | Repo remote: `https://github.com/AmazingDude/raqam.git`; hosting and environment provisioning | Remote supplied by user; local Git initialized on `main`. Push status in handoff; hosting/provider accounts still unverified |
| D11 | Session middleware with Clerk tokens for Supabase access; resource checks and row/file policies | User requested middleware if suitable; selected within existing F01/RQ-01 under delegated stack choice. No separate Supabase Auth session |
| D12 | User owns A; platform/backend implementation with validation at each step | Confirmed on 10 October. Work on codex/raqam-backend; B/C modules reserved. Live accounts/deployment remain pending |
| D14 | Long selectable-text PDF bank statements; RunAnywhere Eve for structured assistant routing | User requested hundreds of pages and selected Eve on 10 October. Local synthetic validation and setup requirements are in docs/raqam/LONG_STATEMENTS.md; scanned statement OCR and live Eve credit/access remain unverified |
| D13 | Receipt acceptance requires a valid document date, exact nonnegative total and explicitly confirmed PKR; merchant/reference may remain unknown | Confirmed by user on 10 October during BA-00. Unknown financial fields stay unresolved; currency is never inferred automatically |

## 14. Source documents

- Participant Guide (`BUILD WITH AI - Participant Guide.pdf`): directly inspected; page references in this PRD use PDF page numbers. Large original excluded from Git; share separately with teammates.
- RuleBook (`BUILD WITH AI - RuleBook.pdf`): directly inspected; official updates may change requirements. Large original excluded from Git; share separately with teammates.
- Team allocation email supplied in conversation: presentation slot and venue; personal contact details are intentionally not copied.
- [Fortune](https://www.fortune.app/solutions): inspiration for bookkeeping/categorization/cash visibility; Raqam does not claim feature parity or validated differentiation.
- [Grill-with-docs guide](https://github.com/mattpocock/skills/blob/main/docs/engineering/grill-with-docs.md): clarification workflow. See [skills shortlist](docs/SKILLS.md) for dependencies and implementation tools.

## 15. Implementation progress (10 October 2026)

This status note tracks work against the existing requirements; it does not change their acceptance criteria or claim the complete product gate.

| PRD/RQ | Implementation status | Remaining verification |
| --- | --- | --- |
| F03 / RQ-05, workflow steps 7–8 | Owner-scoped source upload and document registration/list/detail/history/review/extraction routes are implemented. The live screen registers a private upload, requests bounded extraction, displays the saved proposal beside its source, and sends versioned corrections/acceptance through the review API. User-applied migration 008 checks confirm its three tables, forced context RLS, owner read/RPC access and denied direct/anonymous access. The new read-only 009/010 check confirms locked registration of complete receipt-image sources; 20,000-row import/confirmation support; the 50,000-row workspace cap; original-description preservation; snapshot cap and owner-only import grants. Signed-in receipt listing previously returned 200 with zero rows in the named test workspace. | Groq settings are absent, so live extraction/cache/correction flow and browser interaction remain unverified. No OCR result or stored receipt mutation is claimed. |
| F04 / RQ-06, workflow steps 9–10 | C's category engine is implemented; A1 reviewed the v1 guide against the seven PRD labels and connected authenticated generation/list persistence plus accept/change/reject controls to the existing review RPC. Signed-in pending-category listing returns 200 with zero rows in the named test workspace. | Groq server settings are absent, so generation and review/reload/rerun remain unverified with a live provider. Synthetic tests and code review do not establish semantic accuracy; cash totals and accepted categories still need a live UI check. |
| RQ-03 / step 9 independent labels | Not complete. | A second person must independently check category expectations and held-out ambiguous cases. |
| RQ-10 | Not complete. | Full signed-in browser journey, reserved evaluation, account isolation, live provider measurements and deployment checks remain release gates. |

Provider configuration check: base Clerk/Supabase settings are present locally, but `node --env-file-if-exists=.env.local scripts/check-env.mjs --ai` reports missing `GROQ_API_KEY`, `GROQ_VISION_MODEL` and `GROQ_TEXT_MODEL`. No live OCR/category inference can run until these are set privately.

After the refreshed-main assistant/match integration, the complete backend/security suite passes **135/135** and strict TypeScript passes. A production build was not rerun on this merged revision because the user's localhost app is using the shared `.next` output; the earlier build evidence applies to the prior integration revision only.
