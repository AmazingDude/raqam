import test from 'node:test';
import assert from 'node:assert/strict';
import type { CategoryBatchResult } from '../../src/lib/ai/categories.ts';
import { CATEGORY_GUIDE_VERSION } from '../../src/lib/ai/prompts/categories.ts';
import { categoryPersistenceCommand } from '../../src/lib/server/categories.ts';

const transactionId='22222222-2222-4222-8222-222222222222';
const sourceId='33333333-3333-4333-8333-333333333333';
const requestId='44444444-4444-4444-8444-444444444444';

test('category persistence binds the reviewed guide to provenance and stores only unreviewed proposals',()=>{
  const generated:CategoryBatchResult={ok:true,items:[{
    transactionId,transactionVersion:3,category:'uncategorized',status:'needs_review',
    rationale:'The row does not identify its business purpose.',categoryGuideVersion:CATEGORY_GUIDE_VERSION,
    evidence:{transactionId,source:{sourceId,rowNumber:2}},
  }],provenance:{providerVersion:'groq-provider-v1',modelVersion:'openai/gpt-oss-20b',promptVersion:'transaction-categories-v1',schemaVersion:'transaction-category-batch-v1',categoryGuideVersion:CATEGORY_GUIDE_VERSION},metadata:null};
  const command=categoryPersistenceCommand(requestId,generated);
  assert.ok(command);
  assert.equal(command.provenance.promptVersion,`transaction-categories-v1+${CATEGORY_GUIDE_VERSION}`);
  assert.equal(command.provenance.modelVersion,'groq-provider-v1/openai/gpt-oss-20b');
  assert.deepEqual(command.proposals,[{transactionId,transactionVersion:3,category:'uncategorized',status:'needs_review',rationale:'The row does not identify its business purpose.'}]);
  assert.equal(JSON.stringify(command).includes(sourceId),false,'source locator remains tied to the canonical transaction instead of model-supplied persistence fields');
});

test('category generation with no eligible records produces no database command',()=>{
  const generated:CategoryBatchResult={ok:true,items:[{
    transactionId,transactionVersion:3,status:'skipped',reason:'accepted_category',
  }],provenance:null,metadata:null};
  assert.equal(categoryPersistenceCommand(requestId,generated),null);
});
