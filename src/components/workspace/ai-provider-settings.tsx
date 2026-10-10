'use client';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { z } from 'zod';
import { AI_PROVIDER_DEFAULTS, AI_PROVIDER_LABELS, aiProviderListSchema, aiProviderSchema, aiProviderTestResultSchema, type AIProviderName } from '../../lib/contracts/ai-providers.ts';
import { Icon } from '../ui/icon.tsx';
import s from '../ui/theme.module.css';

const schema=aiProviderListSchema;
async function call<T>(method:string,body:unknown|undefined,parse:(value:unknown)=>T,signal?:AbortSignal):Promise<T>{
  const response=await fetch('/api/ai/providers',{method,cache:'no-store',credentials:'same-origin',...(signal?{signal}:{}),...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  const envelope=z.object({data:z.unknown().nullable(),error:z.object({message:z.string()}).nullable()}).safeParse(await response.json());
  if(!envelope.success||!response.ok||envelope.data.error||envelope.data.data===null)throw new Error(envelope.success?envelope.data.error?.message??'Provider settings could not be loaded.':'Provider settings could not be verified.');
  return parse(envelope.data.data);
}
export function AIProviderSettings({demo=false}:{demo?:boolean}){
  const [data,setData]=useState<z.infer<typeof schema>|null>(null),[provider,setProvider]=useState<AIProviderName>('groq');
  const [apiKey,setApiKey]=useState(''),[textModel,setTextModel]=useState(AI_PROVIDER_DEFAULTS.groq.textModel),[visionModel,setVisionModel]=useState(AI_PROVIDER_DEFAULTS.groq.visionModel);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[testMessage,setTestMessage]=useState('');
  const load=useCallback(async(signal?:AbortSignal)=>{const next=await call('GET',undefined,value=>schema.parse(value),signal);setData(next);const selected=next.selected??'groq';setProvider(selected);const row=next.providers.find(item=>item.provider===selected);setTextModel(row?.textModel??AI_PROVIDER_DEFAULTS[selected].textModel);setVisionModel(row?.visionModel??AI_PROVIDER_DEFAULTS[selected].visionModel);},[]);
  useEffect(()=>{if(demo)return;const controller=new AbortController();load(controller.signal).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Provider settings are unavailable.');});return()=>controller.abort();},[demo,load]);
  const current=data?.providers.find(item=>item.provider===provider);
  function choose(next:AIProviderName){setProvider(next);setApiKey('');setError('');setNotice('');setTestMessage('');const current=data?.providers.find(item=>item.provider===next);setTextModel(current?.textModel??AI_PROVIDER_DEFAULTS[next].textModel);setVisionModel(current?.visionModel??AI_PROVIDER_DEFAULTS[next].visionModel);}
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');setNotice('');setTestMessage('');try{
    const next=await call('PUT',{provider,apiKey,textModel,visionModel},value=>schema.parse(value));setData(next);setApiKey('');setNotice('Key saved encrypted. Raqam will not show it again.');
  }catch(reason){setError(reason instanceof Error?reason.message:'The provider key could not be saved.');}finally{setBusy(false);}}
  async function mutate(method:'PATCH'|'DELETE'){setBusy(true);setError('');setNotice('');try{const next=await call(method,{provider},value=>schema.parse(value));setData(next);setApiKey('');setNotice(method==='DELETE'?'Saved key removed.':'Provider selected for this workspace.');}catch(reason){setError(reason instanceof Error?reason.message:'Provider settings could not be changed.');}finally{setBusy(false);}}
  async function test(){setBusy(true);setError('');setNotice('');setTestMessage('');try{const response=await fetch('/api/ai/providers/test',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider})});const envelope=await response.json();if(!response.ok||envelope.error)throw new Error(envelope.error?.message??'Provider test failed.');const result=aiProviderTestResultSchema.parse(envelope.data);setTestMessage(result.message);}catch(reason){setError(reason instanceof Error?reason.message:'Connection test failed.');}finally{setBusy(false);}}
  return <section className={s.stack} aria-labelledby="provider-heading">
    <header className={s.stack} style={{gap:8}}><h1 id="provider-heading">AI provider</h1><p className={s.muted}>Connect your own API key for this business workspace. Keys are encrypted on Raqam’s server and never shown after saving.</p></header>
    {demo?<p className={s.notice}>Sign in to save provider keys. Example workspaces do not connect to AI services.</p>:error&&!data?<div className={s.stack} style={{gap:12}}><p className={s.error} role="alert">{error}</p><button type="button" className={s.secondary} onClick={()=>{setError('');load();}} style={{alignSelf:'flex-start'}}>Retry loading provider settings</button></div>:!data?<p className={s.muted} role="status">Loading provider settings…</p>:<><div className={s.stack} style={{gap:12}}><h2 className={s.small}>Choose a provider</h2><div className={s.providerChoices} role="group" aria-label="AI provider">{aiProviderSchema.options.map(item=>{
      const row=data.providers.find(config=>config.provider===item);return <button key={item} type="button" className={`${s.providerChoice} ${provider===item?s.providerChoiceSelected:''}`} aria-pressed={provider===item} disabled={busy} onClick={()=>choose(item)}>
        <span>{AI_PROVIDER_LABELS[item]}</span><span className={s.small}>{row?.configured?'Key saved':'Add key'}</span>
      </button>;
    })}</div></div>
    <form className={`${s.panel} ${s.providerPanel}`} onSubmit={save}>
      <div className={s.actions} style={{justifyContent:'space-between'}}><div><h2>{AI_PROVIDER_LABELS[provider]}</h2><p className={`${s.small} ${s.muted}`}>{current?.configured?'A key is saved for this workspace. Enter a new key to replace it.':'No key saved yet.'}</p></div>{current?.selected&&<span className={`${s.badge} ${s.good}`}>Selected</span>}</div>
      <label className={s.field}>API key<input type="password" autoComplete="new-password" value={apiKey} onChange={event=>setApiKey(event.target.value)} placeholder={current?.configured?'Saved securely · enter to replace':'Paste API key'} maxLength={512} required={!current?.configured} aria-describedby="provider-key-note"/></label>
      <p id="provider-key-note" className={`${s.small} ${s.muted}`}>The key is sent only to Raqam’s server over HTTPS. It is encrypted before storage and cannot be viewed here later.</p>
      {provider==='claude'&&<p className={`${s.small} ${s.pending}`}>Claude supports text proposals and the read-only assistant. Receipt OCR currently supports Groq and Gemini.</p>}
      {provider==='openai'&&<p className={`${s.small} ${s.pending}`}>OpenAI is available for text proposals and the read-only assistant. Receipt OCR currently supports Groq and Gemini.</p>}
      <div className={s.providerModels}><label className={s.field}>Text model<input value={textModel} onChange={event=>setTextModel(event.target.value)} maxLength={128} required/></label><label className={s.field}>Image model<input value={visionModel} onChange={event=>setVisionModel(event.target.value)} maxLength={128} required/></label></div>
      {error&&<p role="alert" className={s.error}>{error}</p>}{notice&&<p role="status" className={s.success}>{notice}</p>}{testMessage&&<p role="status" className={s.success}>{testMessage}</p>}
      <div className={s.providerActions}><button className={s.button} type="submit" disabled={busy||(!apiKey&&!!current?.configured)}>{busy?'Saving…':current?.configured?'Replace saved key':'Save key'}</button>
        {current?.configured&&<><button className={s.secondary} type="button" disabled={busy} onClick={test}><Icon name="spark" size={16}/>Test connection</button>{!current.selected&&<button className={s.secondary} type="button" disabled={busy} onClick={()=>mutate('PATCH')}>Use this provider</button>}<button className={s.textButton} type="button" disabled={busy} onClick={()=>mutate('DELETE')}>Remove key</button></>}
    </div>
    </form>
    </>}
  </section>;
}
