import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { extractDocument } from '../../src/lib/server/documents/extraction.ts';
import type { RequestSession } from '../../src/lib/server/auth.ts';
const workspace={id:'40000000-0000-4000-8000-000000000001',ownerSubject:'synthetic_owner',businessName:'Synthetic',currency:'PKR' as const};
const doc='40000000-0000-4000-8000-000000000002',source='40000000-0000-4000-8000-000000000003',key='40000000-0000-4000-8000-000000000004';
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWQAAAABJRU5ErkJggg==','base64');
const hash=createHash('sha256').update(bytes).digest('hex');
const empty={counterparty:null,date:null,totalMinor:null,currency:null,reference:null};
const dto={document:{id:doc,workspaceId:workspace.id,source:{sourceId:source,rowNumber:null},extractedFields:empty,correctedFields:null,
 extractionStatus:'pending',reviewStatus:'needs_review',modelVersion:null,promptVersion:null},reviewVersion:0,schemaVersion:null,extractionFailure:null,extractionContext:null};
type TestRuntime={environment:()=>Record<string,string|undefined>;fetch:typeof globalThis.fetch};
async function fixture(mode:'live'|'cached'|'busy'|'rate_limit'|'malformed'|'budget_denied'|'budget_unavailable'|'cancelled',run:(session:RequestSession,request:Request,
 counters:{inference:number;save:number;source:number;outcome:any},runtime:TestRuntime)=>Promise<void>) {
 const counters={inference:0,save:0,source:0,outcome:null as any}; let identity:any;
 const caller=new AbortController();
 const json=(value:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}});
 const scriptedFetch:typeof globalThis.fetch=async(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
   if(init?.signal?.aborted)throw new DOMException('Scripted cancellation','AbortError');
   if(url.hostname==='api.groq.com') {
    counters.inference++;
    if(mode==='cancelled')return new Promise((_resolve,reject)=>{
      init?.signal?.addEventListener('abort',()=>reject(new DOMException('Scripted cancellation','AbortError')),{once:true});
      setTimeout(()=>caller.abort(),10);
    });
    if(mode==='rate_limit')return json({error:{message:'Synthetic rate limit'}},429,{'retry-after':'120'});
    const raw=mode==='malformed'?{unexpected:'Synthetic malformed output'}:{counterpartyText:'Synthetic merchant',dateText:'2026-10-10',totalText:'100.05',
      totalCandidates:['100.05'],currencyText:'PKR',referenceText:null,unreadableFields:[]};
    return json({id:'synthetic-response',object:'chat.completion',created:0,model:'qwen/qwen3.8-27b',choices:[{index:0,finish_reason:'stop',
      message:{role:'assistant',content:JSON.stringify(raw)}}]});
   }
   if(url.pathname.includes('/storage/v1/object/')){counters.source++;return new Response(bytes,{headers:{'Content-Type':'image/png'}});}
   if(url.pathname.includes('/rest/v1/rpc/')) {
    const body=JSON.parse(String(init?.body));
    if(url.pathname.endsWith('/reserve_receipt_extraction')) {
      assert.equal(body.p_identity.ownerId,workspace.ownerSubject);assert.equal(body.p_identity.workspaceId,workspace.id);assert.equal(body.p_identity.sourceHash,hash);
      identity=body.p_identity;
      if(mode==='cached') {
        const record={...dto,document:{...dto.document,extractionStatus:'failed'},extractionFailure:'provider_timeout'};
        return json({state:'cached',requestId:key,record,currentRecord:record});
      }
      return json({state:mode==='busy'?'busy':'reserved',requestId:key,expiresAt:new Date(Date.now()+90000).toISOString(),currentRecord:dto});
    }
    if(url.pathname.endsWith('/reserve_receipt_provider_allowance'))return mode==='budget_unavailable'?json({message:'Synthetic database outage'},503):json(mode!=='budget_denied');
    if(url.pathname.endsWith('/save_receipt_extraction')) {
      counters.save++;counters.outcome=body.p_outcome;
      const outcome=body.p_outcome;
      const record={...dto,document:{...dto.document,extractedFields:outcome.fields??empty,
       extractionStatus:outcome.status==='complete'?'complete':'failed',reviewStatus:outcome.status==='complete'?'proposed':'needs_review',
       modelVersion:outcome.provenance?.modelVersion??null,promptVersion:outcome.provenance?.promptVersion??null},
       reviewVersion:1,schemaVersion:outcome.provenance?.schemaVersion??null,extractionFailure:outcome.reason??null,
       extractionContext:{identity,evidence:outcome.evidence??null,failure:outcome.failure??null}};
      return json({requestId:key,record,currentRecord:record,duplicate:false});
    }
    throw new Error('Unexpected scripted RPC');
   }
   assert.equal(url.searchParams.get('workspace_id'),`eq.${workspace.id}`);
   if(url.pathname.endsWith('/supporting_documents'))return json({id:doc,workspace_id:workspace.id,source_id:source,extracted_fields:empty,corrected_fields:null,
      extraction_status:'pending',review_status:'needs_review',review_version:0,provenance:null,extraction_failure:null});
   if(url.pathname.endsWith('/receipt_extraction_contexts'))return json([]);
   if(url.pathname.endsWith('/sources')) {
     if(url.searchParams.get('select')==='content_hash')return json({content_hash:hash});
     return json({id:source,workspace_id:workspace.id,source_type:'receipt_image',content_hash:hash,storage_path:`${workspace.id}/${hash}.png`,status:'complete'});
   }
   throw new Error('Unexpected scripted transport');
  };
 const database=createClient('https://synthetic.supabase.co','synthetic-publishable-key',{accessToken:async()=> 'synthetic-session-token',global:{fetch:scriptedFetch},db:{retry:false},
   auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const runtime:TestRuntime={environment:()=>({GROQ_API_KEY:'synthetic-test-key',GROQ_VISION_MODEL:'qwen/qwen3.8-27b',
   GROQ_TEXT_MODEL:'openai/gpt-oss-20b',AI_PROVIDER:'groq'}),fetch:scriptedFetch};
  const session:RequestSession={subject:workspace.ownerSubject,database,configuration:{APP_URL:'http://localhost:3000',NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:'synthetic',
   CLERK_SECRET_KEY:'synthetic',NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic'}};
 await run(session,new Request('http://localhost:3000/api/documents/'+doc+'/extraction',{signal:caller.signal}),counters,runtime);
}
test('receipt service validates source, invokes C once, persists raw evidence and returns current state',async()=>{
 await fixture('live',async(session,request,counters,runtime)=>{
  const result=await extractDocument(session,workspace,doc,request,{requestId:key,expectedVersion:0},{},runtime);
  assert.equal(result.state,'live');assert.equal(result.record.document.extractedFields.totalMinor,'10005');
  assert.equal(result.record.extractionContext?.evidence?.fields.total.rawText,'100.05');
  assert.equal(counters.inference,1);assert.equal(counters.save,1);assert.equal(counters.source,1);
 });
});
test('cached and busy receipt reservations never download bytes or invoke inference',async()=>{
 for(const mode of ['cached','busy'] as const)await fixture(mode,async(session,request,counters,runtime)=>{
  if(mode==='cached') {
    const cached=await extractDocument(session,workspace,doc,request,{requestId:key,expectedVersion:0},{},runtime);
    assert.equal(cached.state,'failed');assert.equal(cached.cacheHit,true);
  }
  else await assert.rejects(extractDocument(session,workspace,doc,request,{requestId:key,expectedVersion:0},{},runtime),{code:'CONFLICT'});
  assert.equal(counters.inference,0);assert.equal(counters.source,0);assert.equal(counters.save,0);
 });
});
test('rate limit, malformed output, denied/unavailable budget and cancellation persist explicit failures within the two-attempt bound',async()=>{
 for(const mode of ['rate_limit','malformed','budget_denied','budget_unavailable','cancelled'] as const)await fixture(mode,async(session,request,counters,runtime)=>{
  const result=await extractDocument(session,workspace,doc,request,{requestId:key,expectedVersion:0},{},runtime);
  assert.equal(result.state,'failed');assert.equal(result.record.document.extractedFields.totalMinor,null);assert.equal(counters.save,1);
  assert.equal(result.record.extractionContext?.failure?.reason,
    mode==='rate_limit'?'provider_rate_limited':mode==='malformed'?'invalid_model_output':mode==='budget_denied'?'budget_exhausted':
      mode==='budget_unavailable'?'budget_unavailable':'cancelled');
  assert.ok(counters.inference<=2);if(mode==='budget_denied'||mode==='budget_unavailable')assert.equal(counters.source,0);
 });
});
