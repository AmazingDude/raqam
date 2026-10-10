import test from 'node:test';
import assert from 'node:assert/strict';
import { AssistantFactRegistry } from '../../src/lib/ai/fact-registry.ts';

function registry() {
  let sequence = 0;
  return new AssistantFactRegistry(() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`);
}
const snapshot = { workspaceId: 'w1', token: 'a'.repeat(64), sources: ['cashbook'] as const };

test('fact registry binds exact summary values to the validated range and source set', () => {
  const facts = registry().register('get_cash_summary', {
    text: 'trusted tool output', records: [], citations: [], partial: false,
    details: { result: { summary: { inflowMinor: '25000', outflowMinor: '7000', netMovementMinor: '18000', currency: 'PKR',
      transactionCount: 2, transactionIds: ['t1', 't2'], unresolvedImportRowCount: 1, categories: {}, unreviewed: {} },
      dateFrom: '2026-10-01', dateTo: '2026-10-31', unresolvedImportRowScope: 'workspace', snapshot,
      returnedCount: 2, totalCount: 2, complete: true, nextCursor: null } },
  });
  assert.deepEqual(facts.map(fact => [fact.metric, fact.value]), [
    ['recorded_inflow_minor', '25000'], ['recorded_outflow_minor', '7000'], ['net_movement_minor', '18000'],
    ['transaction_count', '2'], ['workspace_unresolved_import_rows', '1'],
  ]);
  assert.ok(facts.every(fact => fact.complete && fact.sourcesComplete));
  assert.deepEqual(facts[0]?.scope, { dateFrom: '2026-10-01', dateTo: '2026-10-31', unresolvedImportRowScope: null });
  assert.deepEqual(facts[0]?.sourceTransactionIds, ['t1', 't2']);
  assert.deepEqual(facts[0]?.snapshot, snapshot);
  assert.deepEqual(facts[4]?.scope, { dateFrom: null, dateTo: null, unresolvedImportRowScope: 'workspace' });
});

test('fact registry marks partial counts and rejects malformed result provenance', () => {
  const facts = registry().register('get_review_queue', {
    text: 'trusted tool output', records: [], citations: [], partial: true,
    details: { result: { totalCount: 7, nextCursor: 't1', kind: 'unreviewed_categories', snapshot } },
  });
  assert.equal(facts[0]?.value, '7');
  assert.equal(facts[0]?.complete, false);
  assert.throws(() => registry().register('get_cash_summary', {
    records: [], citations: [], partial: false, details: { result: { summary: { netMovementMinor: 'model invented 7' }, snapshot } },
  }), /could not be verified/);
});
