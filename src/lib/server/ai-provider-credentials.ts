import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { AIProviderName } from '../contracts/ai-providers.ts';
import { aiProviderSchema, AI_PROVIDER_DEFAULTS, aiProviderListSchema } from '../contracts/ai-providers.ts';
import type { RequestSession } from './auth.ts';
import type { Workspace } from '../contracts/index.ts';
import { BackendError } from './errors.ts';

const keyRowSchema = z.strictObject({ provider: aiProviderSchema, key_ciphertext:z.string(), key_nonce:z.string(), key_tag:z.string(), text_model:z.string(), vision_model:z.string(), selected:z.boolean() });
const metadataRowsSchema = z.array(z.strictObject({ provider:aiProviderSchema,selected:z.boolean(),text_model:z.string(),vision_model:z.string(),updated_at:z.string() }));
function encryptionKey(env:Record<string,string|undefined>=process.env):Buffer {
  const encoded=env.BYOK_ENCRYPTION_KEY?.trim();
  if(!encoded) throw new BackendError('UNAVAILABLE','Provider-key encryption is not configured on this server.');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length!==32 || bytes.toString('base64').replace(/=+$/,'')!==encoded.replace(/=+$/,''))
    throw new BackendError('UNAVAILABLE','Provider-key encryption is not configured correctly.');
  return bytes;
}
function aad(workspaceId:string,provider:AIProviderName) { return Buffer.from(`raqam-byok-v1:${workspaceId}:${provider}`); }
function seal(workspaceId:string,provider:AIProviderName,secret:string) {
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),nonce); cipher.setAAD(aad(workspaceId,provider));
  const ciphertext=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
  return {p_key_ciphertext:ciphertext.toString('base64url'),p_key_nonce:nonce.toString('base64url'),p_key_tag:cipher.getAuthTag().toString('base64url')};
}
function unseal(workspaceId:string,raw:unknown):{provider:AIProviderName;apiKey:string;textModel:string;visionModel:string;selected:boolean} {
  const row=keyRowSchema.safeParse(raw); if(!row.success) throw new BackendError('UNAVAILABLE','Saved provider settings could not be verified.');
  const nonce=Buffer.from(row.data.key_nonce,'base64url'),tag=Buffer.from(row.data.key_tag,'base64url'),encrypted=Buffer.from(row.data.key_ciphertext,'base64url');
  if(nonce.length!==12||tag.length!==16||encrypted.length<8||encrypted.length>1024) throw new BackendError('UNAVAILABLE','Saved provider settings could not be verified.');
  try { const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),nonce); decipher.setAAD(aad(workspaceId,row.data.provider)); decipher.setAuthTag(tag);
    const apiKey=Buffer.concat([decipher.update(encrypted),decipher.final()]).toString('utf8');
    if(!/^[\x21-\x7e]{8,512}$/.test(apiKey)) throw new Error('invalid');
    return {provider:row.data.provider,apiKey,textModel:row.data.text_model,visionModel:row.data.vision_model,selected:row.data.selected};
  } catch { throw new BackendError('UNAVAILABLE','Saved provider settings could not be decrypted. Check the server encryption key.'); }
}
function checkedRpc<T>(result:{data:T|null;error:{code?:string}|null}):T {
  if(result.error) throw new BackendError(result.error.code==='P0002'?'NOT_FOUND':'UNAVAILABLE',result.error.code==='P0002'?'Provider settings not found.':'Provider settings could not be saved.');
  return result.data as T;
}
export async function listAIProviderConfigs(session:RequestSession,workspace:Workspace) {
  if(workspace.ownerSubject!==session.subject) throw new BackendError('NOT_FOUND','Workspace not found.');
  const data=checkedRpc(await session.database.rpc('list_ai_provider_configs',{p_workspace_id:workspace.id}));
  const rows=metadataRowsSchema.safeParse(data); if(!rows.success) throw new BackendError('UNAVAILABLE','Provider settings could not be verified.');
  const byProvider=new Map(rows.data.map(row=>[row.provider,row]));
  const providers=aiProviderSchema.options.map(provider=>{const row=byProvider.get(provider);return {provider,configured:!!row,selected:row?.selected??false,textModel:row?.text_model??null,visionModel:row?.vision_model??null};});
  return aiProviderListSchema.parse({providers,selected:providers.find(row=>row.selected)?.provider??null});
}
export async function saveAIProviderConfig(session:RequestSession,workspace:Workspace,input:{provider:AIProviderName;apiKey:string;textModel:string;visionModel:string}) {
  if(workspace.ownerSubject!==session.subject) throw new BackendError('NOT_FOUND','Workspace not found.');
  const sealed=seal(workspace.id,input.provider,input.apiKey);
  checkedRpc(await session.database.rpc('save_ai_provider_credential',{p_workspace_id:workspace.id,p_provider:input.provider,...sealed,p_text_model:input.textModel,p_vision_model:input.visionModel}));
  const listed=await listAIProviderConfigs(session,workspace);
  if(!listed.selected) checkedRpc(await session.database.rpc('select_ai_provider',{p_workspace_id:workspace.id,p_provider:input.provider}));
  return listAIProviderConfigs(session,workspace);
}
export async function selectAIProviderConfig(session:RequestSession,workspace:Workspace,provider:AIProviderName) {
  if(workspace.ownerSubject!==session.subject) throw new BackendError('NOT_FOUND','Workspace not found.');
  checkedRpc(await session.database.rpc('select_ai_provider',{p_workspace_id:workspace.id,p_provider:provider}));
  return listAIProviderConfigs(session,workspace);
}
export async function deleteAIProviderConfig(session:RequestSession,workspace:Workspace,provider:AIProviderName) {
  if(workspace.ownerSubject!==session.subject) throw new BackendError('NOT_FOUND','Workspace not found.');
  checkedRpc(await session.database.rpc('delete_ai_provider_credential',{p_workspace_id:workspace.id,p_provider:provider}));
  return listAIProviderConfigs(session,workspace);
}
export async function getSelectedAIProviderConfig(session:RequestSession,workspace:Workspace) {
  const settings=await listAIProviderConfigs(session,workspace); if(!settings.selected)return null;
  const selected=settings.selected;
  const data=checkedRpc(await session.database.rpc('get_ai_provider_credential',{p_workspace_id:workspace.id,p_provider:selected}));
  const row=Array.isArray(data)?data[0]:data;
  return row?unseal(workspace.id,row):null;
}
export async function selectedAIEnvironment(session:RequestSession,workspace:Workspace,base:Record<string,string|undefined>=process.env) {
  const config=await getSelectedAIProviderConfig(session,workspace); if(!config)return base;
  const environment:Record<string,string|undefined>={...base,AI_PROVIDER:config.provider,ASSISTANT_PROVIDER:config.provider};
  if(config.provider==='groq') {environment.GROQ_API_KEY=config.apiKey;environment.GROQ_TEXT_MODEL=config.textModel;environment.GROQ_VISION_MODEL=config.visionModel;}
  if(config.provider==='gemini') {environment.GEMINI_API_KEY=config.apiKey;environment.GEMINI_TEXT_MODEL=config.textModel;environment.GEMINI_VISION_MODEL=config.visionModel;}
  if(config.provider==='openai') {environment.OPENAI_API_KEY=config.apiKey;environment.OPENAI_TEXT_MODEL=config.textModel;environment.OPENAI_VISION_MODEL=config.visionModel;}
  if(config.provider==='claude') {environment.CLAUDE_API_KEY=config.apiKey;environment.CLAUDE_TEXT_MODEL=config.textModel;environment.CLAUDE_VISION_MODEL=config.visionModel;}
  return environment;
}
export async function providerCredentialForTest(session:RequestSession,workspace:Workspace,provider:AIProviderName) {
  const data=checkedRpc(await session.database.rpc('get_ai_provider_credential',{p_workspace_id:workspace.id,p_provider:provider}));
  const row=Array.isArray(data)?data[0]:data;
  if(!row) throw new BackendError('NOT_FOUND','Save a provider key before testing it.');
  const value=unseal(workspace.id,row);
  return {...value,defaultModels:AI_PROVIDER_DEFAULTS[provider]};
}
