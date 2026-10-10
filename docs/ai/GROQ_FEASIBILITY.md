# Person C — Groq feasibility record

**Checked:** 10 October 2026, PKT. **Status:** official documentation reviewed; live provider proof is blocked and has not been attempted. This file records public documentation evidence separately from account access and real responses.

## Repository and credential readiness

- The checkout has no application scaffold, `package.json`, lockfile, A-approved runtime/dependency set, or test-runner configuration. There is no agreed executable path for `tests/ai/live/feasibility.ts`.
- `.env.local` exists and is Git-ignored. Its `GROQ_API_KEY` setting is empty; the current process also has no `GROQ_API_KEY`. Values were checked without printing them. No key was requested or exposed in chat.
- Neither `groq-sdk` in Node nor `groq` in Python is installed. No dependency was installed because A owns dependency/runtime approval.
- No Groq request was sent. No account model permissions, account-specific quotas, usage counters or retry headers were observable.

## Current public documentation evidence

The following official Groq pages were checked on 10 October 2026:

| Capability | Documentation evidence | Limits on the conclusion |
| --- | --- | --- |
| Image input | The Vision guide documents `qwen/qwen3.8-27b` through Chat Completions with image URLs and local images encoded as data URLs. It lists up to three images per request and a 20 MB limit for an image-URL request. | This is a public service limit, not an approved Raqam upload cap; the Raqam account and exact image requests remain untested. |
| Vision JSON | The Vision guide shows this model with `response_format: {"type":"json_object"}`. | JSON-object mode does not prove that the fields are correct or complete. The Vision page does not establish strict JSON-Schema support for the image request configuration we need. |
| Strict structured output | The Structured Outputs page currently lists `openai/gpt-oss-20b` and `qwen/qwen3.8-27b` as supporting `strict: true`; strict schemas require all properties to be required and `additionalProperties: false`. | Documentation does not establish account access or actual compliance for our schema. Keep the text-schema probe separate from tool calls. |
| Local tool calling | Groq's local-tool-calling guide documents the model returning a named function call for application code to validate and execute. The Vision page also demonstrates tool use with Qwen. | The app must execute tools locally; the model does not receive database authority. No call was returned or executed in this task. |
| Combined modes | Groq's Structured Outputs page says tool use and Structured Outputs are not currently supported together. | Keep schema-output and tool-use requests separate. Do not infer support for a combined request from separate feature pages. |
| Current model listing | Groq's model catalogue lists `openai/gpt-oss-20b` as a production model and `qwen/qwen3.8-27b` as a preview model. Preview models may be discontinued at short notice. | Catalogue availability is not account-visible permission. The Qwen candidate carries a lifecycle risk and must stay configurable. |
| Quotas | Groq says rate limits apply at organization level and can be reached through different request/token thresholds. | This account's active limits, reset times, and remaining demo/evaluation budget are unknown. |

Sources: [Vision](https://console.groq.com/docs/vision), [Supported Models](https://console.groq.com/docs/models), [Structured Outputs](https://console.groq.com/docs/structured-outputs), [Local Tool Calling](https://console.groq.com/docs/tool-use/local-tool-calling), [Rate Limits](https://console.groq.com/docs/rate-limits).

## Cross-check against Raqam scope and step 3

- PRD F03 requires missing/unreadable financial fields to stay unresolved, and a receipt cannot create a cash movement. The unreadable-total probe therefore treats an invented total as a critical failure; no cashbook behavior is being tested here.
- PRD F07 keeps the assistant read-only and requires code to execute allowlisted tools against authenticated scope. The proposed tool fixture is local, fixed and side-effect-free; it does not stand in for A's authenticated tools.
- Person C plan C-01 names Qwen for vision and GPT OSS 20B for separate text/schema and tool probes. The current preview classification for Qwen is recorded as a risk, not a silent model switch.
- C-00 shared contracts remain `in_review`. Any schema in a future smoke probe is only a local capability probe, not the accepted production contract or a duplicate app schema.
- This work addresses only implementation step 3's feasibility gate. It does not implement the adapter, routes, retries, persistence, production schemas or later steps.

## Live probes still required

No synthetic receipt images were created or sent, and no provider-response fixtures were used or scored. Once A provides an approved runner and secure key access, run the following as separate, bounded probes. These are a test plan, not results:

| Probe | Candidate and request shape | Required observation | State |
| --- | --- | --- | --- |
| Clean receipt | `qwen/qwen3.8-27b`; one fresh synthetic English printed PNG; image `data:` URL; non-streaming Chat Completion; JSON-object response mode; no tools | Preserve source ID and raw image; validate merchant/date/total/currency/reference; record elapsed time, request ID, token usage if returned, response parse and field-level comparison. | Not run; no approved runner or key. |
| Changed layout | Same model/mode; a different synthetic receipt layout, still one image/request | Same field checks plus layout-specific omissions; no extra fields inferred from a different visual position. | Not run; no approved runner or key. |
| Unreadable total | Same model/mode; synthetic receipt whose total digits are unreadable | Total must remain unknown/null or be explicitly marked unresolved; record any invented value as a critical failure. | Not run; no approved runner or key. |
| Text structured output | `openai/gpt-oss-20b`; synthetic short transaction/document description; non-streaming Chat Completion; `response_format` JSON Schema with `strict: true`; no tools | Parse and validate a small required-fields schema; record output, elapsed time and response metadata. Schema validity is separate from semantic correctness. | Not run; no approved runner or key. |
| Read-only local tool call | `openai/gpt-oss-20b`; non-streaming Chat Completion; one named fixture lookup tool; force that tool for the probe; no `response_format` | Validate the returned tool name/arguments, execute only a local fixed synthetic lookup, return the tool result with the original tool-call ID, and cap the probe at two model requests. No database or network side effect. | Not run; no approved runner or key. |

Do not set a timeout, retry policy, image byte cap, concurrency or output-token cap as an accepted Raqam setting until A's host/runtime decision is recorded. For the first evidence run, make one request for each receipt and one for strict text output; allow at most two requests for the tool round, with no automatic retries. A must first verify account limits and reserve capacity for the independent evaluation and demo.

## Evidence log

| Date | Model / mode | Request settings | Response / unresolved fields | Duration | Error / usage |
| --- | --- | --- | --- | --- | --- |
| 10 Oct 2026 | None | No provider request made | No provider response; all receipt fields and tool behavior remain unverified | N/A | No provider error occurred; request count 0; account usage unchanged by this task |

This record deliberately contains no scripted provider result. Public docs establish candidate capability only; they do not satisfy live acceptance in step 3 or PRD F03/F07.

## Blocker and next action

Step 3 and C-01 remain **blocked** until A identifies the approved local runner/runtime and dependency versions, the secret is supplied privately to that runtime, and account access/limits can be checked. Do not paste the key into chat, documentation, shell output, test fixtures or browser code. Then run the probes above, record actual nonsecret request settings/IDs/durations/outcomes, preserve the three raw synthetic images for independent review, and leave reserved evaluation answers separate. C-02 provider implementation remains gated on C-00 contract adoption and successful C-01 live feasibility.
