import test from 'node:test';
import assert from 'node:assert/strict';
import { AnswerSession } from '../../src/lib/ai/answer.ts';
import { AssistantFactRegistry } from '../../src/lib/ai/fact-registry.ts';
import { workspaceId, scopedTools, transaction, id } from './fixtures/assistant.ts';

test('C answer formats exact backend facts and reporting scope without model-authored numbers', async () => {
  const session = new AnswerSession(workspaceId);
  const args = { scope: 'valid_imported_cash', dateFrom: '2026-10-01', dateTo: '2026-10-31' };
  const observation = session.register('get_cash_summary', args, await scopedTools().get_cash_summary(args));
  const fact = observation.facts.find(fact => fact.metric === 'net_movement_minor')!;
  const answer = session.render({ kind: 'answer', blocks: [{ type: 'fact', observationId: observation.observationId, factId: fact.id, template: fact.metric }] });
  assert.equal(answer.status, 'answered'); assert.match(answer.text, /90071992547409\.93/);
  assert.match(answer.text, /2026-10-01 through 2026-10-31/);
  assert.equal(answer.facts.find(fact => fact.metric === 'net_movement_minor')!.value, '9007199254740993');
  assert.deepEqual(answer.facts[0]!.sourceTransactionIds, [id(1)]);
  assert.throws(() => session.render({ kind: 'answer', blocks: [{ type: 'fact', observationId: observation.observationId, factId: fact.id, template: fact.metric, value: '9' }] }));
});

test('C partial pages register page counts only; complete summary can cover more than 50 sources', async () => {
  const session = new AnswerSession(workspaceId), tools = scopedTools(Array.from({ length: 60 }, (_, i) => transaction(i + 1, { amountMinor: '17' })));
  const page = session.register('list_transactions', { limit: 1, dateFrom: '2026-10-01' }, await tools.list_transactions({ limit: 1, dateFrom: '2026-10-01' }));
  assert.deepEqual(page.facts.map(fact => fact.metric), ['listed_transaction_count']);
  const answer = session.render({ kind: 'answer', blocks: [{ type: 'fact', observationId: page.observationId, factId: page.facts[0]!.id, template: 'listed_transaction_count' }] });
  assert.equal(answer.status, 'partial'); assert.equal(answer.facts[0]!.value, '1'); assert.equal(answer.facts[0]!.scope.dateFrom, '2026-10-01');
  const summary = session.register('get_cash_summary', { scope: 'valid_imported_cash' }, await tools.get_cash_summary({ scope: 'valid_imported_cash' }));
  const complete = session.render({ kind: 'answer', blocks: [{ type: 'fact', observationId: summary.observationId, factId: summary.facts[0]!.id, template: 'recorded_inflow_minor' }] });
  const fact = complete.facts.find(fact => fact.metric === 'recorded_inflow_minor')!;
  assert.equal(fact.value, '1020'); assert.equal(fact.complete, true); assert.equal(fact.sourcesComplete, false); assert.equal(fact.sourceTransactionIds.length, 50);
});

test('C rejects foreign facts, wrong observation scope, changed labels and arbitrary citations', async () => {
  const session = new AnswerSession(workspaceId), tools = scopedTools();
  const summary = session.register('get_cash_summary', { scope: 'valid_imported_cash' }, await tools.get_cash_summary({ scope: 'valid_imported_cash' }));
  const page = session.register('list_transactions', {}, await tools.list_transactions({}));
  for (const block of [
    { type: 'fact', observationId: summary.observationId, factId: id(999), template: 'net_movement_minor' },
    { type: 'fact', observationId: page.observationId, factId: summary.facts[0]!.id, template: summary.facts[0]!.metric },
    { type: 'fact', observationId: summary.observationId, factId: summary.facts[0]!.id, template: 'transaction_count' },
    { type: 'records', observationId: page.observationId, referenceIds: [id(999)], heading: 'consulted_records' },
    { type: 'explanation', observationId: page.observationId, template: 'documents_do_not_prove_settlement' },
  ]) assert.throws(() => session.render({ kind: 'answer', blocks: [block] }));
});

test('C status headings cannot relabel accepted records as pending; source locators remain verified', async () => {
  const session = new AnswerSession(workspaceId), tools = scopedTools([transaction(1, { category: 'customer_receipts', categoryStatus: 'accepted', matchStatus: 'accepted' })]);
  const page = session.register('list_transactions', {}, await tools.list_transactions({}));
  const block = { type: 'records', observationId: page.observationId, referenceIds: [page.references[0]!.referenceId], heading: 'needs_category_review' };
  assert.throws(() => session.render({ kind: 'answer', blocks: [block] }));
  const answer = session.render({ kind: 'answer', blocks: [{ ...block, heading: 'consulted_records' }] });
  assert.deepEqual(answer.references[0]!.source, transaction().source);
  assert.equal(answer.references[0]!.snapshot.workspaceId, workspaceId);
});

test('C rejects malformed summaries, wrong currency/workspace, invalid references and history', async () => {
  const tools = scopedTools(); const summary = await tools.get_cash_summary({ scope: 'valid_imported_cash' });
  for (const mutate of [
    (value: typeof summary) => { value.summary.netMovementMinor = '1'; },
    (value: typeof summary) => { value.dateFrom = '2026-09-01'; },
    (value: typeof summary) => { value.snapshot.workspaceId = 'foreign'; },
    (value: typeof summary) => { Object.assign(value.summary, { currency: 'USD' }); },
    (value: typeof summary) => { value.complete = false as true; },
    (value: typeof summary) => { value.summary.unreviewed.inflowMinor = '1'; },
  ]) { const raw = structuredClone(summary); mutate(raw); assert.throws(() => new AnswerSession(workspaceId).register('get_cash_summary', { scope: 'valid_imported_cash' }, raw)); }
  const evidence = await tools.get_record_evidence({ transactionIds: [id(1)] });
  evidence.history.items[0]!.id = id(999);
  assert.throws(() => new AnswerSession(workspaceId).register('get_record_evidence', { transactionIds: [id(1)] }, evidence));
  const page = await tools.list_transactions({}); page.items[0]!.source.rowNumber = 1;
  assert.throws(() => new AnswerSession(workspaceId).register('list_transactions', {}, page));
});

test('C detects changed singleton snapshots and discards stale financial facts', async () => {
  const session = new AnswerSession(workspaceId);
  session.register('list_transactions', {}, await scopedTools().list_transactions({}));
  await assert.rejects(async () => session.register('get_cash_summary', { scope: 'valid_imported_cash' }, await scopedTools([transaction(1, { amountMinor: '7' })]).get_cash_summary({ scope: 'valid_imported_cash' })));
  const answer = session.fallback('unavailable'); assert.equal(answer.status, 'unavailable');
  assert.deepEqual(answer.facts, []); assert.deepEqual(answer.snapshots, []); assert.match(answer.text, /snapshot changed/);
});

test('C evidence selections may differ without false stale detection; changed overlapping records fail', async () => {
  const session = new AnswerSession(workspaceId), tools = scopedTools([transaction(), transaction(2, { amountMinor: '10' })]);
  session.register('list_transactions', {}, await tools.list_transactions({}));
  session.register('get_record_evidence', { transactionIds: [id(1)] }, await tools.get_record_evidence({ transactionIds: [id(1)] }));
  session.register('get_record_evidence', { transactionIds: [id(2)] }, await tools.get_record_evidence({ transactionIds: [id(2)] }));
  const changed = await scopedTools([transaction(1, { matchStatus: 'accepted' })]).get_record_evidence({ transactionIds: [id(1)] });
  assert.throws(() => session.register('get_record_evidence', { transactionIds: [id(1)] }, changed));
  assert.deepEqual(session.fallback('unavailable').facts, []);
});

test('C registry failed registration is atomic and returned facts cannot mutate internal values', async () => {
  const registry = new AssistantFactRegistry(); const snapshot = { workspaceId, token: 'a'.repeat(64), sources: ['cashbook'] };
  assert.throws(() => registry.register('get_cash_summary', { records: [], citations: [], partial: false, details: { result: { snapshot, summary: {} } } }));
  assert.deepEqual(registry.snapshots(), []); assert.deepEqual(registry.all(), []);
  const facts = registry.register('list_transactions', { records: [], citations: [], partial: false, details: { result: { snapshot } } });
  facts[0]!.value = '999'; assert.equal(registry.all()[0]!.value, '0');
});
