import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the CLI with only its external fetch replaced. Never load .env.local.
function runProbe(options: { args?: string; answer?: string; status?: number; remaining?: string; multiple?: boolean; missingId?: boolean; missingCapacity?: boolean } = {}) {
  const folder = mkdtempSync(join(tmpdir(), 'raqam-proof-test-'));
  const preload = join(folder, 'fetch.mjs');
  const fixture = { currency: 'PKR', net_cash_movement_minor_units: '310000' };
  writeFileSync(preload, `
    let count = 0;
    process.on('exit', () => console.error(JSON.stringify({scripted_fetch_count:count})));
    const options = ${JSON.stringify(options)};
    globalThis.fetch = async (_url, init) => {
      count++;
      const body = JSON.parse(init.body);
      if (body.response_format) throw new Error('tool_probe_combined_schema_mode');
      if (options.status) return new Response(JSON.stringify({error:{code:'synthetic_failure'}}), {status:options.status});
      const call = {id: options.missingId ? '' : 'synthetic_call', type:'function', function:{name:'get_demo_cash_summary',arguments:options.args ?? '{}'}};
      const message = count === 1 ? {role:'assistant',content:null,tool_calls:options.multiple ? [call,call] : [call]} : {role:'assistant',content:options.answer ?? ${JSON.stringify(JSON.stringify(fixture))}};
      if (count === 2) {
        const result = JSON.parse(body.messages.at(-1).content);
        if (result.currency !== 'PKR' || result.net_cash_movement_minor_units !== '310000' || body.messages.at(-1).tool_call_id !== 'synthetic_call') throw new Error('tool_result_protocol_mismatch');
      }
      const headers = {'content-type':'application/json','x-ratelimit-limit-requests':'1000','x-ratelimit-limit-tokens':'8000'};
      if (!options.missingCapacity) headers['x-ratelimit-remaining-requests'] = options.remaining ?? '999';
      return new Response(JSON.stringify({choices:[{finish_reason:count===1 ? 'tool_calls' : 'stop',message}]}), {headers});
    };
  `, { mode: 0o600 });
  try {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '--import', preload, resolve('tests/ai/live/feasibility.ts'), '--probe=tool'], {
      env: { ...process.env, GROQ_API_KEY: 'synthetic-proof-test-key' }, encoding: 'utf8', timeout: 5000,
    });
    assert.ifError(result.error);
    const records = result.stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
    const counts = result.stderr.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
    return { exit: result.status, records, calls: counts.at(-1)?.scripted_fetch_count };
  } finally { rmSync(folder, { recursive: true, force: true }); }
}

test('valid tool round preserves exact minor units and code renders PKR', () => {
  const result = runProbe();
  assert.equal(result.exit, 0);
  assert.equal(result.calls, 2);
  assert.equal(result.records.at(-1).code_rendered_cash_movement, 'PKR 3100.00');
  assert.equal(result.records.at(-1).status, 'pass');
});

for (const args of ['[]', '0', 'null', '""', '', '{"ownerId":"foreign"}']) {
  test(`invalid tool arguments are rejected before fixture execution: ${args || 'empty'}`, () => {
    const result = runProbe({ args });
    assert.equal(result.exit, 1);
    assert.equal(result.calls, 1);
    assert.equal(result.records.some(record => record.status === 'tool_call_validated_and_executed_locally'), false);
  });
}

for (const answer of [
  '{"currency":"PKR","net_cash_movement_minor_units":"31000000"}',
  '{"currency":"USD","net_cash_movement_minor_units":"310000"}',
  'PKR 310000.00', 'The total is not 3100',
  '{"currency":"PKR","net_cash_movement_minor_units":"310000","extra":true}',
]) {
  test(`incorrect or ambiguous final response fails closed: ${answer}`, () => {
    const result = runProbe({ answer });
    assert.equal(result.exit, 1);
    assert.equal(result.calls, 2);
    assert.equal(result.records.at(-1).status, 'failed');
    assert.equal(result.records.some(record => record.probe === 'tool_final_response'), true);
  });
}

for (const options of [{ multiple: true }, { missingId: true }, { status: 429 }, { remaining: '60' }, { missingCapacity: true }]) {
  test(`protocol/provider/quota failure is bounded: ${JSON.stringify(options)}`, () => {
    const result = runProbe(options);
    assert.equal(result.exit, 1);
    assert.equal(result.calls, 1);
  });
}
