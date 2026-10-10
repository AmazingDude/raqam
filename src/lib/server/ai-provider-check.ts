import 'server-only';
import type { AIProviderName } from '../contracts/ai-providers.ts';
import { aiProviderTestResultSchema } from '../contracts/ai-providers.ts';

const endpoints:Record<AIProviderName,string>={gemini:'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',openai:'https://api.openai.com/v1/models',groq:'https://api.groq.com/openai/v1/models',claude:'https://api.anthropic.com/v1/models'};
export async function testAIProviderConnection(provider:AIProviderName,apiKey:string,fetcher:typeof fetch=fetch){
  const headers:Record<string,string> = provider==='gemini'
    ? {'x-goog-api-key':apiKey}
    : provider==='claude'
      ? {'x-api-key':apiKey,'anthropic-version':'2023-06-01'}
      : {authorization:`Bearer ${apiKey}`};
  let response:Response;
  try {response=await fetcher(endpoints[provider],{headers,signal:AbortSignal.timeout(12_000),cache:'no-store',redirect:'error'});}
  catch {return aiProviderTestResultSchema.parse({provider,ok:false,message:'Could not reach the provider. Check your network and retry.'});}
  if(response.status===401||response.status===403)return aiProviderTestResultSchema.parse({provider,ok:false,message:'The provider rejected this key. Check it and save the corrected key.'});
  if(response.status===429)return aiProviderTestResultSchema.parse({provider,ok:false,message:'The provider rate-limited the check. Wait briefly and retry.'});
  if(!response.ok)return aiProviderTestResultSchema.parse({provider,ok:false,message:'The provider check failed. Confirm API access is enabled for this key.'});
  return aiProviderTestResultSchema.parse({provider,ok:true,message:'Connection verified. Your key can list available models.'});
}
