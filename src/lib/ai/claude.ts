import 'server-only';
import { z } from 'zod';
import { assistantToolSchemas, sourceReferenceSchema } from '../contracts/schemas.ts';
import { identifyImage } from '../server/uploads.ts';
import { PROVIDER_LIMITS as LIMITS, VERSION_PATTERN } from './config.ts';
import type { GroqProvider, ProviderContext, ProviderDependencies, ProviderFailureReason, ProviderMetadata, ProviderResult, PromptVersions, TextProposalRequest, ToolConversationRequest, ImageExtractionRequest, ToolName } from './provider.ts';

export const CLAUDE_PROVIDER_VERSION='claude-provider-v1';
const api='https://api.anthropic.com/v1/messages';
const configuration=z.object({apiKey:z.string().min(8).max(512).regex(/^[\x21-\x7e]+$/),textModel:z.string().min(1).max(128),visionModel:z.string().min(1).max(128)});
const versions=z.strictObject({prompt:z.string().regex(VERSION_PATTERN),schema:z.string().regex(VERSION_PATTERN)});
const usageSchema=z.object({input_tokens:z.number().int().nonnegative(),output_tokens:z.number().int().nonnegative()}).passthrough();
const toolResult=z.strictObject({type:z.literal('tool_result'),tool_use_id:z.string().min(1).max(128),content:z.string().max(LIMITS.inputCharacters)});
type Block=Record<string,unknown>;
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
function parseObject(text:string):Record<string,unknown>{try{const value:unknown=JSON.parse(text);if(isRecord(value))return value;}catch{/* do not retain provider output in errors */}throw new Error('invalid_model_output');}
function safeRequestId(headers:Headers):string[]{const value=headers.get('request-id');return value&&/^req_[A-Za-z0-9_-]{1,100}$/.test(value)?[value]:[];}
function usage(raw:unknown):ProviderMetadata['usage']{const parsed=usageSchema.safeParse(raw);return parsed.success?{inputTokens:parsed.data.input_tokens,outputTokens:parsed.data.output_tokens,totalTokens:parsed.data.input_tokens+parsed.data.output_tokens}:null;}
function toClaudeMessages(input:ToolConversationRequest){
  const system:string[]=[];const messages:Block[]=[];
  for(const message of input.messages){
    if(message.role==='system'){system.push(message.content);continue;}
    if(message.role==='user'){if(message.content.length>LIMITS.inputCharacters)throw new Error('invalid_request');messages.push({role:'user',content:message.content});continue;}
    if(message.role==='tool'){const previous=messages.at(-1),block=toolResult.parse({type:'tool_result',tool_use_id:message.callId,content:message.content});
      const content=previous?.role==='user'&&Array.isArray(previous.content)?previous.content as Block[]:null;
      if(content)content.push(block);else messages.push({role:'user',content:[block]});continue;}
    if(message.role!=='assistant')throw new Error('invalid_request');
    if(message.providerState!==undefined)throw new Error('invalid_request');
    const blocks:Block[]=[];if(message.content)blocks.push({type:'text',text:message.content});
    if((message.toolCalls?.length??0)>LIMITS.tools)throw new Error('invalid_request');
    for(const call of message.toolCalls??[]){if(call.arguments.length>LIMITS.inputCharacters||!call.id||call.id.length>128||!Object.hasOwn(assistantToolSchemas,call.name))throw new Error('invalid_request');let parsed:unknown;try{parsed=JSON.parse(call.arguments);}catch{throw new Error('invalid_request');}
      if(!assistantToolSchemas[call.name as ToolName].safeParse(parsed).success)throw new Error('invalid_request');
      blocks.push({type:'tool_use',id:call.id,name:call.name,input:parsed});}
    messages.push({role:'assistant',content:blocks});
  }
  return {system:system.join('\n\n'),messages};
}
function parseToolOutput(data:unknown,allowed:readonly ToolName[]){
  if(!isRecord(data)||!Array.isArray(data.content)||data.content.length>LIMITS.tools+1)throw new Error('invalid_model_output');
  const calls=data.content.filter((block):block is Record<string,unknown>=>isRecord(block)&&block.type==='tool_use');
  if(data.stop_reason==='tool_use'){
    if(!calls.length||calls.length>LIMITS.tools)throw new Error('invalid_model_output');
    const ids=new Set<string>();const toolCalls=calls.map(block=>{const id=block.id,name=block.name,input=block.input;
      if(typeof id!=='string'||!id||id.length>128||ids.has(id)||typeof name!=='string'||!allowed.includes(name as ToolName)||!assistantToolSchemas[name as ToolName].safeParse(input).success)throw new Error('invalid_model_output');
      ids.add(id);return{id,name:name as ToolName,arguments:JSON.stringify(input)};});return{content:null,toolCalls};
  }
  if(data.stop_reason!=='end_turn'||calls.length||!data.content.every(block=>isRecord(block)&&(['text','thinking'].includes(String(block.type)))) )throw new Error('invalid_model_output');
  const text=(data.content as Block[]).filter(block=>block.type==='text').map(block=>block.text).filter(value=>typeof value==='string').join('');
  if(!text.trim()||text.length>LIMITS.outputCharacters)throw new Error('invalid_model_output');return{content:text,toolCalls:[]};
}

export function createClaudeProvider(dependencies:ProviderDependencies={}):GroqProvider{
  const env=()=>{try{return(dependencies.environment??(()=>process.env))();}catch{return{};}};
  async function execute(mode:'image'|'text'|'tool',input:ImageExtractionRequest|TextProposalRequest|ToolConversationRequest,context:ProviderContext):Promise<ProviderResult>{
    const started=Date.now(),settings=env(),parsed=configuration.safeParse({apiKey:settings.CLAUDE_API_KEY,textModel:settings.CLAUDE_TEXT_MODEL,visionModel:settings.CLAUDE_VISION_MODEL});
    const model=parsed.success?(mode==='image'?parsed.data.visionModel:parsed.data.textModel):null;
    const metadata:ProviderMetadata={requestId:context?.requestId??null,mode,model,providerVersion:CLAUDE_PROVIDER_VERSION,
      promptVersion:versions.safeParse(input?.versions).success?input.versions.prompt:null,schemaVersion:versions.safeParse(input?.versions).success?input.versions.schema:null,
      attempts:0,durationMs:0,providerRequestIds:[],usage:null};
    const finish=(result:ProviderResult):ProviderResult=>{metadata.durationMs=Math.max(0,Date.now()-started);try{dependencies.onTelemetry?.({outcome:result.ok?'success':'failure',reason:result.ok?null:result.error.reason,metadata:{...metadata,providerRequestIds:[...metadata.providerRequestIds]}});}catch{/* telemetry cannot affect outcome */}return result;};
    const fail=(reason:ProviderFailureReason,retryable=false,retryAfterMs:number|null=null):ProviderResult=>finish({ok:false,error:{code:reason==='invalid_request'?'INVALID_INPUT':'UNAVAILABLE',reason,
      message:reason==='invalid_request'?'Check the AI request inputs.':'AI processing is unavailable. Keep the source and try again when ready.',retryable,retryAfterMs},metadata});
    if(!parsed.success)return fail('configuration_missing');
    if(!context||!z.object({requestId:z.uuid(),deadlineAtMs:z.number().int().finite()}).safeParse(context).success||!versions.safeParse(input?.versions).success)return fail('invalid_request');
    if(context.signal?.aborted)return fail('cancelled');
    const deadline=Math.min(context.deadlineAtMs,Date.now()+LIMITS.attemptTimeoutMs);if(deadline<=Date.now())return fail('deadline_exceeded',true);
    if(context.budget){try{const allowance=context.budget.take();if(typeof allowance!=='boolean')return fail('budget_unavailable',true);if(!allowance)return fail('budget_exhausted',true);}catch{return fail('budget_unavailable',true);}}
    let body:Record<string,unknown>;
    try{
      if(mode==='image'){
        const image=input as ImageExtractionRequest;
        if(!sourceReferenceSchema.safeParse(image.source).success||image.source.rowNumber!==null||!(image.bytes instanceof Uint8Array)||image.bytes.length===0||image.bytes.length>LIMITS.imageBytes||identifyImage(image.bytes)?.mime!==image.mime||!image.prompt.trim()||image.prompt.length>LIMITS.inputCharacters)return fail('invalid_request');
        body={model,max_tokens:LIMITS.outputTokens,system:image.prompt,messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:image.mime,data:Buffer.from(image.bytes).toString('base64')}}]}],
          output_config:{format:{type:'json_schema',schema:z.toJSONSchema(image.schema??z.record(z.string(),z.unknown()),{io:'input'})}}};
      }else if(mode==='text'){
        const text=input as TextProposalRequest;if(!text.prompt.trim()||text.prompt.length>LIMITS.inputCharacters)return fail('invalid_request');
        body={model,max_tokens:LIMITS.outputTokens,messages:[{role:'user',content:text.prompt}],output_config:{format:{type:'json_schema',schema:z.toJSONSchema(text.schema,{io:'input'})}}};
      }else{
        const conversation=input as ToolConversationRequest;if(conversation.messages.length<1||conversation.messages.length>LIMITS.messages||conversation.tools.length<1||conversation.tools.length>LIMITS.tools||new Set(conversation.tools.map(tool=>tool.name)).size!==conversation.tools.length||conversation.tools.some(tool=>tool.description.length>1000))return fail('invalid_request');
        const converted=toClaudeMessages(conversation),allowed=conversation.tools.map(tool=>tool.name).filter((name):name is ToolName=>Object.hasOwn(assistantToolSchemas,name));
        if(allowed.length!==conversation.tools.length||new Set(allowed).size!==allowed.length)return fail('invalid_request');
        body={model,max_tokens:LIMITS.toolOutputTokens,system:converted.system,messages:converted.messages,tools:conversation.tools.map(tool=>({name:tool.name,description:tool.description,input_schema:z.toJSONSchema(assistantToolSchemas[tool.name],{io:'input'}),strict:true})),
          tool_choice:conversation.choice==='auto'?{type:'auto'}:conversation.choice==='none'?{type:'none'}:{type:'any',disable_parallel_tool_use:true}};
      }
      if(JSON.stringify(body).includes(parsed.data.apiKey))return fail('invalid_request');
    }catch{return fail('invalid_request');}
    const controller=new AbortController(),parentAbort=()=>controller.abort();context.signal?.addEventListener('abort',parentAbort,{once:true});
    const timer=setTimeout(()=>controller.abort(),deadline-Date.now());
    try{
      metadata.attempts=1;
      const response=await(dependencies.fetch??globalThis.fetch)(api,{method:'POST',headers:{'content-type':'application/json','x-api-key':parsed.data.apiKey,'anthropic-version':'2023-06-01'},body:JSON.stringify(body),signal:controller.signal,cache:'no-store',redirect:'error'});
      if(Date.now()>=context.deadlineAtMs)return fail('deadline_exceeded',true);
      if(response.status===401||response.status===403)return fail('provider_auth');
      if(response.status===429){const retry=response.headers.get('retry-after');return fail('provider_rate_limited',true,retry&&/^\d+$/.test(retry)?Number(retry)*1000:null);}
      if(!response.ok)return fail(response.status>=500?'provider_unavailable':'provider_request',response.status>=500);
      const raw:unknown=await response.json();if(!isRecord(raw)||!Array.isArray(raw.content))return fail('invalid_model_output');
      metadata.providerRequestIds=safeRequestId(response.headers);metadata.usage=usage(raw.usage);
      let output:unknown;
      if(mode==='tool')output=parseToolOutput(raw,(input as ToolConversationRequest).tools.map(tool=>tool.name).filter((name):name is ToolName=>Object.hasOwn(assistantToolSchemas,name)));
      else{if(raw.stop_reason!=='end_turn')return fail('invalid_model_output');const text=raw.content.filter((block:unknown)=>isRecord(block)&&block.type==='text').map((block:Record<string,unknown>)=>block.text).filter((value:unknown):value is string=>typeof value==='string').join('');
        output=parseObject(text);const schema=mode==='image'?(input as ImageExtractionRequest).schema:(input as TextProposalRequest).schema;if(schema&&!schema.safeParse(output).success)return fail('invalid_model_output');}
      if(JSON.stringify(output).includes(parsed.data.apiKey))return fail('invalid_model_output');
      return finish({ok:true,output,metadata});
    }catch(error){if(context.signal?.aborted)return fail('cancelled');if(Date.now()>=deadline||controller.signal.aborted)return fail('provider_timeout',true);return fail(error instanceof Error&&error.message==='invalid_model_output'?'invalid_model_output':'provider_network',true);}
    finally{clearTimeout(timer);context.signal?.removeEventListener('abort',parentAbort);}
  }
  return {requestImageExtraction:(input,context)=>execute('image',input,context),requestTextProposal:(input,context)=>execute('text',input,context),requestToolConversation:(input,context)=>execute('tool',input,context)};
}
