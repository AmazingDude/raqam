import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteAIProviderConfig, getSelectedAIProviderConfig, listAIProviderConfigs, saveAIProviderConfig, selectedAIEnvironment, selectAIProviderConfig } from '../../src/lib/server/ai-provider-credentials.ts';
import type { RequestSession } from '../../src/lib/server/auth.ts';
import type { Workspace } from '../../src/lib/contracts/index.ts';
import { testAIProviderConnection } from '../../src/lib/server/ai-provider-check.ts';

const workspace={id:'10000000-0000-4000-8000-000000000001',ownerSubject:'owner-test',businessName:'Test books',currency:'PKR'} as Workspace;
function fixture(){
  const rows=new Map<string,Record<string,unknown>>();
  const session={subject:'owner-test',database:{rpc:async(name:string,args:Record<string,unknown>)=>{
    if(name==='list_ai_provider_configs')return {data:[...rows.values()].map(row=>({provider:row.provider,selected:row.selected,text_model:row.text_model,vision_model:row.vision_model,updated_at:'2026-10-10T00:00:00Z'})),error:null};
    const provider=String(args.p_provider),key=provider;
    if(name==='save_ai_provider_credential'){rows.set(key,{provider,key_ciphertext:args.p_key_ciphertext,key_nonce:args.p_key_nonce,key_tag:args.p_key_tag,text_model:args.p_text_model,vision_model:args.p_vision_model,selected:false});return {data:null,error:null};}
    if(name==='get_ai_provider_credential')return {data:rows.has(key)?[rows.get(key)]:[],error:null};
    if(name==='select_ai_provider'){for(const row of rows.values())row.selected=false;const row=rows.get(key);if(!row)return {data:null,error:{code:'P0002'}};row.selected=true;return {data:null,error:null};}
    if(name==='delete_ai_provider_credential'){rows.delete(key);return {data:null,error:null};}
    throw new Error('unexpected rpc');
  }}} as unknown as RequestSession;
  return {session,rows};
}
test('BYOK stores authenticated ciphertext, returns no secret in listing, and decrypts only server-side',async()=>{
  const previous=process.env.BYOK_ENCRYPTION_KEY;process.env.BYOK_ENCRYPTION_KEY=Buffer.alloc(32,9).toString('base64');
  try{
    const {session,rows}=fixture();
    const key='synthetic-gemini-key-without-spaces';
    const after=await saveAIProviderConfig(session,workspace,{provider:'gemini',apiKey:key,textModel:'gemini-test-text',visionModel:'gemini-test-vision'});
    assert.equal(after.selected,'gemini');
    const stored=rows.get('gemini');assert.ok(stored);assert.notEqual(stored.key_ciphertext,key);assert.ok(!JSON.stringify(after).includes(key));
    const loaded=await getSelectedAIProviderConfig(session,workspace);assert.equal(loaded?.apiKey,key);
    const environment=await selectedAIEnvironment(session,workspace,{});assert.equal(environment.AI_PROVIDER,'gemini');assert.equal(environment.GEMINI_API_KEY,key);
    const listing=await listAIProviderConfigs(session,workspace);assert.equal(listing.providers.find(row=>row.provider==='gemini')?.configured,true);
    await selectAIProviderConfig(session,workspace,'gemini');
    await deleteAIProviderConfig(session,workspace,'gemini');assert.equal((await listAIProviderConfigs(session,workspace)).selected,null);
  }finally{if(previous===undefined)delete process.env.BYOK_ENCRYPTION_KEY;else process.env.BYOK_ENCRYPTION_KEY=previous;}
});
test('BYOK rejects missing or invalid encryption material and refuses cross-owner workspace scope',async()=>{
  const previous=process.env.BYOK_ENCRYPTION_KEY;delete process.env.BYOK_ENCRYPTION_KEY;
  try{const {session}=fixture();await assert.rejects(saveAIProviderConfig(session,workspace,{provider:'groq',apiKey:'synthetic-provider-key',textModel:'model-x',visionModel:'model-y'}),/encryption is not configured/);
    const foreign={...workspace,ownerSubject:'someone-else'};process.env.BYOK_ENCRYPTION_KEY=Buffer.alloc(32,2).toString('base64');
    await assert.rejects(listAIProviderConfigs(session,foreign),/Workspace not found/);
  }finally{if(previous===undefined)delete process.env.BYOK_ENCRYPTION_KEY;else process.env.BYOK_ENCRYPTION_KEY=previous;}
});
test('provider connection checks keep credentials in headers and return only safe status',async()=>{
  let capturedUrl='',capturedHeaders=new Headers();
  const fetcher=async(input:string|URL|Request,init?:RequestInit)=>{capturedUrl=String(input);capturedHeaders=new Headers(init?.headers);return Response.json({data:[]});};
  const key='synthetic-key-never-return-this';
  const result=await testAIProviderConnection('gemini',key,fetcher);
  assert.equal(result.ok,true);assert.equal(capturedUrl,'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1');
  assert.equal(capturedHeaders.get('x-goog-api-key'),key);assert.ok(!JSON.stringify(result).includes(key));
  const denied=await testAIProviderConnection('groq',key,async()=>new Response(null,{status:401}));
  assert.equal(denied.ok,false);assert.match(denied.message,/rejected this key/);assert.ok(!denied.message.includes(key));
});
