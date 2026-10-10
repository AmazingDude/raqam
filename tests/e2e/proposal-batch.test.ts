import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryPreparationBatch } from '../../src/lib/client/proposal-batch.ts';
import { exampleTransactions } from '../../src/lib/client/examples.ts';
import type { ProposalRecord } from '../../src/lib/contracts/proposals.ts';

test('category preparation excludes accepted/pending records, deduplicates IDs and preserves 10-record batches', () => {
  const records = Array.from({ length: 75 }, (_, index) => ({ ...exampleTransactions()[4]!, id:`synthetic-${index}` }));
  records[0]!.categoryStatus = 'accepted';
  const proposals = [{transactionId:'synthetic-1',status:'proposed',suggestion:{kind:'category',category:'travel'}}] as ProposalRecord[];
  const before = JSON.stringify(records);
  const batch = categoryPreparationBatch([...records,records[2]!], proposals);
  assert.equal(batch.transactionIds.length, 10); assert.equal(batch.remainingLoadedCount, 63);
  assert.equal(new Set(batch.transactionIds).size, 10);
  assert.ok(!batch.transactionIds.includes('synthetic-0')); assert.ok(!batch.transactionIds.includes('synthetic-1'));
  assert.equal(JSON.stringify(records), before, 'selection does not mutate accepted decisions or record amounts');
  assert.deepEqual(categoryPreparationBatch([records[0]!,records[1]!], proposals), {transactionIds:[],remainingLoadedCount:0});
});
