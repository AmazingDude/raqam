'use client';
import { useEffect,useRef,useState } from 'react';
import { api } from '../../lib/client/api.ts';
import { usePrivateRequests } from '../../lib/client/use-private-requests.ts';
import type { ChatAction,ChatHistory,ChatMessage } from '../../lib/contracts/chat.ts';
import { money } from '../../lib/client/presentation.ts';
import { categoryLabels } from '../../lib/client/presentation.ts';
import { Icon } from '../ui/icon.tsx';
import s from '../ui/theme.module.css';
function Change({action}:{action:ChatAction}){
 if(action.kind==='post_journal')return <div className={s.chatChange}><strong>Statement adjustment · {action.journal.entryDate}</strong><p>{action.journal.description}</p><p>{action.journal.reversalOfId?'Reverse posted entry '+action.journal.reversalOfId:'Post a balanced journal'}</p><dl className={s.details}>{action.journal.lines.map(line=><div key={line.id}><dt>{action.accountLabels[line.accountId]??line.accountId}</dt><dd>Debit PKR {money(line.debitMinor)} · Credit PKR {money(line.creditMinor)}</dd></div>)}</dl></div>;
 const before=action.kind==='edit_cash'?action.before:null;
 return <div className={s.chatChange}><strong>{before?'Correct transaction':'Add manual transaction'}</strong><dl className={s.details}>
  {before&&<><dt>Record</dt><dd>{before.id}{before.source.rowNumber!==null?` · Statement row ${before.source.rowNumber}`:''}</dd></>}
  <dt>Description</dt><dd>{before&&before.description!==action.values.description?<>{before.description} → </>:null}{action.values.description}</dd>
  <dt>Date</dt><dd>{before&&before.date!==action.values.date?`${before.date} → `:''}{action.values.date}</dd>
  <dt>Cash</dt><dd>{before&&(before.amountMinor!==action.values.amountMinor||before.direction!==action.values.direction)?`${before.direction==='in'?'Received':'Paid'} PKR ${money(before.amountMinor)} → `:''}{action.values.direction==='in'?'Received':'Paid'} PKR {money(action.values.amountMinor)}</dd>
  <dt>Category</dt><dd>{before&&before.category!==action.values.category?`${before.category?categoryLabels[before.category]:'Unreviewed'} → `:''}{action.values.category?categoryLabels[action.values.category]:'Needs review'}</dd>
  <dt>Reference</dt><dd>{action.values.reference??'None'}</dd>
  <dt>Ledger</dt><dd>{action.counterAccountName??(before?'Keep current counterpart; otherwise review clearing':'Review clearing until classified')}</dd>
  <dt>Source</dt><dd>{before?before.source.kind==='manual_chat'?'Original chat message':'Original statement row preserved':'Your typed history'}</dd>
 </dl></div>;
}
export function ChatScreen({workspaceId,onChanged}:{workspaceId:string;onChanged:()=>Promise<void>}){
 const run=usePrivateRequests(),locked=useRef(false),generation=useRef(0),attempt=useRef<{conversationId:string|null;requestId:string;message:string}|null>(null);
 const [history,setHistory]=useState<ChatHistory|null>(null),[current,setCurrent]=useState<string|null>(null),[messages,setMessages]=useState<ChatMessage[]>([]);
 const [input,setInput]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[cursor,setCursor]=useState<string|null>(null);
 async function load(id?:string,more=false){const version=++generation.current;const result=await run(signal=>api.chatHistory(signal,id,more?cursor??undefined:undefined));if(result.workspaceId!==workspaceId||(id&&result.conversation?.id!==id))throw new Error('Conversation scope could not be verified. Reload the workspace.');if(version!==generation.current)return;setHistory(result);setCurrent(result.conversation?.id??null);setMessages(previous=>more?[...result.messages,...previous.filter(m=>!result.messages.some(n=>n.id===m.id))]:result.messages);setCursor(result.nextCursor);}
 useEffect(()=>{void load().catch(e=>{if(!(e instanceof Error&&e.name==='AbortError'))setError(e instanceof Error?e.message:'Chat history could not load.');}).finally(()=>setLoading(false));return()=>{generation.current++;};},[workspaceId]);
 async function exclusive(work:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setError('');setNotice('');try{await work();}catch(e){if(!(e instanceof Error&&e.name==='AbortError'))setError(e instanceof Error?e.message:'The chat request failed. Retry.');}finally{locked.current=false;setBusy(false);}}
 async function send(value:string){if(!value.trim())return;await exclusive(async()=>{
  if(attempt.current?.message!==value.trim()||attempt.current.conversationId!==current)attempt.current={conversationId:current,requestId:crypto.randomUUID(),message:value.trim()};
  const result=await run(signal=>api.chatSend(attempt.current!,signal));if(result.workspaceId!==workspaceId)throw new Error('Chat scope could not be verified.');
  attempt.current=null;setInput('');await load(result.conversationId);
  // The server returns a plain saved acknowledgement only for an explicit
  // confirmation. Refresh summaries even if only a new proposal was returned.
  if(!result.message.plan)try{await onChanged();}catch{setNotice('Chat saved. Reload the workspace if its books have not refreshed.');}
 });}
 async function decide(messageId:string,decision:'apply'|'discard'){await exclusive(async()=>{const result=await run(signal=>api.chatDecide({messageId,decision},signal));if(result.workspaceId!==workspaceId)throw new Error('Saved result scope could not be verified.');setMessages(old=>old.map(m=>m.id===messageId?result.message:m));setNotice(decision==='apply'?'Changes saved. Original entries and edit history are preserved.':'Proposal discarded. Your books were not changed.');if(decision==='apply')try{await onChanged();}catch{setError('Changes were saved, but the books could not refresh. Reload the workspace.');}});}
 return <><div className={s.pageHeading}><div><h1>Ask Raqam</h1><p>Write your history, correct your books, or ask about your records.</p></div><button className={s.secondary} disabled={busy||loading} onClick={()=>{generation.current++;setCurrent(null);setMessages([]);setCursor(null);setInput('');setError('');setNotice('');attempt.current=null;}}>New conversation</button></div>
 <div className={s.chatLayout}><aside className={s.chatSidebar}><label className={s.field}>Conversations<select value={current??''} disabled={busy||loading} onChange={e=>{const id=e.target.value;if(!id){setCurrent(null);setMessages([]);return;}void exclusive(()=>load(id));}}><option value="">New conversation</option>{history?.conversations.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><p className={`${s.small} ${s.muted}`}>History is private to this workspace. Changes stay as drafts until you save them.</p></aside>
 <div className={s.chatBody}>{loading?<p role="status">Opening your chat history…</p>:<>
 {!messages.length&&<div className={s.assistantIntro}><Icon name="spark" size={30}/><h2>Your books can start with a message.</h2><p>Include the date and year, the amount, and whether you paid or received it.</p><div className={s.suggestions}>{['On 2026-09-01 I paid rent of PKR 30,000.','What remains unreviewed?'].map(text=><button key={text} className={s.secondary} disabled={busy} onClick={()=>setInput(text)}>{text}</button>)}</div><p className={`${s.small} ${s.muted}`}>Amounts are shown for review before saving. Financial statements are calculated from the ledger.</p></div>}
 {cursor&&<button className={s.secondary} disabled={busy} onClick={()=>void exclusive(()=>load(current??undefined,true))}>Load earlier messages</button>}
 <div className={s.chatMessages}>{messages.map(m=><section key={m.id} className={`${s.chatMessage} ${m.role==='user'?s.chatOwner:''}`} aria-label={m.role==='user'?'Your message':'Raqam response'}><span className={s.small}>{m.role==='user'?'You':'Raqam'}</span><p style={{whiteSpace:'pre-wrap'}}>{m.plan&&m.state==='applied'?'Changes saved. Your original entries and edit history are preserved.':m.plan&&m.state==='discarded'?'Proposal discarded. Your books were not changed.':m.text}</p>{m.plan&&<div className={s.stack}><span className={s.badge}>{m.state==='pending'?'Changes to save':m.state==='applied'?'Saved changes':'Discarded proposal'}</span>{m.plan.actions.map((a,i)=><Change key={i} action={a}/>)}{m.state==='pending'?<><p className={`${s.small} ${s.muted}`}>Review all {m.plan.actions.length} changes. Saving applies the batch together and keeps its history.</p><div className={s.actions}><button className={s.button} disabled={busy} onClick={()=>void decide(m.id,'apply')}>Save changes</button><button className={s.secondary} disabled={busy} onClick={()=>void decide(m.id,'discard')}>Discard</button></div></>:m.state==='applied'?<p className={s.muted}>Saved. Open transaction details to read the full edit history.</p>:null}</div>}</section>)}</div>
 </>}
 {error&&<div className={s.notice}><p className={s.error} role="alert">{error}</p>{!history&&<button className={s.secondary} disabled={busy} onClick={()=>void exclusive(async()=>{await load();setLoading(false);})}>Retry chat history</button>}</div>}{notice&&<p role="status" className={s.muted}>{notice}</p>}
 <form className={s.composer} onSubmit={e=>{e.preventDefault();void send(input);}}><label className={s.field} htmlFor="chat-message">Your message</label><textarea id="chat-message" rows={3} maxLength={6000} value={input} disabled={busy||loading||!history} onChange={e=>setInput(e.target.value)} placeholder="Tell Raqam what happened, or what you want to change…"/><div className={s.actions}><span role="status" className={`${s.small} ${s.muted}`}>{busy?'Working on your request…':'Review a proposal, then say “save these” or press Save changes.'}</span><button className={s.button} disabled={busy||loading||!history||!input.trim()}>Send</button></div></form>
 </div></div></>;
}
