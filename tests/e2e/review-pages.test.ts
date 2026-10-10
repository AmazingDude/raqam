import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProposalPages } from '../../src/lib/client/review-pages.ts';
import { proposalRecordSchema } from '../../src/lib/contracts/proposals.ts';

const workspaceId='60000000-0000-4000-8000-000000000001';
function fixture(index:number,reviewVersion=0,status:'proposed'|'accepted'='proposed') {
  return proposalRecordSchema.parse({id:`60000000-0000-4000-8000-${String(index).padStart(12,'0')}`,workspaceId,
    transactionId:'60000000-0000-4000-8000-000000000002',transactionVersion:0,reviewVersion,status,rationale:'Synthetic category observation',
    suggestion:{kind:'category',category:'travel'},provenance:{modelVersion:'synthetic-model',promptVersion:'synthetic-v1',schemaVersion:'synthetic-v1'}});
}

test('overlapping category pages reach records beyond 50 and retain newer accepted decisions',()=>{
  const first=Array.from({length:50},(_,index)=>fixture(index+10));
  first[0]=fixture(10,2,'accepted');
  const next=[fixture(10),...Array.from({length:15},(_,index)=>fixture(index+60))];
  const merged=mergeProposalPages(first,next,workspaceId);
  assert.equal(merged.length,65);
  assert.equal(merged[0]!.status,'accepted');assert.equal(merged[0]!.reviewVersion,2);
  assert.equal(new Set(merged.map(record=>record.id)).size,65);
  assert.equal(mergeProposalPages(merged,[fixture(61,1,'accepted')],workspaceId).find(record=>record.id===fixture(61).id)!.status,'accepted');
  assert.equal(first.length,50,'page merge does not mutate the existing snapshot');
});

test('foreign workspace pages fail closed without changing the current review snapshot',()=>{
  const existing=[fixture(10)];
  assert.throws(()=>mergeProposalPages(existing,[{...fixture(11),workspaceId:'60000000-0000-4000-8000-000000000099'}],workspaceId),/another workspace/);
  assert.deepEqual(existing,[fixture(10)]);
});
