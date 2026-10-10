import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createAIProvider } from '../../src/lib/ai/index.ts';
import type { ToolConversationRequest } from '../../src/lib/ai/index.ts';

const key='synthetic-claude-key-never-return';
const env={AI_PROVIDER:'claude',CLAUDE_API_KEY:key,CLAUDE_TEXT_MODEL:'claude-test',CLAUDE_VISION_MODEL:'claude-vision-test'};
const context=()=>({requestId:'c117073e-87be-4261-a510-7b1de22c0e16',deadlineAtMs:Date.now()+5000});
const response=(content:unknown[],stop_reason='end_turn')=>Response.json({content,stop_reason,usage:{input_tokens:12,output_tokens:5}});
test('Claude BYOK validates structured text output with key sent only in a server request header',async()=>{
  let url='',headers=new Headers(),body:Record<string,unknown>={};
  const provider=createAIProvider({environment:()=>env,fetch:async(input,init)=>{url=String(input);headers=new Headers(init?.headers);body=JSON.parse(String(init?.body)) as Record<string,unknown>;return response([{type:'text',text:'{"status":"ok"}'}]);}});
  const result=await provider.requestTextProposal({prompt:'Return status ok.',versions:{prompt:'claude-test-v1',schema:'claude-schema-v1'},schema:z.strictObject({status:z.literal('ok')})},context());
  assert.equal(result.ok,true);assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(headers.get('x-api-key'),key);
  assert.equal((body.output_config as {format:{type:string}}).format.type,'json_schema');assert.equal(JSON.stringify(result).includes(key),false);
});
test('Claude tool use accepts only allowlisted schemas and returns tool results in user content blocks',async()=>{
  let body:Record<string,unknown>={};const provider=createAIProvider({environment:()=>env,fetch:async(_input,init)=>{
    body=JSON.parse(String(init?.body)) as Record<string,unknown>;
    return response([{type:'tool_use',id:'call-1',name:'get_cash_summary',input:{scope:'valid_imported_cash'}}],'tool_use');
  }});
  const input:ToolConversationRequest={messages:[{role:'system',content:'Use tools safely.'},{role:'user',content:'Summarize.'}],tools:[{name:'get_cash_summary',description:'Read the exact summary.'}],choice:'auto',versions:{prompt:'claude-test-v1',schema:'claude-schema-v1'}};
  const result=await provider.requestToolConversation(input,context());assert.equal(result.ok,true);
  if(result.ok){assert.deepEqual(result.output,{content:null,toolCalls:[{id:'call-1',name:'get_cash_summary',arguments:'{"scope":"valid_imported_cash"}'}]});}
  input.messages=[...input.messages,{role:'assistant',content:null,toolCalls:[{id:'call-1',name:'get_cash_summary',arguments:'{"scope":"valid_imported_cash"}'}]},{role:'tool',callId:'call-1',content:'Synthetic PKR summary.'}];
  const turn=await provider.requestToolConversation(input,context());assert.equal(turn.ok,true);
  const messages=body.messages as Array<{role:string;content:unknown}>;const last=messages.at(-1);
  assert.equal(last?.role,'user');assert.equal((last?.content as Array<{type:string;tool_use_id:string}>)[0]?.type,'tool_result');
});
