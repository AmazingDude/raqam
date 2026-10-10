import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEveAssistant } from '../../src/lib/ai/eve.ts';
import { createEveBudget } from '../../src/lib/ai/eve-budget.ts';
import { createAIProvider } from '../../src/lib/ai/factory.ts';
import { createAssistantTools } from '../../src/lib/server/assistant/full-tools.ts';
import { runAssistant } from '../../src/lib/server/assistant/engine.ts';
import { transaction } from './fixtures.ts';
import type { ToolConversationRequest } from '../../src/lib/ai/provider.ts';

const requestId = '20000000-0000-4000-8000-000000000001';
const context = () => ({ requestId, deadlineAtMs: Date.now() + 10_000 });

test('Eve usage guard caps attempts at 20/day, limits concurrency and fails closed on unsafe settings', () => {
  let now = 0;
  const budget = createEveBudget(() => now);
  for (const setting of ['-1','21','invalid','1.5','0']) assert.equal(budget.acquire(setting),null);
  const first = budget.acquire(undefined); assert.ok(first);
  assert.equal(budget.acquire(undefined),null); first(); first();
  for (let i=1;i<20;i++) { const release = budget.acquire(undefined); assert.ok(release); release(); }
  assert.equal(budget.acquire(undefined),null);
  now = 86_400_000;
  const nextDay = budget.acquire('1'); assert.ok(nextDay); nextDay();
  assert.equal(budget.acquire('1'),null);
});
const routes = ['summary','categories','receipts','documents','transactions','evidence','greeting','clarify','scope'];
function reply(choice = 'summary', probability = 0.99) {
  return Response.json({ object:'decisions',model:'eve',prompt_format_version:3,
    answers:{route:{type:'choice',choice,label_mass:1,probabilities:Object.fromEntries(routes.map(name => [name,name === choice ? probability : (1-probability)/8]))}} });
}
function input(question: string): ToolConversationRequest {
  return {messages:[{role:'user',content:question}],tools:[{name:'get_cash_summary',description:'Summary'},{name:'get_review_queue',description:'Review'}],choice:'auto',versions:{prompt:'assistant-prompt-v1',schema:'assistant-answer-v1'}};
}

test('Eve routes through verified whole-workspace summaries, keeps one billed request and bounds source records', async () => {
  let requests = 0;
  const provider = createAIProvider({environment:() => ({ASSISTANT_PROVIDER:'eve',RUNA_CLOUD_KEY:'synthetic-eve-key'}),fetch:async (url, options) => {
    requests++;
    assert.equal(url,'https://inference.runanywhere.ai/v1/decisions');
    const body = JSON.parse(options!.body as string);
    assert.equal(body.model,'eve'); assert.equal(body.prompt_format_version,3); assert.equal(body.questions.length,1);
    assert.equal(body.input,'What is our net cash movement?');
    return reply();
  }});
  const records = Array.from({length:120},(_,n) => transaction({id:`00000000-0000-4000-8000-${String(n+1).padStart(12,'0')}`,amountMinor:'2550',source:{sourceId:'s1',rowNumber:n+2}}));
  const deadlineAt = Date.now()+10_000;
  const tools = createAssistantTools({workspaceId:'w1',deadlineAt,readSnapshot:async () => ({records,unresolvedImportRowCount:0}),readDocuments:async () => [],readHistory:async () => ({items:[],partial:false})});
  const result = await runAssistant({question:'What is our net cash movement?',workspaceId:'w1',requestId,deadlineAt,provider,tools});
  assert.equal(requests,1); assert.match(result.text,/across 120 transactions/); assert.match(result.text,/3,060\.00|3060\.00/);
  assert.equal(result.records.length,50); assert.equal(result.actionTrail[0]?.tool,'get_cash_summary');
  const queue = await tools.get_review_queue({kind:'unmatched_records',limit:50});
  assert.match(queue.text,/120 of 120/); assert.equal(queue.partial,true);
  const evidence = await tools.get_record_evidence({transactionIds:[records[119]!.id],documentIds:[]});
  assert.equal(evidence.records[0]?.id,records[119]!.id);
});

test('Eve validates date arguments and refuses ambiguous periods, weak decisions, or invented labels', async () => {
  let requests = 0;
  const provider = createEveAssistant({environment:() => ({RUNA_CLOUD_KEY:'synthetic'}),fetch:async () => {requests++;return reply();}});
  const dated = await provider.requestToolConversation(input('Net cash from 2026-10-01 to 2026-10-10'),context());
  assert.equal(dated.ok,true);
  if (dated.ok) assert.deepEqual(JSON.parse((dated.output as {toolCalls:{arguments:string}[]}).toolCalls[0]!.arguments),{scope:'valid_imported_cash',dateFrom:'2026-10-01',dateTo:'2026-10-10'});
  const ambiguous = await provider.requestToolConversation(input('What was net movement last month?'),context());
  assert.equal(ambiguous.ok,true); assert.equal(requests,1);
  const weak = createEveAssistant({environment:() => ({RUNA_CLOUD_KEY:'synthetic'}),fetch:async () => reply('summary',0.5)});
  const result = await weak.requestToolConversation(input('Cash totals'),context());
  assert.equal(result.ok,true); if (result.ok) assert.match((result.output as {content:string}).content,/clarify/);
  const forged = createEveAssistant({environment:() => ({RUNA_CLOUD_KEY:'synthetic'}),fetch:async () => reply('delete_records')});
  const rejected = await forged.requestToolConversation(input('Cash totals'),context());
  assert.equal(rejected.ok,false); if (!rejected.ok) assert.equal(rejected.error.reason,'invalid_model_output');
});

test('Eve missing keys, credit/auth denial, oversized output and cancellation fail safely', async () => {
  let requests = 0;
  const missing = createEveAssistant({environment:() => ({}),fetch:async () => {requests++;return reply();}});
  const result = await missing.requestToolConversation(input('Cash totals'),context()); assert.equal(result.ok,false); assert.equal(requests,0);
  for (const response of [new Response('private diagnostic',{status:403}),new Response('x'.repeat(65537))]) {
    const provider = createEveAssistant({environment:() => ({RUNA_CLOUD_KEY:'synthetic-secret'}),fetch:async () => response});
    const failed = await provider.requestToolConversation(input('Cash totals'),context());
    assert.equal(failed.ok,false); assert.ok(!JSON.stringify(failed).includes('private diagnostic')); assert.ok(!JSON.stringify(failed).includes('synthetic-secret'));
  }
  const controller = new AbortController(); controller.abort();
  const cancelled = await missing.requestToolConversation(input('Cash totals'),{...context(),signal:controller.signal});
  assert.equal(cancelled.ok,false); if (!cancelled.ok) assert.equal(cancelled.error.reason,'cancelled');
  const disabled = createEveAssistant({environment:() => ({RUNA_CLOUD_KEY:'synthetic',EVE_DAILY_REQUEST_LIMIT:'0'}),fetch:async () => {requests++;return reply();}});
  const capped = await disabled.requestToolConversation(input('Cash totals'),context());
  assert.equal(capped.ok,false); if (!capped.ok) assert.equal(capped.error.reason,'budget_exhausted');
  assert.equal(requests,0);
});
