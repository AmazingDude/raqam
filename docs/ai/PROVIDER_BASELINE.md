# C1 step 3: native Node dependency baseline

The latest user instruction assigns A only the dependency/runtime baseline. **C1 owns the feasibility runner, secure environment loading, bounded timeouts and synthetic inputs.** This supersedes A's proof implementation in `aad6ab4`; those files are removed from the current baseline and remain recoverable in Git history. No tsx dependency or proof npm script remains. Database, routes and UI are outside this slice.

## Confirmed versions

- Node **25.9.0**, recorded in `.node-version`; npm **11.12.1**, recorded in `packageManager`.
- Groq SDK **1.6.0**, Zod **4.6.5**, TypeScript **5.9.3**, pinned exactly in package/lock files. Restore with `npm ci`.
- The existing Node engine minimum is 22.18.0; the tested local baseline is specifically 25.9.0.

## Tested command

```powershell
node tests/backend/ai-runtime.test.ts
```

This executes actual `.ts` type annotations with native Node, imports the pinned Groq SDK and Zod, makes one SDK completion against an in-memory synthetic fetch, and validates its JSON using Zod. It uses no network, real credentials, database, routes or UI. It demonstrates dependency/runtime compatibility, not live Groq account access or OCR accuracy.

Once C1 creates `tests/ai/live/feasibility.ts`, the intended native command from the repo root is:

```powershell
node --env-file=.env.local tests/ai/live/feasibility.ts
```

That path is reserved for C1 and is not an executable proof in this baseline. `--env-file` deliberately requires the ignored local file; C1 must validate required values and sanitize logs. Existing ignored `.env.local` placeholders and `.env.example` contain `GROQ_API_KEY`, `GROQ_VISION_MODEL` and `GROQ_TEXT_MODEL`. The vision-only proof needs the first two. Keep keys and private financial records out of Git and output.

[Node's native TypeScript documentation](https://nodejs.org/api/typescript.html#type-stripping) explains the lightweight runtime: use erasable syntax, explicit `.ts` relative imports and `import type`. Avoid tsconfig path aliases, enums, parameter properties and `.tsx` in this standalone proof. Native execution strips types; it does not typecheck. Keep `npm run typecheck` as the separate strict check.

## C1 boundary

C1 implements step 3 without another TypeScript runner dependency: securely load/validate local configuration, disable Groq's default retries explicitly, set bounded request/run deadlines, prevent SDK debug logs from leaking payloads, validate output with Zod and prepare independently checked synthetic inputs. Preserve unknowns as null and label simulated results honestly. Gold answers must stay outside model context.

Local proof inputs/results remain ignored under `tests/ai/live/inputs/` and `artifacts/ai-live/`. The old ignored 1-pixel runner smoke image is not a receipt or OCR evaluation case. Live model availability/account limits and measured three-receipt OCR feasibility remain C1's pending proof.
