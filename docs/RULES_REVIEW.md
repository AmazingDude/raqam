# Raqam: rules review and retained references

Review date: 9 October 2026, Asia/Karachi.

## Request and authority

The user asked to retain the reviewed development rules in AmazingDude/raqam and publish only those rules and references. The existing repository PRD, task board and team plan remain the product baseline. This addition does not start application implementation or change the team allocation.

Use the user's current directions and agreed Raqam requirements when selecting from these references. Do not let generic template examples override product scope, ownership, money semantics, runtime provider, or the actual task authorization. External `AGENTS.md` and `SKILL.md` files remain inside the reference directory. The project root AGENTS.md points to these applicability notes; archived instructions are not wholesale project requirements.

## Selected sources

| Source | Retained material | Raqam use |
| --- | --- | --- |
| [GitHub Spec Kit](https://github.github.io/spec-kit/) | Core templates/command definitions, methodology, quickstart, idea-assessment guide, README and license | Separate problem/specification, architecture, dependency-ordered tasks, consistency review, and verification evidence. |
| [LangChain skills](https://github.com/langchain-ai/langchain-skills) | `ecosystem-primer`, `langchain-fundamentals`, `langchain-middleware`, README and license | Reference for explicit tool schemas, bounded loops, structured results, failure handling and review state. Framework-specific implementation remains conditional. |
| [Jeffallan skills](https://github.com/Jeffallan/claude-skills) | `api-designer`, `nextjs-developer`, `typescript-pro`, `secure-code-guardian`, `postgres-pro`, `playwright-expert`, their reference folders, README and license | API contracts, full-stack boundaries, validation, state types, ownership checks, database queries and browser verification. |
| User's frontend ZIP | Original outer ZIP, all outer members, complete unpacked nested bundle | Design tokens, workflow-specific layouts, semantic controls, responsive behavior, accessibility and screenshot review. |

Main skill instructions and relevant Spec Kit templates were inspected. Supporting reference folders were retained for later task-specific reading; they are not all audited or tested. No installer, downloaded helper, generated command, package manager, or external API integration was executed.

## Local entry points

- [Spec template](references/github--spec-kit/templates/spec-template.md)
- [Plan template](references/github--spec-kit/templates/plan-template.md)
- [Task template](references/github--spec-kit/templates/tasks-template.md)
- [Constitution template](references/github--spec-kit/templates/constitution-template.md)
- [Consistency analysis](references/github--spec-kit/templates/commands/analyze.md)
- [Idea assessment guide](references/github--spec-kit/docs/guides/assessment.md)
- [Agent ecosystem primer](references/langchain-ai--langchain-skills/config/skills/ecosystem-primer/SKILL.md)
- [Agent fundamentals](references/langchain-ai--langchain-skills/config/skills/langchain-fundamentals/SKILL.md)
- [Agent middleware](references/langchain-ai--langchain-skills/config/skills/langchain-middleware/SKILL.md)
- [API designer](references/Jeffallan--claude-skills/skills/api-designer/SKILL.md)
- [Next.js](references/Jeffallan--claude-skills/skills/nextjs-developer/SKILL.md)
- [TypeScript](references/Jeffallan--claude-skills/skills/typescript-pro/SKILL.md)
- [Secure code](references/Jeffallan--claude-skills/skills/secure-code-guardian/SKILL.md)
- [Postgres](references/Jeffallan--claude-skills/skills/postgres-pro/SKILL.md)
- [Playwright](references/Jeffallan--claude-skills/skills/playwright-expert/SKILL.md)
- [Frontend craft](references/frontend/bundle/.agents/skills/frontend-craft/SKILL.md)
- [Frontend anti-generic reference](references/frontend/bundle/.agents/skills/frontend-craft/references/anti-generic.md)
- [Image studio](references/frontend/bundle/.agents/skills/image-studio/SKILL.md)

## Guidance to carry into the architecture plan

1. Use existing F01–F08 requirements as the starting point; create a short shared contract before parallel implementation. Trace each future RQ task to acceptance criteria and verification. Avoid duplicating the draft into competing specifications.
2. Record Raqam-specific invariants: CSV supplies cash movement; receipts supply evidence; money is exact; uncertain values remain unknown; proposals do not silently become accepted decisions; every record and source is owner-scoped.
3. Keep one Next.js/TypeScript application under the draft's selected stack. Define server routes, request/response schemas, recoverable errors, size caps, idempotency and state transitions before feature branches diverge.
4. Use strict types and runtime validation for imports, provider outputs and tool arguments. Distinguish transactions, documents, proposals, review decisions and active matches.
5. The proposed assistant has four read-only tools and a bounded loop. Application code supplies ownership and arithmetic. Persist human decisions in Supabase; a framework checkpoint or in-memory message history is not the bookkeeping source of truth.
6. Apply resource-level authorization as well as middleware and database/private Storage policies. Keep keys server-side and redact sensitive logs. Clerk is the selected identity provider.
7. Verify user journeys, exact totals, repeated requests, concurrency and cross-owner isolation. Keep live AI measurements separate from mocked provider tests and reserved answers outside model context.
8. Build the UI around import preview, source/field comparison, review queue and cashbook. Use shared tokens, visible focus, useful empty/error states, 360/768/1280px checks, and reduced-motion support. Visual polish does not replace functioning review states.

## Conflicts and limits found during review

| External guidance | Raqam-specific handling |
| --- | --- |
| Spec Kit sample constitution suggests library-first architecture, CLI interfaces and mandatory approval of tests. | These are template examples, not established Raqam requirements. Use the team's small integrated slices and actual acceptance gates. |
| Spec Kit initialization and implementation commands can create/change project artifacts. | Retained for reference only. The current request is preparation; no CLI initialization or implementation occurred. |
| LangChain primer directs users toward its frameworks and recommends external tracing. | The PRD calls for the Groq SDK and no framework without a demonstrated need. Keep useful concepts; do not automatically add LangChain, LangGraph, Deep Agents, LangSmith, RAG or new service credentials. |
| Framework examples combine capabilities and use example model IDs. | Verify Groq's current model access and supported structured-output/tool modes at the first technical gate. Example providers and IDs do not change the selected runtime. |
| LangChain review examples pause before mutable tools. | Raqam's assistant tools are read-only. Category/match acceptance belongs to the authenticated review workflow; do not introduce assistant mutation tools. |
| API designer mandates a broad OpenAPI/versioning workflow. | Keep a concise shared contract and consistent validation/errors. A full public-API lifecycle is not automatically an added MVP requirement. |
| Next.js examples target 14+ and omit app-specific authorization in sample mutations. | Check APIs against pinned versions. Never copy sample mutations without session/ownership validation. Prevent private data from entering shared caches. |
| Security examples implement passwords and custom JWTs. | Clerk handles login/session issuance. Retain authorization/input-validation principles; do not build a second authentication system. |
| Postgres guidance emphasizes replication, extensions and performance tuning. | Conditional reference only; none is justified by the current small dataset. Clerk subjects remain text, even if internal record IDs use UUIDs. |
| TypeScript examples use library-oriented compiler settings and declaration output. | Use settings compatible with the selected Next.js app; retain strictness and explicit states without introducing a library/monorepo build. |
| Playwright recommends parallel runs. | Isolate test state. Coordinate or serialize live Groq evaluations under the shared free-tier budget. |
| Frontend craft says to write a UI plan and wait for approval. | Preserved as supplied. No UI task is underway now, so it does not block this reference review. For future UI work, apply the current user's authorization and approved plan; do not ask again for decisions already authorized. |
| Frontend craft requests generated images and deletion of unused variants. | This grants no permission to delete any archive content. No archive member was removed or modified. Decide whether imagery serves Raqam's workflow before using an image tool. |
| Outer ZIP has loose copies of `SKILL.md` and `generate.py`. | The nested bundle contains the coherent `scripts/` and `references/` layout. Preserve both; the loose helper should not be assumed runnable in isolation. Image generation and provider compatibility were not tested. |

## Open items in the supplied planning set

- This clone contains the complete RQ-00 through RQ-12 task board and prior handoff. All implementation tasks remain `todo`; existing role ownership is recorded in TEAM_WORKFLOW.md, and personal names remain unassigned.
- The official PDFs and allocation email cited in the draft are not present. Their claimed prior verification remains attributed to the supplied draft; the exact submission cutoff is still explicitly pending.
- Model IDs, package versions, Clerk/Supabase setup, quotas, hosting, image caps and actual OCR behavior require live checks when implementation is authorized. This review establishes no runtime readiness.
- Dataset sizes and metric targets are planned gates. No extraction, categorization, matching, security or deployment results exist from this work.
- The user is still preparing the PRD. Save future product changes explicitly before changing the shared contract or task scope.

## Preservation and provenance

The upstream snapshots use immutable commit URLs recorded in [sources.json](references/sources.json), along with individual SHA-256 hashes. Each repository's license is retained. Record actual implementation use separately from merely retaining a reference when preparing competition disclosures.

The original Downloads archive was left untouched. The [project copy](references/frontend/frontend-skills.zip) has the same SHA-256:

`30020ce2951dc489f34d77cf4e3d8bfd48006b91b5287751eb21c9362891cbe5`

All five outer files and all seven nested files are preserved, including duplicate copies, scripts, references and both copies of the bundled AGENTS.md. Directory entries were also extracted. [preservation.json](references/frontend/preservation.json) records member hashes using portable paths. The ZIP and its members were not changed; only the surrounding provenance metadata was made repository-portable.
