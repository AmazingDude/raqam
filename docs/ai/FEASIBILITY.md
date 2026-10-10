# Vision feasibility runner

A1 completed the user-requested toolchain/proof-runner setup on 10 October. C still owns production AI adapters/prompts and the measured RQ-02 evaluation. This standalone runner neither writes financial records nor approves anything.

## Pinned toolchain

Validated locally: Node **25.9.0** (`.node-version`), npm **11.12.1** (`packageManager`), TypeScript **5.9.3**, Groq SDK **1.6.0**, Zod **4.6.5**, tsx **4.23.15**. Dependencies use exact versions and `package-lock.json`; use `npm ci`. The existing Node engine minimum remains 22.18.0; this change does not establish deployment-runtime compatibility.

## Local configuration

Put these values in ignored `.env.local`; never paste keys into chat or commit them:

```dotenv
GROQ_API_KEY=your_groq_project_key
GROQ_VISION_MODEL=your_account_enabled_vision_model_id
```

The command uses Node's native `--env-file-if-exists=.env.local`; inherited environment variables take precedence. Live mode fails closed when either required value is blank. `GROQ_TEXT_MODEL` is needed for later text work, not this vision proof. No browser, Clerk session, Supabase credential or dotenv dependency is needed.

Groq's [current vision documentation](https://console.groq.com/docs/vision) lists `qwen/qwen3.8-27b` with image inputs and JSON mode. Verify access/limits in your own Groq project before selecting it; the runner does not silently pick a model. The [SDK documentation](https://github.com/groq/groq-typescript#retries) describes retry and timeout controls; this proof overrides both at client and request level.

## Commands

From the repository root, place **fresh synthetic/non-private** printed receipt images in ignored `tests/ai/live/inputs/`. Only paths explicitly supplied on the command line are transmitted. Gold answers remain separate and are never sent to the model.

```powershell
npm run test:ai:live -- --help
npm run test:ai:live -- --dry-run tests/ai/live/inputs/clean.png
npm run test:ai:live -- --save tests/ai/live/inputs/clean.png tests/ai/live/inputs/changed-layout.jpg tests/ai/live/inputs/unclear.png
```

This runs `tests/ai/live/feasibility.ts` through tsx. Preflight checks all inputs before making a request: 1–3 files, PNG/JPEG signatures, maximum **4 MiB per file** (a conservative proof cap, not a new product requirement). Dry-run needs no provider credentials and sends no requests. tsx starts a local esbuild process; a restricted process sandbox may require running the command in an ordinary terminal.

Live mode makes one serial request per image, **30 seconds per request**, **zero automatic or manual retries**, maximum 1,024 output tokens and no tool calls. At most three requests gives a 90-second request budget. Timeout, access/rate/provider errors, truncated output and invalid JSON/schema remain failed cases; the process exits 1 if any case fails. SDK logging is explicitly disabled, including when inherited `GROQ_LOG` requests debug output. Client errors are sanitized without printing provider messages, keys, image contents or extracted financial details.

`--save` writes model/prompt version, timestamp, per-case latency/outcome and extracted fields to ignored `artifacts/ai-live/feasibility.json`, overwriting the previous report. Treat it as local private data; the POSIX file mode is not a substitute for Windows folder permissions. Without this flag, no extracted fields are saved. Console output contains only ordinal case IDs, timing, outcomes and counts.

## Evidence and next action

Offline tests exercise the real pinned SDK against synthetic responses: nullable fields, malformed/invented fields, truncation, single attempts for 408/409/429/500/503, abort deadlines and sanitized errors. They do not establish live account access or OCR accuracy.

For RQ-02, C runs the three fresh cases (clean, changed layout, unclear required fields), compares the local results with independently checked answers, and records model access/account limits, latency and extraction errors **with denominators**. An all-null schema-valid response is not successful extraction. Verify that an unreadable required field stays null. Keep RQ-02 open until this measured proof passes; do not label dry-run or mock results as live OCR evidence.
