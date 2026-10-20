'use client';
import { useEffect,useRef,useState } from 'react';
import { api } from '../../lib/client/api.ts';
import { usePrivateRequests } from '../../lib/client/use-private-requests.ts';
import type { ChatAction,ChatHistory,ChatMessage } from '../../lib/contracts/chat.ts';
import { money,categoryLabels } from '../../lib/client/presentation.ts';
import { Icon,Mark } from '../ui/icon.tsx';
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

function groupedConversations(history:ChatHistory|null){
 const groups:{label:string;items:NonNullable<ChatHistory['conversations']>}[]=[];
 if(!history)return groups;
 const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime(),day=86400000;
 for(const conversation of history.conversations){
  const date=new Date(conversation.createdAt),age=Math.floor((today-new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime())/day);
  const label=age<=0?'Today':age===1?'Yesterday':age<7?'Previous 7 days':'Earlier';
  let group=groups.find(item=>item.label===label);if(!group){group={label,items:[]};groups.push(group);}group.items.push(conversation);
 }
 return groups;
}

function ConversationList({history,loading,current,busy,onSelect,className}:{history:ChatHistory|null;loading:boolean;current:string|null;busy:boolean;onSelect:(id:string)=>void;className:string|undefined}){
 if(loading)return <nav className={className} aria-label="Recent conversations" aria-busy="true"><span className={s.srOnly} role="status">Loading conversations…</span>{[0,1,2,3,4].map(row=><span key={row} className={s.chatConversationSkeleton} aria-hidden="true"><i/><i/></span>)}</nav>;
 const groups=groupedConversations(history);
 return <nav className={className} aria-label="Recent conversations">{groups.length?groups.map(group=><section className={s.chatDateGroup} key={group.label}><h3>{group.label}</h3>{group.items.map(conversation=><button key={conversation.id} type="button" className={`${s.chatConversation} ${current===conversation.id?s.chatConversationActive:''}`} aria-current={current===conversation.id?'page':undefined} disabled={busy} onClick={()=>onSelect(conversation.id)}><span className={s.chatConversationTitle}>{conversation.title||'Untitled conversation'}</span><time className={s.small} dateTime={conversation.createdAt}>{new Date(conversation.createdAt).toLocaleDateString('en-PK',{day:'numeric',month:'short'})}</time></button>)}</section>):<p className={`${s.small} ${s.muted}`}>Your recent chats will appear here.</p>}</nav>;
}

function ThreadSkeleton(){return <div className={s.chatThreadSkeleton} role="status" aria-label="Opening your conversation"><span/><span/><span/><span/><span className={s.srOnly}>Opening your conversation…</span></div>;}

export function ChatScreen({workspaceId,onChanged}:{workspaceId:string;onChanged:()=>Promise<void>}){
 const run=usePrivateRequests(),locked=useRef(false),generation=useRef(0),attempt=useRef<{conversationId:string|null;requestId:string;message:string}|null>(null);
 const [history,setHistory]=useState<ChatHistory|null>(null),[current,setCurrent]=useState<string|null>(null),[messages,setMessages]=useState<ChatMessage[]>([]);
 const [input,setInput]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[cursor,setCursor]=useState<string|null>(null);
 const mobileHistory=useRef<HTMLDetailsElement>(null),scrollRef=useRef<HTMLDivElement>(null),composerRef=useRef<HTMLTextAreaElement>(null),stickToBottom=useRef(true);
 async function load(id?:string,more=false){const version=++generation.current;const result=await run(signal=>api.chatHistory(signal,id,more?cursor??undefined:undefined));if(result.workspaceId!==workspaceId||(id&&result.conversation?.id!==id))throw new Error('Conversation scope could not be verified. Reload the workspace.');if(version!==generation.current)return;setHistory(result);setCurrent(result.conversation?.id??null);setMessages(previous=>more?[...result.messages,...previous.filter(m=>!result.messages.some(n=>n.id===m.id))]:result.messages);setCursor(result.nextCursor);}
 useEffect(()=>{void load().catch(e=>{if(!(e instanceof Error&&e.name==='AbortError'))setError(e instanceof Error?e.message:'Chat history could not load.');}).finally(()=>setLoading(false));return()=>{generation.current++;};},[workspaceId]);
 useEffect(()=>{const node=scrollRef.current;if(node&&stickToBottom.current)node.scrollTo({top:node.scrollHeight,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});},[messages,busy,loading]);
 useEffect(()=>{const area=composerRef.current;if(area){area.style.height='auto';area.style.height=`${Math.min(area.scrollHeight,192)}px`;area.style.overflowY=area.scrollHeight>192?'auto':'hidden';}},[input]);
 async function exclusive(work:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setError('');setNotice('');try{await work();}catch(e){if(!(e instanceof Error&&e.name==='AbortError'))setError(e instanceof Error?e.message:'The chat request failed. Retry.');}finally{locked.current=false;setBusy(false);}}
 async function send(value:string){if(!value.trim())return;stickToBottom.current=true;await exclusive(async()=>{
  if(attempt.current?.message!==value.trim()||attempt.current.conversationId!==current)attempt.current={conversationId:current,requestId:crypto.randomUUID(),message:value.trim()};
  const result=await run(signal=>api.chatSend(attempt.current!,signal));if(result.workspaceId!==workspaceId)throw new Error('Chat scope could not be verified.');
  attempt.current=null;setInput('');await load(result.conversationId);
  // The server returns a plain saved acknowledgement only for an explicit
  // confirmation. Refresh summaries even if only a new proposal was returned.
  if(!result.message.plan)try{await onChanged();}catch{setNotice('Chat saved. Reload the workspace if its books have not refreshed.');}
 });}
 async function decide(messageId:string,decision:'apply'|'discard'){await exclusive(async()=>{const result=await run(signal=>api.chatDecide({messageId,decision},signal));if(result.workspaceId!==workspaceId)throw new Error('Saved result scope could not be verified.');setMessages(old=>old.map(m=>m.id===messageId?result.message:m));setNotice(decision==='apply'?'Changes saved. Original entries and edit history are preserved.':'Proposal discarded. Your books were not changed.');if(decision==='apply')try{await onChanged();}catch{setError('Changes were saved, but the books could not refresh. Reload the workspace.');}});}
 function startConversation(){mobileHistory.current?.removeAttribute('open');generation.current++;setCurrent(null);setMessages([]);setCursor(null);setInput('');setError('');setNotice('');attempt.current=null;stickToBottom.current=true;}
 function chooseConversation(id:string){mobileHistory.current?.removeAttribute('open');if(id!==current){stickToBottom.current=true;void exclusive(()=>load(id));}}
 function onComposerKeyDown(event:React.KeyboardEvent<HTMLTextAreaElement>){if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send(input);}}
 const suggestions=[{label:'Write your history',prompt:'On 2026-09-01 I paid rent of PKR 30,000.'},{label:'Correct your books',prompt:'I need to correct a cashbook entry.'},{label:'Ask about your records',prompt:'What remains unreviewed?'}];
 return <div className={s.chatLayout}>
  <aside className={s.chatSidebar} aria-label="Conversation navigation">
   <button type="button" className={`${s.button} ${s.chatNewButton}`} disabled={busy||loading} onClick={startConversation}><Icon name="plus" size={18}/>New conversation</button>
   <div className={s.chatSidebarHeading}><div><h2>Recent conversations</h2><div className={s.chatSidebarMeta}><p className={`${s.small} ${s.muted}`}>Private to this workspace</p><span className={s.chatCount}>{history?.conversations.length??0}</span></div></div></div>
   <ConversationList history={history} loading={loading} current={current} busy={busy} className={s.chatConversationList} onSelect={chooseConversation}/>
   <p className={s.chatSidebarNote}>Changes stay as drafts until you review and save them.</p>
  </aside>
  <details ref={mobileHistory} className={s.chatHistoryDisclosure}><summary><span>Recent conversations</span><span className={s.small}>{history?.conversations.length??0}</span></summary><div className={s.chatMobileHistory}><button type="button" className={`${s.button} ${s.chatNewButton}`} disabled={busy||loading} onClick={startConversation}><Icon name="plus" size={18}/>New conversation</button><p className={`${s.small} ${s.muted}`}>Private to this workspace</p><ConversationList history={history} loading={loading} current={current} busy={busy} className={s.chatConversationList} onSelect={chooseConversation}/><p className={s.chatSidebarNote}>Changes stay as drafts until you review and save them.</p></div></details>
  <section className={s.chatBody} aria-label="Ask Raqam conversation">
   <form className={`${s.composer} ${s.chatComposer}`} onSubmit={event=>{event.preventDefault();void send(input);}}><label className={s.srOnly} htmlFor="chat-message">Your message</label><textarea ref={composerRef} id="chat-message" rows={1} maxLength={6000} value={input} disabled={busy||loading||!history} onKeyDown={onComposerKeyDown} onChange={event=>setInput(event.target.value)} placeholder="Tell Raqam what happened, or what you want to change…" aria-describedby="chat-message-hint"/><div className={s.chatComposerFooter}><span id="chat-message-hint" role="status" className={`${s.small} ${s.muted}`}>{busy?'Working on your request…':'Review a proposal, then say “save these” or press Save changes.'}</span><button type="submit" className={s.chatSend} aria-label="Send" disabled={busy||loading||!history||!input.trim()}><Icon name="arrow" size={19}/></button></div></form>
   <div ref={scrollRef} className={s.chatScroll} aria-label="Conversation messages" aria-live="polite" onScroll={event=>{const node=event.currentTarget;stickToBottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<120;}}>
    {loading?<ThreadSkeleton/>:<>
     {!messages.length&&<div className={s.assistantIntro}><span className={s.chatGreetingMark}><Mark size={34}/></span><h2>Your books can start with a message.</h2><p>Include the date and year, the amount, and whether you paid or received it.</p><div className={s.suggestions}>{suggestions.map(item=><button key={item.label} type="button" className={s.chatSuggestion} disabled={busy} onClick={()=>setInput(item.prompt)}>{item.label}<Icon name="chevron" size={15}/></button>)}</div><p className={`${s.small} ${s.muted}`}>Amounts are shown for review before saving. Financial statements are calculated from the ledger.</p></div>}
     {cursor&&<button className={s.secondary} disabled={busy} onClick={()=>void exclusive(()=>load(current??undefined,true))}>Load earlier messages</button>}
     <div className={s.chatMessages}>{messages.map(m=><section key={m.id} className={`${s.chatMessage} ${m.role==='user'?s.chatOwner:s.chatAssistant}`} aria-label={m.role==='user'?'Your message':'Raqam response'}><span className={s.chatSpeaker}>{m.role==='user'?'You':<><Mark size={16}/>Raqam</>}</span><p className={s.chatMessageText} style={{whiteSpace:'pre-wrap'}}>{m.plan&&m.state==='applied'?'Changes saved. Your original entries and edit history are preserved.':m.plan&&m.state==='discarded'?'Proposal discarded. Your books were not changed.':m.text}</p>{m.plan&&<div className={s.chatProposal}><span className={s.badge}>{m.state==='pending'?'Changes to save':m.state==='applied'?'Saved changes':'Discarded proposal'}</span>{m.plan.actions.map((a,i)=><Change key={i} action={a}/>)}{m.state==='pending'?<><p className={`${s.small} ${s.muted}`}>Review all {m.plan.actions.length} changes. Saving applies the batch together and keeps its history.</p><div className={s.actions}><button className={s.button} disabled={busy} onClick={()=>void decide(m.id,'apply')}>Save changes</button><button className={s.secondary} disabled={busy} onClick={()=>void decide(m.id,'discard')}>Discard</button></div></>:m.state==='applied'?<p className={s.muted}>Saved. Open transaction details to read the full edit history.</p>:null}</div>}</section>)}</div>
     {busy&&input.trim()&&<div className={s.chatTyping} role="status"><span className={s.chatTypingDots} aria-hidden="true"><i/><i/><i/></span><span>Raqam is responding…</span></div>}
    </>}{error&&<div className={s.notice}><p className={s.error} role="alert">{error}</p>{!history&&<button className={s.secondary} disabled={busy} onClick={()=>void exclusive(async()=>{await load();setLoading(false);})}>Retry chat history</button>}</div>}{notice&&<p role="status" className={s.muted}>{notice}</p>}
   </div>

  </section>
 </div>;
}
