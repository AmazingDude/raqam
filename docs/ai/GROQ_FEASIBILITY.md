# Person C — Groq feasibility record

**Checked:** 10 October 2026, PKT. **Step 3 / C-01:** `done` for the local capability gate. Three synthetic images, preserved unknowns, strict text schema, and a validated read-only local tool round have actual provider evidence. The review defects are fixed and 17 offline regressions pass. Production AI, A/B integration, independent evaluation and cloud readiness remain separate gates. Historical failed probes below are retained; the final proof section supersedes their incomplete tool evidence.

## Baseline, ownership and credentials

- Checkout: branch `codex/ai-two-person`, tested HEAD `75a4c61` (`Plan two-contributor AI implementation for steps 4-20`). This branch has no `package.json`, lockfile, app source, accepted executable contracts, or app test command. The live runner is C-owned under `tests/ai/live/`.
- Fetched and inspected A's `origin/codex/raqam-backend` at `4b1782cdc5bb1e236accc04512edbadeee5e4e47`. It pins Groq SDK 1.6.0, Zod 4.6.5, TypeScript 5.9.3, npm 11.12.1 and Node `>=22.18.0`; `server-only` is installed and `tsx` is deliberately absent. A's recorded native SDK/Zod runtime test passed on that branch (not rerun here). The C checkout has not merged that baseline and has no installed app dependencies. The final local probe used Node v24.13.1 and only built-in APIs; no package/service was added. The earlier missing-SDK prerequisite is cleared. See contracts.md section 10 for actual exports and remaining BA-00 decisions.
- `.env.local` contained a nonempty `GROQ_API_KEY`; Git confirmed the file is ignored. Model settings were empty, so this feasibility runner used the documented candidate IDs as explicit probe defaults. The key value was never printed, copied to tracked files, or sent to the browser. No Clerk/Supabase variables were read or used.
- Account-visible `/models` returned both candidates. This proves model-list visibility for this key at the time of the call, not production reliability. The Qwen model is currently listed as preview; GPT OSS 20B is listed as production.
- The runner uses a 25-second per-request abort timeout, serial requests and no automatic retry. A full run is capped at one model-list request, three image requests, one schema request and two tool requests. The observed rate limit interrupted the third image; it was resumed once after the server's 16-second guidance without repeating successful cases. Account-level dashboard limits were not inspected. Response headers exposed remaining request/token counters and a `retry-after` value; do not treat those sample counters as a durable quota guarantee.

## Current official Groq capability evidence

Official Groq documentation was checked on 10 October 2026:

| Capability | Current documentation | Live result in this run |
| --- | --- | --- |
| Vision and OCR | `qwen/qwen3.8-27b` accepts image input through Chat Completions, including local base64 data URLs; the guide documents JSON-object mode and tool use. The page lists up to 3 images and a 20 MB image-URL request limit. | Image + JSON-object requests succeeded for all three local PNGs after one rate-limit interruption. |
| Strict structured output | `openai/gpt-oss-20b` supports `response_format: json_schema` with `strict: true`; schema properties must be required and `additionalProperties` must be false. | One synthetic category proposal parsed and passed local schema assertions. |
| Local tool use | Groq returns a named function call for the application to validate and execute locally. `tool_choice` can force a named function. | Final proof returned one named call with `{}` arguments, executed a fixed synthetic fixture locally, and returned exact currency/minor units. Both turns' metadata was captured; code rendered PKR 3100.00. |
| Mode combination | Structured Outputs documentation says tool use and Structured Outputs are not supported together. | Kept separate in all requests; no unsupported combined mode was attempted. |
| Models and quota | Model catalogue lists Qwen 3.8 27B as preview and GPT OSS 20B as production. Rate limits may be constrained by request and token thresholds; exact limits are in the account Limits page and response headers. | Both model IDs appeared in the account model list. Final responses for each model reported limits of 1000 requests/day and 8000 tokens/minute. The earlier 429 is retained. Dashboard-only limits remain unknown; the final C1 reserve and controls are below. |

Sources: [Vision](https://console.groq.com/docs/vision), [Supported Models](https://console.groq.com/docs/models), [Structured Outputs](https://console.groq.com/docs/structured-outputs), [Local Tool Calling](https://console.groq.com/docs/tool-use/local-tool-calling), [Rate Limits](https://console.groq.com/docs/rate-limits).

## Synthetic input labels

The three source SVGs and raster PNGs are C-owned development fixtures in `tests/ai/live/fixtures/receipts/`. The PNGs were rasterized locally from the SVGs using the already-installed system `ffmpeg`; no package was installed. SHA-256 hashes below identify the exact images sent to Groq.

| Source | Expected observed fields (synthetic labels) | Purpose |
| --- | --- | --- |
| `receipt-clean` | Northstar Workspace; 2026-10-09; 4500.00; PKR; NS-104 | Clean, conventional printed layout |
| `receipt-changed-layout` | Harbor Bicycle Repair; 2026-10-10; 3100.00; PKR; HB-208 | Different visual hierarchy, right-aligned line amounts and total |
| `receipt-unreadable-total` | Juniper Cleaning; 2026-10-08; total unknown; PKR; JC-053 | Total digits crossed/obscured; a guessed amount is a critical failure |

These are development cases, not the reserved independent evaluation set. Comparing extraction to fixture labels is a smoke check, not an independent quality score or product-accuracy claim.

## Live evidence

All durations are wall time observed by the runner around individual HTTP calls. Prompt/schema hashes identify exact request content without duplicating prompts into the evidence report. Provider request IDs are retained for traceability; no raw errors or credentials are recorded.

| Probe | Request and settings | Observed provider response | Duration / error |
| --- | --- | --- | --- |
| Account model list | `GET /models`; candidates `qwen/qwen3.8-27b` and `openai/gpt-oss-20b` | Both visible; no inference tokens used. Request ID `req_01m4j7hm0me4wbx3hr802797c0`. | 906 ms; HTTP 200. Model-list response had no rate-limit counters. |
| Clean receipt | Qwen; Chat Completions image + `json_object`; PNG data URL; temperature 0; max 512 completion tokens; non-streaming; prompt SHA-256 `7fb072e23f75d0314a71e925935ad6f4559d996d73a2162edfe6617b2fd09339`; automatic retries 0. Source SHA-256 `aa9a3f4c73d1611c9fc9f6606abe0ef2fe53b427048d377012e07d2d78b1bd18`. | `Northstar Workspace`, `2026-10-09`, `4500.00`, `PKR`, `NS-104`; all five fields matched source labels, no unresolved fields; finish reason `stop`; 1,458 total tokens. Request ID `req_01m4j7hmfaebgbgn4n5tyyf5jg`. | 657 ms; HTTP 200. Remaining-request header 999; remaining-token header 5333. |
| Changed layout | Same Qwen request mode/settings and prompt hash. Source SHA-256 `8e58d200f3f7554ef26d48069c277d974b14f49286bbb8f6eca3b1110a1e4770`. | `Harbor Bicycle Repair`, `2026-10-10`, `3100.00`, `PKR`, `HB-208`; all five fields matched source labels, no unresolved fields; finish reason `stop`; 1,459 total tokens. Request ID `req_01m4j7hn3fe4jtbp9m2adft6b2`. | 725 ms; HTTP 200. Remaining-request header 998; remaining-token header 1911. |
| Unreadable total — first attempt | Same Qwen image + JSON-object settings. Source SHA-256 `b7a87961da38d916d5be9bcd460807ebe38cc3fe3183a98f4df724c3e448e35e`. | No model response. The call was rejected before inference. | 352 ms; HTTP 429 `rate_limit_exceeded`; `retry-after: 16`; remaining-token header 1171. Runner stopped and did not retry automatically. |
| Unreadable total — bounded continuation | Same Qwen settings, after waiting 18 seconds; no other receipt was repeated. | `Juniper Cleaning`, `2026-10-08`, `total: null`, `PKR`, `JC-053`; all fields matched the source labels and obscured total remained unresolved; finish reason `stop`; 1,451 total tokens. Request ID `req_01m4j7kardeqmt8cc9r4z8nyrc`. | 831 ms; HTTP 200. Remaining-request header 997; remaining-token header 5387. |
| Strict text schema | GPT OSS 20B; text-only Chat Completions; strict JSON Schema; temperature 0; max 256 completion tokens; non-streaming; tools disabled; automatic retries 0. Prompt SHA-256 `9776b21d22ac8a8768e2d5db0db476b2340299f62c6d13616316399b193fb4d8`; schema SHA-256 `023d344b7160854a2d36b101eb18a6a0177310d483acf3a632677e679037e4f9`. | Valid exact-shape JSON: `category=software_services`, `needs_review=false`, reason grounded in the synthetic subscription description; finish reason `stop`; 366 total tokens. Request ID `req_01m4j7kb7tevyskn9y25ra9xx9`. | 697 ms; HTTP 200. Remaining-request header 999; remaining-token header 7509. |
| Local tool call | GPT OSS 20B; text-only Chat Completions; one forced named function `get_demo_cash_summary`; no response format; temperature 0; max 256 completion tokens; non-streaming; no automatic retry. Two model requests maximum. | The first response returned the expected function name and empty arguments; the runner passed its assertions, executed only a fixed local result (PKR, 310000 minor units, 2 synthetic records), and sent that result back with the original tool-call ID. The final response was a string, but the runner asserted the literal substring `3100`; its output did not satisfy that narrow check. Because logging occurred only after the assertion, the final text, request IDs, token usage and per-call durations were not captured. | Two provider requests reached successful responses; exact per-call metadata unavailable. This is partial tool-round evidence; do not claim the final answer was verified against the fixture total. |

The live run used seven inference requests in total: two successful receipt requests, one rate-limited receipt attempt, the resumed receipt request, one strict schema request, and two tool-round requests. The additional `/models` account check was one non-inference request. No automatic retries were enabled. The 429 was recorded as a real provider failure; later requests succeeded after the returned reset interval. No provider result was mocked or replayed.

## PRD, plan and contract cross-check

- **PRD F03:** the unreadable required total remained `null`; the extraction did not invent a total. Receipt extraction did not create or persist a transaction. No storage, correction, cache or approval behavior was tested.
- **PRD F07:** only a fixed local read-only synthetic function was exposed to the model. No database, workspace ID, private source or mutation capability was available. This proves provider function-call behavior only; A's authenticated tool scoping and B's displayed action trail remain unverified.
- **Person C plan C-01:** candidate Qwen vision and GPT OSS 20B text/schema/tool paths were tried separately. Qwen's preview lifecycle remains a deployment risk; no provider switch or production model decision is made here.
- **Shared contracts:** C-00 remains `in_review`. The small schema in this runner is a provider capability probe, not the adopted production contract. No A/B schema, route, cache, or frontend state was changed.
- **Cloud readiness:** no client bundle or app server was created; the key stayed in ignored local env and the runner logs no key, raw authorization header, Clerk/Supabase settings, private URLs, or provider error body. This does not establish deployment configuration or production secret provisioning.

## Checks and current gate

- `node --experimental-strip-types --check tests/ai/live/feasibility.ts`: passed.
- Missing-key guard: passed; with `GROQ_API_KEY` unset, runner emitted only `missing_groq_api_key` and exited 2 before network access.
- Live Groq checks: prior account-visible model list, clean and changed-layout OCR passed; final focused probe passed unreadable-total null, strict JSON Schema and both tool turns with exact value validation. Tool-response evidence is complete for this capability probe; production answer correctness is not established.
- Provider rate-limit failure: recorded, bounded and not retried automatically. A single manual continuation was made after the provider's 16-second retry guidance; this is not an automatic retry policy for the application.
- No app/module tests, typecheck, build, auth isolation, persistence, integrated UI, cloud deployment or independent evaluation ran because those modules do not exist on this branch.

## Final proof after review fixes

The review found substring-based amount validation, success exits for invalid answers, and non-object tool arguments being accepted. Those paths now fail closed. A tool call must be the only returned call, have a valid ID, and carry a nonempty JSON string representing an empty non-array object. The second turn requests plain JSON copying only currency/minor units from the actual tool response. It does not combine strict schema mode with tools. Local validation requires exactly those two keys and exact fixture values; BigInt code renders the amount. Malformed/wrong output exits 1 and preserves captured response metadata. The 25-second request duration now includes body reading.

Final command: `node --env-file=.env.local --experimental-strip-types tests/ai/live/feasibility.ts --resume-after-rate-limit`. Exit **0**, four calls, zero automatic retries. Model visibility and clean/layout cases were not needlessly repeated; their earlier evidence and unchanged source hashes are retained.

| Probe | Final observed response | Duration / tokens / request ID |
| --- | --- | --- |
| Qwen unreadable receipt | Same five fields as the source labels; total `null`, finish `stop` | 1334 ms; 1451 tokens; `req_01m4j8ays1eyrrs1dd3de6r05g` |
| GPT OSS strict text schema | Exact schema; software_services proposal; finish `stop` | 608 ms; 366 tokens; `req_01m4j8az7pezkv04fmynp85frd` |
| GPT OSS local tool | `get_demo_cash_summary`, `{}`; fixed result has PKR and `310000` minor units | 412 ms; 257 tokens; `req_01m4j8aztmec8ap924qfatxrgf` |
| GPT OSS tool-result echo | `{"currency":"PKR","net_cash_movement_minor_units":"310000"}`; validated exactly; code rendered **PKR 3100.00** | 511 ms; 324 tokens; `req_01m4j8b0aze8qs9zsm097chhn0`; full tool round 924 ms |

Vision/schema settings and hashes are unchanged from the earlier rows. Tool prompt SHA-256 is `43a52a93fab8e4dc155b0eb0088d876c754b804178324c536a8de7b0b693f6d7`; both tool requests use temperature 0, 256 completion-token cap, no streaming or response_format, forced named tool first and tool_choice none second. Four responses used **2398 tokens total**. Earlier review made four additional requests and exposed a units-ambiguous answer falsely passing the old matcher; that evidence was a failure, not a valid numerical-answer result. Cumulative chat-request attempts across implementation/review/fix: 15, including the one earlier 429; model listing: one. No scripted result counts toward live acceptance.

## C1 account budget and A/B handoff

Real final headers for both models: request limit **1000 RPD**, token limit **8000 TPM**. Remaining daily requests were Qwen **999** and GPT OSS **997** at their final responses; remaining tokens were **5333** and **6965** respectively. Reset headers were captured by the runner; no dashboard-only RPM/TPD/billing claim is made.

C1 now allocates a minimum **60 remaining daily requests per model** to reserved evaluation and two rehearsals. Vision basis: up to 36 reserved images + 6 rehearsal images + 18 bounded contingency attempts. Text basis: up to 24 category/match calls + 18 assistant rounds + 12 rehearsal rounds + 6 contingency attempts. This is a C-owned schedule/reserve, not A/B acknowledgement or an account setting. Other teammates must coordinate live use with C1; the local guard cannot reserve quota atomically across processes.

The runner caps a full run at 7 HTTP calls, resume at 4, `--probe=tool` at 2. After each successful inference response it requires a numeric remaining-request header and stops if the remaining planned attempts would consume the 60-request reserve. This protects subsequent calls; the first response is necessary to observe current account capacity. Missing headers/low capacity fail closed. Serial calls and zero retries apply; any 429 stops the invocation, and bulk evaluation is paced against actual token-reset headers. Preserve these observed limits in the later production configuration handoff, not as guarantees of future service.

Proposed A/B starting caps for integration: one PNG/JPEG per request, serial OCR, a conservative 1 MiB upload cap subject to A's host decision, at most 10 text records per proposal batch, and a 20-second app attempt bounded by the host's outer deadline. The tested synthetic images are 680×640 or 760×920; this does not establish maximum-resolution OCR quality. The probe-only 25-second timeout does not set production route limits.

`node tests/ai/live/feasibility.test.ts`: **17/17 offline CLI regressions passed** with fetch replaced and synthetic credentials; no network/real key. Covered correct exact echo, wrong amount/currency/prose/extra keys, arrays/primitives/null/empty/foreign arguments, extra calls/missing IDs, 429, low quota and missing quota headers. Sandboxed child spawning initially failed EPERM; the same suite passed with the permitted process execution. Syntax, fixture integrity, ignore and whitespace checks remain separate. No app typecheck/build was claimed.

**Next:** step 3/C-01 capability gate is passed. A has supplied the SDK/runtime and shared contract v0.1 on its backend branch. Before step 4, integrate that baseline into the C working branch and settle the outstanding C-00 provider/result seam with A's BA-00 contract work; B's result-state acknowledgement remains pending. See contracts.md section 10. No later step, A/B module, dependency manifest, merge, commit, push or deployment was performed by this fix.

**Subsequent baseline integration:** user requested importing A4b1782c before their review. That baseline is now in C's uncommitted merge and its approved lockfile dependencies are installed. Combined38 backend/security tests,17 C tests and strict typecheck passed; only C's fixture-label lookup needed a compiler guard. No live Groq calls were repeated. The historical no-app/no-installed-dependencies observations above describe the earlier proof, not this current integrated working tree. Step4 remains untouched; the user will review the baseline and remaining C-00 interfaces next.
