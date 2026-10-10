import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideStatementHeader } from '../../src/lib/server/statement-header-decision.ts';
const headers=['Date','Narrative Details','Inst. No.','Debit','Credit','Balance'];
const environment=()=>({ASSISTANT_PROVIDER:'eve',RUNA_CLOUD_KEY:'synthetic-test-key'});
test('Eve selects a bounded header option using only labels and one shared-budget attempt', async () => {
  let calls=0,releases=0;
  const map=await decideStatementHeader(headers,undefined,{environment,budget:{acquire:()=>()=>{releases++;}},
    fetch:async(_url,init)=>{calls++;const body=JSON.parse(String(init!.body));
      assert.deepEqual(JSON.parse(body.input),{tableHeaders:headers});assert.equal(body.questions.length,1);
      assert.deepEqual(body.questions[0].options,[{name:'column_1'},{name:'unknown'}]);
      return Response.json({object:'decisions',model:'eve',prompt_format_version:3,answers:{description:{type:'choice',choice:'column_1',label_mass:1,probabilities:{column_1:0.99,unknown:0.01}}}});
    }});
  assert.equal(map?.description,1);assert.equal(map?.debit,3);assert.equal(map?.credit,4);
  assert.equal(calls,1);assert.equal(releases,1);
});
test('unknown, weak, forged, rate-limited and exhausted Eve choices never map a column or retry', async () => {
  for(const response of [Response.json({object:'decisions',model:'eve',prompt_format_version:3,answers:{description:{type:'choice',choice:'column_1',label_mass:1,probabilities:{column_1:0.6,unknown:0.4}}}}),
    Response.json({object:'decisions',model:'eve',prompt_format_version:3,answers:{description:{type:'choice',choice:'column_9',label_mass:1,probabilities:{column_1:0.99,unknown:0.01}}}}),new Response('',{status:429})]){
    let calls=0;
    assert.equal(await decideStatementHeader(headers,undefined,{environment,budget:{acquire:()=>()=>{}},fetch:async()=>{calls++;return response;}}),undefined);
    assert.equal(calls,1);
  }
  assert.equal(await decideStatementHeader(headers,undefined,{environment,budget:{acquire:()=>null},fetch:async()=>{throw new Error('Must not call');}}),undefined);
  assert.equal(await decideStatementHeader(['Date','ACCOUNT 12345678','Debit','Credit'],undefined,{environment,fetch:async()=>{throw new Error('Private values must not be sent');}}),undefined);
});
