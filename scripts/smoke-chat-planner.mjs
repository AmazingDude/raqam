// Synthetic inputs only. No database reads/writes or private history.
// Run with node --env-file-if-exists=.env.local --conditions=react-server scripts/smoke-chat-planner.mjs
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAIProvider} from '../src/lib/ai/index.ts';
import {chatDraftWireSchema,parseChatDraft} from '../src/lib/contracts/chat.ts';
import {buildChatPlan,CHAT_PLANNER_PROMPT} from '../src/lib/server/assistant/chat.ts';
const workspaceId='10000000-0000-4000-8000-000000000001';
const ledger={accounts:[],journals:[],coverage:{workspaceId,selectedFrom:'2026-01-01',selectedThrough:'2026-12-31',availableFrom:null,availableThrough:null,isComplete:false,missingSourceKinds:[],unsupportedOpeningBalanceAccountIds:[]}};
for(const providerName of ['groq','gemini']){
 const provider=createAIProvider({environment:()=>({...process.env,AI_PROVIDER:providerName})});
 for(const [scenario,message,complete] of [
  ['complete history','On 2026-09-01 I paid rent of PKR 30000. On 2026-09-02 I received PKR 75000 from a client.',true],
  ['missing year','I paid rent of PKR 30000 on September 1.',false],
 ]){
  const result=await provider.requestTextProposal({prompt:`${CHAT_PLANNER_PROMPT}\nWORKSPACE DATA:\n${JSON.stringify({history:[],records:[],accounts:[],journals:[]})}\nCURRENT HUMAN MESSAGE:\n${message}`,schema:chatDraftWireSchema,versions:{prompt:'chat-bookkeeping-v1',schema:'chat-draft-v1'}},{requestId:randomUUID(),deadlineAtMs:Date.now()+45000,signal:AbortSignal.timeout(45000)});
  if(!result.ok)throw new Error(`${providerName}: ${scenario}: ${result.error.reason}`);
  const built=buildChatPlan(parseChatDraft(result.output),new Map(),ledger,message);
  if(complete&&!built.plan)console.log(JSON.stringify({provider:providerName,scenario,syntheticDraft:result.output,clarification:built.clarification}));
  if(complete){assert.equal(built.plan?.actions.length,2);assert.deepEqual(built.plan.actions.map(a=>a.kind==='create_cash'?a.values.amountMinor:null),['3000000','7500000']);}
  else assert.equal(built.plan,null,'Missing year must not produce a saveable plan');
  console.log(JSON.stringify({provider:providerName,scenario,passed:true,model:result.metadata.model,attempts:result.metadata.attempts,durationMs:result.metadata.durationMs}));
 }
}
