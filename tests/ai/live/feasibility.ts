import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

// Explicitly opt-in live probe. Uses Node's built-in fetch; no SDK or app runtime
// dependency is added. A maximum of seven requests are made, with no retries.
const API = 'https://api.groq.com/openai/v1';
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b';
const TEXT_MODEL = process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-20b';
const TIMEOUT_MS = 25_000;
const fixtures = resolve('tests/ai/live/fixtures/receipts');
const key = process.env.GROQ_API_KEY;
const resumeAfterRateLimit = process.argv.includes('--resume-after-rate-limit');
const toolOnly = process.argv.includes('--probe=tool');
const MAX_REQUESTS = toolOnly ? 2 : resumeAfterRateLimit ? 4 : 7;
// C1's minimum per-model daily reserve: independent evaluation and two rehearsals.
// This local guard does not coordinate requests from other teammates/processes.
const RESERVED_REQUESTS = 60;
let requestCount = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseObject(text: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('invalid_json_output'); }
  assert(isRecord(value), 'expected_json_object');
  return value;
}

if (!key) {
  console.error(JSON.stringify({ status: 'blocked', reason: 'missing_groq_api_key' }));
  process.exit(2);
}

const safeHeaders = (response: Response) => ({
  request_id: response.headers.get('x-request-id'),
  rate_limit_requests: response.headers.get('x-ratelimit-limit-requests'),
  rate_limit_tokens: response.headers.get('x-ratelimit-limit-tokens'),
  rate_limit_remaining_requests: response.headers.get('x-ratelimit-remaining-requests'),
  rate_limit_remaining_tokens: response.headers.get('x-ratelimit-remaining-tokens'),
  rate_limit_reset_requests: response.headers.get('x-ratelimit-reset-requests'),
  rate_limit_reset_tokens: response.headers.get('x-ratelimit-reset-tokens'),
  retry_after: response.headers.get('retry-after'),
});

async function request(path: string, body?: unknown) {
  assert(requestCount < MAX_REQUESTS, 'probe_request_budget_exhausted');
  requestCount++;
  const started = performance.now();
  const response = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${key}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await response.json().catch(() => null);
  const duration_ms = Math.round(performance.now() - started);
  if (!response.ok) {
    const error = data && typeof data === 'object' ? (data as any).error : null;
    throw Object.assign(new Error('provider_request_failed'), {
      status: response.status,
      provider_code: error && typeof error.code === 'string' ? error.code : null,
      duration_ms,
      headers: safeHeaders(response),
    });
  }
  const remaining = response.headers.get('x-ratelimit-remaining-requests');
  if (body !== undefined) {
    assert(remaining !== null, 'missing_rate_limit_capacity');
    assert(/^\d+$/.test(remaining), 'invalid_rate_limit_header');
    assert(Number(remaining) >= RESERVED_REQUESTS + MAX_REQUESTS - requestCount, 'evaluation_demo_reserve_reached');
  }
  return { data, duration_ms, headers: safeHeaders(response) };
}

function log(record: unknown) {
  console.log(JSON.stringify(record));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hash(data: Uint8Array | string) {
  return createHash('sha256').update(data).digest('hex');
}

async function main() {
  log({ probe: 'request_budget', max_requests: MAX_REQUESTS, reserved_requests_per_model: RESERVED_REQUESTS, automatic_retries: 0 });
  if (!resumeAfterRateLimit && !toolOnly) {
    const modelResult = await request('/models');
    const modelIds = new Set<string>((modelResult.data?.data ?? []).map((m: any) => m?.id).filter((id: any) => typeof id === 'string'));
    const available = { vision: modelIds.has(VISION_MODEL), text: modelIds.has(TEXT_MODEL) };
    log({ probe: 'account_models', status: available.vision && available.text ? 'pass' : 'fail', candidates: { vision: VISION_MODEL, text: TEXT_MODEL }, visible: available, duration_ms: modelResult.duration_ms, headers: modelResult.headers });
    assert(available.vision && available.text, 'candidate_model_not_visible_to_account');
  } else {
    log({ probe: 'account_models', status: 'not_rechecked_in_focused_run', candidates: { vision: VISION_MODEL, text: TEXT_MODEL } });
  }

  const visionPrompt = [
    'Read this synthetic English business receipt. Return one JSON object with exactly these keys: merchant, date, total, currency, reference.',
    'Use strings for clearly observed values and null when a value is absent, obscured, or uncertain. Do not calculate a total from line items. Do not guess unreadable digits.',
    'Date must be YYYY-MM-DD when unambiguous. Amount must be a decimal string with two fractional digits, without a currency symbol. Keep receipt reference as printed.',
  ].join(' ');
  const visionPromptHash = hash(visionPrompt);
  const imageNames = toolOnly ? [] : resumeAfterRateLimit
    ? ['receipt-unreadable-total.png']
    : ['receipt-clean.png', 'receipt-changed-layout.png', 'receipt-unreadable-total.png'];
  const expected: Record<string, Record<string, string | null>> = {
    'receipt-clean': { merchant: 'Northstar Workspace', date: '2026-10-09', total: '4500.00', currency: 'PKR', reference: 'NS-104' },
    'receipt-changed-layout': { merchant: 'Harbor Bicycle Repair', date: '2026-10-10', total: '3100.00', currency: 'PKR', reference: 'HB-208' },
    'receipt-unreadable-total': { merchant: 'Juniper Cleaning', date: '2026-10-08', total: null, currency: 'PKR', reference: 'JC-053' },
  };
  for (const imageName of imageNames) {
    const image = await readFile(resolve(fixtures, imageName));
    const sourceId = basename(imageName, '.png');
    const expectedFields = expected[sourceId];
    assert(expectedFields !== undefined, 'unknown_synthetic_source');
    try {
      const result = await request('/chat/completions', {
        model: VISION_MODEL,
        messages: [{ role: 'user', content: [
          { type: 'text', text: visionPrompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${image.toString('base64')}` } },
        ] }],
        temperature: 0,
        max_completion_tokens: 512,
        stream: false,
        response_format: { type: 'json_object' },
      });
      const choice = result.data?.choices?.[0];
      assert(choice?.finish_reason === 'stop', 'incomplete_completion');
      const content = choice?.message?.content;
      assert(typeof content === 'string', 'missing_json_content');
      const parsed = parseObject(content);
      const fields = ['merchant', 'date', 'total', 'currency', 'reference'];
      assert(parsed && typeof parsed === 'object' && Object.keys(parsed).sort().join(',') === [...fields].sort().join(','), 'extraction_keys_mismatch');
      assert(fields.every((field) => parsed[field] === null || typeof parsed[field] === 'string'), 'invalid_extraction_field_type');
      const matchesSource = fields.every((field) => parsed[field] === expectedFields[field]);
      const unreadableSafe = sourceId !== 'receipt-unreadable-total' || parsed.total === null;
      log({
        probe: 'receipt_vision_json', source_id: sourceId, source_sha256: hash(image), model: VISION_MODEL,
        request_mode: 'chat.completions:image+json_object', prompt_sha256: visionPromptHash,
        request_settings: { temperature: 0, max_completion_tokens: 512, stream: false, automatic_retries: 0 },
        status: !unreadableSafe ? 'critical_unreadable_total_was_guessed' : matchesSource ? 'pass' : 'field_mismatch', fields: parsed,
        matches_synthetic_source_labels: matchesSource,
        unresolved_fields: fields.filter((field) => parsed[field] === null), finish_reason: choice.finish_reason,
        usage: result.data.usage ?? null, duration_ms: result.duration_ms, headers: result.headers,
      });
      assert(unreadableSafe, 'model_guessed_unreadable_required_total');
      assert(matchesSource, 'extraction_did_not_match_synthetic_source_labels');
    } catch (error: any) {
      log({ probe: 'receipt_vision_json', source_id: sourceId, model: VISION_MODEL, status: 'fail', error_type: error?.name === 'TimeoutError' ? 'timeout' : error?.provider_code ?? error?.message ?? 'unknown', http_status: error?.status ?? null, duration_ms: error?.duration_ms ?? null, headers: error?.headers ?? null });
      throw error;
    }
  }

  const schema = {
    type: 'object',
    properties: {
      category: { type: 'string', enum: ['software_services', 'customer_receipts', 'other_operating_cash_activity', 'uncategorized'] },
      reason: { type: 'string' },
      needs_review: { type: 'boolean' },
    },
    required: ['category', 'reason', 'needs_review'],
    additionalProperties: false,
  };
  const schemaPrompt = 'Classify this synthetic transaction using the supplied category schema. Description: Monthly workspace software subscription, PKR 4,500.00 outflow. Return a concise reason grounded only in this description.';
  if (!toolOnly) try {
    const result = await request('/chat/completions', {
      model: TEXT_MODEL,
      messages: [{ role: 'user', content: schemaPrompt }],
      temperature: 0,
      max_completion_tokens: 256,
      stream: false,
      response_format: { type: 'json_schema', json_schema: { name: 'synthetic_category_proposal', strict: true, schema } },
    });
    const choice = result.data?.choices?.[0];
    const content = choice?.message?.content;
    assert(typeof content === 'string', 'missing_schema_content');
    assert(choice?.finish_reason === 'stop', 'incomplete_schema_completion');
    const parsed = parseObject(content);
    assert(Object.keys(parsed).sort().join(',') === 'category,needs_review,reason', 'schema_keys_mismatch');
    assert(typeof parsed.category === 'string' && schema.properties.category.enum.includes(parsed.category) && typeof parsed.reason === 'string' && typeof parsed.needs_review === 'boolean', 'schema_value_mismatch');
    log({ probe: 'text_strict_json_schema', status: 'pass', model: TEXT_MODEL, request_mode: 'chat.completions:text+json_schema_strict', prompt_sha256: hash(schemaPrompt), schema_sha256: hash(JSON.stringify(schema)), request_settings: { temperature: 0, max_completion_tokens: 256, stream: false, tools: false, automatic_retries: 0 }, proposal: parsed, finish_reason: choice.finish_reason, usage: result.data.usage ?? null, duration_ms: result.duration_ms, headers: result.headers });
  } catch (error: any) {
    log({ probe: 'text_strict_json_schema', model: TEXT_MODEL, status: 'fail', error_type: error?.name === 'TimeoutError' ? 'timeout' : error?.provider_code ?? error?.message ?? 'unknown', http_status: error?.status ?? null, duration_ms: error?.duration_ms ?? null, headers: error?.headers ?? null });
    throw error;
  }

  const tool = { type: 'function', function: { name: 'get_demo_cash_summary', description: 'Read the fixed synthetic demo cash summary. Takes no arguments.', parameters: { type: 'object', properties: {}, required: [], additionalProperties: false } } };
  const toolPrompt = 'Use the read-only demo cash summary tool. After its result, return exactly one JSON object with only currency and net_cash_movement_minor_units, copied exactly from the tool result as strings. No conversion, calculations, prose or Markdown. Application code formats the amount.';
  const messages: any[] = [{ role: 'user', content: toolPrompt }];
  const toolStart = performance.now();
  const first = await request('/chat/completions', { model: TEXT_MODEL, messages, tools: [tool], tool_choice: { type: 'function', function: { name: 'get_demo_cash_summary' } }, temperature: 0, max_completion_tokens: 256, stream: false });
  const calls = first.data?.choices?.[0]?.message?.tool_calls;
  assert(Array.isArray(calls) && calls.length === 1, 'expected_single_tool_call');
  const call = calls[0];
  assert(call?.type === 'function' && call?.function?.name === 'get_demo_cash_summary', 'expected_named_read_only_tool_call');
  assert(typeof call.id === 'string' && call.id.length > 0, 'missing_tool_call_id');
  assert(typeof call.function.arguments === 'string' && call.function.arguments.length > 0, 'missing_tool_arguments');
  const args = parseObject(call.function.arguments);
  assert(Object.keys(args).length === 0, 'unexpected_tool_arguments');
  const fixtureResult = { currency: 'PKR', net_cash_movement_minor_units: '310000', synthetic_record_count: 2, source_ids: ['demo-inflow-01', 'demo-outflow-01'] };
  log({ probe: 'local_read_only_tool_call', status: 'tool_call_validated_and_executed_locally', model: TEXT_MODEL, request_mode: 'chat.completions:local_tool_calling', tool_name: call.function.name, validated_arguments: args, local_execution: 'fixed_synthetic_fixture_only', result_returned: fixtureResult, request_settings: { temperature: 0, max_completion_tokens: 256, stream: false, forced_named_tool: true, response_format: false, automatic_retries: 0 }, usage: first.data.usage ?? null, duration_ms: first.duration_ms, headers: first.headers });
  messages.push(first.data.choices[0].message, { role: 'tool', tool_call_id: call.id, content: JSON.stringify(fixtureResult) });
  const second = await request('/chat/completions', { model: TEXT_MODEL, messages, tools: [tool], tool_choice: 'none', temperature: 0, max_completion_tokens: 256, stream: false });
  const answer = second.data?.choices?.[0]?.message?.content;
  assert(typeof answer === 'string', 'missing_final_tool_response');
  // Log provider metadata before validation, so failures retain their evidence.
  log({ probe: 'tool_final_response', model: TEXT_MODEL, prompt_sha256: hash(toolPrompt), final_response: answer, usage: second.data.usage ?? null, duration_ms: second.duration_ms, headers: second.headers });
  assert(second.data?.choices?.[0]?.finish_reason === 'stop', 'incomplete_tool_completion');
  const echoed = parseObject(answer);
  assert(Object.keys(echoed).sort().join(',') === 'currency,net_cash_movement_minor_units', 'unexpected_tool_result_fields');
  assert(echoed.currency === fixtureResult.currency && echoed.net_cash_movement_minor_units === fixtureResult.net_cash_movement_minor_units, 'tool_result_did_not_match_fixture');
  const minor = BigInt(fixtureResult.net_cash_movement_minor_units);
  const rendered = `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`;
  log({ probe: 'local_read_only_tool_call', status: 'pass', model: TEXT_MODEL, validated_result: echoed, code_rendered_cash_movement: `${fixtureResult.currency} ${rendered}`, requests_used: 2, automatic_retries: 0, probe_elapsed_ms: Math.round(performance.now() - toolStart) });
}

main().catch((error: any) => {
  log({ status: 'failed', error_type: error?.name === 'TimeoutError' ? 'timeout' : error?.provider_code ?? error?.message ?? 'unknown', http_status: error?.status ?? null });
  process.exitCode = 1;
});
