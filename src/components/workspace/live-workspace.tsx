'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { UserButton, useUser } from '@clerk/nextjs';
import type { CashSummary, Transaction, Workspace } from '../../lib/contracts/index.ts';
import { validateCashbook } from '../../lib/server/summary.ts';
import { api, ClientError } from '../../lib/client/api.ts';
import { Icon, Mark } from '../ui/icon.tsx';
import { WorkspaceApp } from './workspace-app.tsx';
import s from '../ui/theme.module.css';
type State = { kind:'loading' } | { kind:'new' } | { kind:'error'; message:string; code:string } | { kind:'ready'; workspace:Workspace; records:Transaction[]; cursor:string|null; summary:CashSummary|null; summaryError:string };
function Gate({title,children}:{title:string;children:React.ReactNode}) {return <div className={s.root} data-raqam-ui><main className={s.gate}><Link href="/" className={s.brand}><Mark/>raqam</Link><section className={`${s.panel} ${s.gatePanel} ${s.stack}`}><h1 style={{fontSize:28,letterSpacing:-1}}>{title}</h1>{children}</section></main></div>;}
function OwnedWorkspace() {
  const [state,setState]=useState<State>({kind:'loading'}),[name,setName]=useState(''),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState(''),[reload,setReload]=useState(0);
  const controllers=useRef(new Set<AbortController>());const savingRef=useRef(false);
  const refreshVersion=useRef(0);
  const run=useCallback(async<T,>(work:(signal:AbortSignal)=>Promise<T>):Promise<T>=>{const controller=new AbortController();controllers.current.add(controller);try{const result=await work(controller.signal);controller.signal.throwIfAborted();return result;}finally{controllers.current.delete(controller);}},[]);
  useEffect(()=>()=>{for(const controller of controllers.current)controller.abort();controllers.current.clear();},[]);
  useEffect(()=>{
    const controller=new AbortController();controllers.current.add(controller);let active=true;
    setState({kind:'loading'});
    void api.workspace(controller.signal).then(async workspace=>{
      if(!active)return;
      if(!workspace){setState({kind:'new'});return;}
      const [page,summaryResult]=await Promise.all([api.transactions(controller.signal),api.summary(controller.signal).then(summary=>({summary,summaryError:''})).catch(error=>({summary:null,summaryError:error instanceof Error?error.message:'Workspace cash totals could not load. Retry.'}))]);
      validateCashbook(page.items,workspace.id);
      if(active)setState({kind:'ready',workspace,records:page.items,cursor:page.nextCursor,...summaryResult});
    }).catch(error=>{if(active)setState({kind:'error',message:error instanceof Error?error.message:'The workspace could not be loaded. Retry.',code:error instanceof ClientError?error.code:'UNAVAILABLE'});}).finally(()=>controllers.current.delete(controller));
    return()=>{active=false;controller.abort();controllers.current.delete(controller);};
  },[reload]);
  const upload=useCallback((file:File)=>run(async signal=>({...await api.uploadSource(file,signal),name:file.name})),[run]);
  const getLink=useCallback((id:string)=>run(signal=>api.sourceLink(id,signal)),[run]);
  async function refresh(workspace:Workspace) {
    const version=++refreshVersion.current;
    setState(current=>current.kind==='ready'?{...current,summary:null,summaryError:''}:current);
    try {
      const [page,summaryResult]=await run(signal=>Promise.all([api.transactions(signal),api.summary(signal).then(summary=>({summary,summaryError:''})).catch(error=>({summary:null,summaryError:error instanceof Error?error.message:'Workspace cash totals could not load. Retry.'}))]));
      validateCashbook(page.items,workspace.id);
      if(version===refreshVersion.current)setState(current=>current.kind==='ready'?{...current,records:page.items,cursor:page.nextCursor,...summaryResult}:current);
    } catch(error) {
      if(version===refreshVersion.current)setState(current=>current.kind==='ready'?{...current,summary:null,summaryError:'Saved records could not reload. Retry the cashbook totals or reload the workspace.'}:current);
      throw error;
    }
  }
  async function create() {
    if(savingRef.current||!name.trim())return;savingRef.current=true;setSaving(true);setSaveError('');
    try{await run(signal=>api.createWorkspace(name.trim(),signal));setReload(value=>value+1);}catch(error){setSaveError(error instanceof Error?error.message:'Workspace could not be saved. Retry.');}finally{savingRef.current=false;setSaving(false);}
  }
  if(state.kind==='loading')return <Gate title="Opening your workspace"><p className={s.muted} role="status">Loading your private cashbook…</p></Gate>;
  if(state.kind==='error')return <Gate title="Your workspace needs attention"><p role="alert" className={s.error}>{state.message}</p><div className={s.actions}>{state.code==='UNAUTHENTICATED'&&<Link className={s.button} href="/sign-in?redirect_url=%2Fworkspace">Sign in again</Link>}<button className={s.secondary} onClick={()=>setReload(value=>value+1)}>Retry workspace</button><Link href="/demo" className={s.textButton}>Explore an example</Link><UserButton/></div></Gate>;
  if(state.kind==='new')return <Gate title="Make a home for your books"><p className={s.muted}>One business workspace. Your records stay connected to your account.</p><form className={s.stack} onSubmit={event=>{event.preventDefault();void create();}}><label className={s.field}>Business name<input value={name} onChange={event=>setName(event.target.value)} placeholder="Your business name" maxLength={200} required disabled={saving}/></label><p className={`${s.small} ${s.muted}`}>Currency: PKR · Language: English</p>{saveError&&<p className={s.error} role="alert">{saveError}</p>}<button className={s.button} disabled={saving||!name.trim()}>{saving?'Creating workspace…':'Create workspace'}</button></form><UserButton/></Gate>;
  return <WorkspaceApp key={reload} demo={false} workspace={state.workspace} records={state.records} summary={state.summary} summaryError={state.summaryError} onChanged={()=>refresh(state.workspace)} hasMore={state.cursor!==null} onReload={()=>setReload(value=>value+1)} account={<UserButton/>} onUpload={upload} getLink={getLink} loadMore={async()=>{if(state.kind!=='ready'||!state.cursor)return;const page=await run(signal=>api.transactions(signal,state.cursor));const records=[...state.records,...page.items];validateCashbook(records,state.workspace.id);setState(current=>current.kind==='ready'?{...current,records,cursor:page.nextCursor}:current);}}/>;
}
function AuthenticatedGate() {
  const {isLoaded,isSignedIn,user}=useUser();
  if(!isLoaded)return <Gate title="Checking your session"><p role="status" className={s.muted}>One moment…</p></Gate>;
  if(!isSignedIn||!user)return <Gate title="Your books, in your workspace"><p className={s.muted}>Sign in to open your private cashbook.</p><Link className={s.button} href="/sign-in?redirect_url=%2Fworkspace">Sign in <Icon name="arrow" size={17}/></Link><Link href="/demo" className={s.textButton}>Explore a synthetic example</Link></Gate>;
  // Key changes synchronously on account switch: no previous owner's component state.
  return <OwnedWorkspace key={user.id}/>;
}
export function LiveWorkspace({clerkConfigured}:{clerkConfigured:boolean}) {
  if(!clerkConfigured)return <Gate title="Your workspace is almost ready"><p className={s.muted}>Account setup is still pending. Connect Clerk and Supabase to open your private workspace.</p><Link href="/demo" className={s.button}>Explore an example <Icon name="arrow" size={17}/></Link><Link href="/" className={s.textButton}>Back to Raqam</Link></Gate>;
  return <AuthenticatedGate/>;
}
