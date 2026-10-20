<div align="center">
  <img src="public/brand/raqam-mark.png" alt="Raqam emblem" width="132" />

  <h1>Raqam</h1>
  <p><strong>Clearer books. A calmer business.</strong></p>
  <p>Turn statements, receipts, and written history into records you can review and understand.</p>

  <a href="#what-you-can-do">Explore the product</a> ·
  <a href="#run-locally">Run locally</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#project-guide">Project guide</a>
</div>

<br />

## Bookkeeping, with you in control

Raqam helps small service businesses organize their financial records, review suggested changes, and ask questions grounded in their books. It brings statement imports, receipt evidence, a reviewed cashbook, and a conversational assistant into one private workspace.

The current experience is built for **English and PKR**, with **Pakistan income-tax readiness and draft workpapers**. AI helps interpret records and propose changes; validated application code calculates financial totals, and you decide what gets saved.

## What you can do

| In your workspace | What it helps you do |
| :--- | :--- |
| **Import transactions** | Preview CSV, TSV, Excel, and selectable-text PDF statements before confirming records. Keep unresolved rows visible for review. |
| **Read receipts** | Extract receipt details with OCR, inspect the source, and correct the proposed fields. |
| **Review your cashbook** | Check transactions, review category suggestions, match supporting documents, and export your cashbook. |
| **Ask Raqam** | Ask about records, write past transactions in plain language, or request bookkeeping corrections. Review proposals before saving them. |
| **Keep the wider picture** | Work with invoices, supplier bills, payments, ledger entries, and financial reports. |
| **Prepare for tax work** | Complete business and taxpayer facts, inspect readiness gates, and prepare an income-tax workpaper draft when its requirements are met. |
| **Choose your AI provider** | Connect your own Groq, Gemini, OpenAI, or Claude key from AI provider settings. |

**Provider support:** receipt extraction uses Groq or Gemini. OpenAI and Claude support text proposals and assistant requests. Provider access and model availability depend on your account and configuration.

## How it works

1. **Bring in the history.** Import a transaction file, add receipt evidence, or describe past activity in Ask Raqam.
2. **Inspect the proposal.** Check amounts, dates, categories, source references, and suggested corrections.
3. **Review and save.** Confirm the records or draft changes you want to keep. A suggestion alone does not change your books.
4. **Understand the result.** Read cash summaries, follow supporting evidence, inspect reports, and export your cashbook.

### The details that matter

- **Exact money:** amounts use integer minor units; financial totals come from code.
- **Visible review state:** pending proposals stay distinct from saved decisions.
- **Preserved context:** original sources and edit history remain available for review.
- **Private workspaces:** Clerk identity, scoped server requests, and PostgreSQL row-level policies protect access to records and sources.
- **Evidence within reach:** assistant responses can link back to consulted records and supporting documents.

## Run locally

### 1. Install

Use **Node.js 22.18 or newer** and npm. The repository declares npm **11.12.1** and includes a lockfile.

```bash
git clone https://github.com/AmazingDude/raqam.git
cd raqam
npm ci
cp .env.example .env.local
```

### 2. Connect your services

Configure `.env.local` using [the environment template](.env.example) and [the setup guide](docs/raqam/SETUP.md).

| Setting | Purpose |
| :--- | :--- |
| `APP_URL` | App origin; use `http://localhost:3000` for the default local server. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk sign-in and server-side session verification. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase database and private source storage. |
| `AI_PROVIDER` and its provider key/model settings | Default server-side Groq or Gemini configuration; see `.env.example`. |
| `BYOK_ENCRYPTION_KEY` | Encrypts provider keys saved through workspace settings. |

Enable the native Clerk–Supabase integration. For a **new database**, review and apply the SQL files in [`supabase/migrations`](supabase/migrations) in filename order. For an existing database, verify migration history and installed schema before applying anything. Ordinary application requests use the publishable key with the signed-in user's token.

Generate the BYOK encryption key with:

```bash
openssl rand -base64 32
```

Store that value privately as `BYOK_ENCRYPTION_KEY` and keep it stable across app servers. Keep `.env.local` and all credentials out of Git.

### 3. Start

```bash
npm run check:env
npm run dev
```

Open **[localhost:3000](http://localhost:3000)**.

- **`/`** — product landing page.
- **`/demo`** — example workspace with synthetic records and simulated answers.
- **`/workspace`** — your signed-in workspace, backed by configured services.

The example workspace does not call a live AI provider. Live workflows require the corresponding credentials, migrations, and provider access. Restart the server after changing environment variables.

## Under the hood

| Layer | Technology |
| :--- | :--- |
| Application | Next.js 16 App Router, React 19, TypeScript |
| Interface | CSS Modules, shared design tokens, responsive layouts |
| Identity | Clerk |
| Persistence | Supabase PostgreSQL and private Storage |
| AI | Provider adapters for Groq, Gemini, OpenAI, and Claude |
| Validation | Zod contracts and deterministic financial checks |
| Local database testing | PGlite with synthetic fixtures |

```text
src/app/                    Pages, API routes, and browser icons
src/components/             Marketing, workspace, and shared UI
src/lib/ai/                 AI provider adapters and workflows
src/lib/client/             Client API access and presentation helpers
src/lib/contracts/          Shared types and runtime schemas
src/lib/server/             Authentication, bookkeeping, and persistence
supabase/migrations/        Database schema, policies, and RPC functions
public/brand/               Original artwork and transparent R emblem
tests/                      Backend, security, AI, and client checks
docs/                       Setup, contracts, plans, and validation records
```

## Development checks

```bash
npm test                  # Backend and security suite
npm run typecheck         # Generate route types and check TypeScript
npm run build             # Production build
npm run check:env -- --ai  # Check required AI configuration fields
```

To serve the production build:

```bash
npm run start
```

Environment checks validate configuration shape and presence; they do not prove a provider connection or a complete signed-in workflow. See the [validation records](docs/raqam/VALIDATION.md) and [handoff](handoff.md) for the scope and limits of recorded checks.

## Scope to know

Raqam is an evolving application. The demo uses synthetic data; it is separate from live account persistence and provider evaluation. Statement PDF imports currently require selectable text—scanned-statement OCR is not part of that import flow.

Tax support currently targets **Pakistan income tax**. Workpapers are drafts gated by required facts, schedules, rule evidence, and review. Raqam does not file returns or make tax payments.

## Project guide

| Guide | Start here for |
| :--- | :--- |
| [Product requirements](PRD.md) | Product scope, decisions, and acceptance criteria. |
| [Build plan](BUILD_PLAN.md) | Delivery phases, dependencies, and release gates. |
| [Setup](docs/raqam/SETUP.md) | Clerk, Supabase, migrations, and provider configuration. |
| [Shared contracts](docs/raqam/CONTRACTS.md) | Interfaces between the UI, backend, and AI workflows. |
| [Validation](docs/raqam/VALIDATION.md) | Recorded checks and their practical limits. |
| [Team workflow](TEAM_WORKFLOW.md) | Ownership and integration conventions. |
| [Glossary](docs/raqam/GLOSSARY.md) | The language used throughout the product. |
| [Handoff](handoff.md) | Implementation history and remaining work. |

---

<div align="center">
  <strong>Built by edge runners for AICON’26 · Financial Operations</strong><br />
  <sub>Your records, receipts, and next steps. A little more together.</sub>
</div>
