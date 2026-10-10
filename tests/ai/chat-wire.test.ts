import test from 'node:test';
import assert from 'node:assert/strict';
import { chatDraftWireSchema,parseChatDraft } from '../../src/lib/contracts/chat.ts';
import { createGeminiProvider } from '../../src/lib/ai/gemini.ts';
test('chat planner wire schema reaches Gemini and decodes to validated cash actions',async()=>{
 const draft={kind:'changes',text:'Review changes',actions:[{kind:'create_cash',transactionId:null,values:{date:'2026-09-01',description:'Rent',direction:'out',amount:'30000',reference:null,category:null,counterAccountId:null,clearCategory:false,clearReference:false},entryDate:null,description:null,reversalOfId:null,lines:[]}]};
 let called=false;
 const provider=createGeminiProvider({environment:()=>({GEMINI_API_KEY:'synthetic-key',GEMINI_TEXT_MODEL:'gemini-test-text',GEMINI_VISION_MODEL:'gemini-test-vision'}),fetch:async(_input,init)=>{called=true;const body=JSON.parse(String(init?.body));assert.equal(body.generationConfig.responseJsonSchema.type,'object');return Response.json({candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify(draft)}]}}]});}});
 const result=await provider.requestTextProposal({prompt:'Prepare synthetic typed history.',schema:chatDraftWireSchema,versions:{prompt:'chat-bookkeeping-v1',schema:'chat-draft-v1'}},{requestId:'10000000-0000-4000-8000-000000000001',deadlineAtMs:Date.now()+5000});
 assert.equal(called,true);assert.equal(result.ok,true);if(result.ok)assert.equal(parseChatDraft(result.output).actions[0]!.kind,'create_cash');
 assert.throws(()=>parseChatDraft({...draft,actions:[{...draft.actions[0],values:null}]}));
});
