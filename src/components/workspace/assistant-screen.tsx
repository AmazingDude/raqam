'use client';
import { useEffect, useRef, useState } from 'react';
import type { Transaction } from '../../lib/contracts/index.ts';
import type { AssistantResponse } from '../../lib/contracts/assistant.ts';
import { api, ClientError } from '../../lib/client/api.ts';
import { usePrivateRequests } from '../../lib/client/use-private-requests.ts';
import { money, summarize } from '../../lib/client/presentation.ts';
import { Dialog } from '../ui/dialog.tsx';
import { Icon } from '../ui/icon.tsx';
import s from '../ui/theme.module.css';
const questions = ['Which outflows need receipts?', 'What remains unreviewed?', 'What is our net cash movement?'];
type Answer = Pick<AssistantResponse, 'question' | 'text' | 'records' | 'actionTrail' | 'partial' | 'citations'>;
export function AssistantScreen({ demo, records, workspaceId, onRecord }: { demo: boolean; records: Transaction[]; workspaceId: string; onRecord: (record: Transaction) => void }) {
  const run = usePrivateRequests(), lock = useRef(false);
  const [question, setQuestion] = useState(''), [answer, setAnswer] = useState<Answer | null>(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [source, setSource] = useState<{ url: string; expiresAt: number } | null>(null);
  useEffect(() => { if (!source) return; const timer = setTimeout(() => setSource(null), Math.max(0, source.expiresAt - Date.now())); return () => clearTimeout(timer); }, [source]);
  async function ask(value: string) {
    if (lock.current || !value.trim()) return;
    setQuestion(value); setError(''); setAnswer(null);
    if (!demo) {
      lock.current = true; setBusy(true);
      try {
        const result = await run(signal => api.assistant(value, signal));
        if (result.workspaceId !== workspaceId || result.question !== value.trim()) throw new ClientError('UNAVAILABLE', 'The answer scope could not be verified. Please retry.');
        setAnswer(result);
      } catch (failure) { if (!(failure instanceof Error && failure.name === 'AbortError')) setError(failure instanceof Error ? failure.message : 'The assistant could not answer. Your question is preserved; please retry.'); }
      finally { lock.current = false; setBusy(false); }
      return;
    }
    let found: Transaction[], text: string, tool: AssistantResponse['actionTrail'][number]['tool'];
    if (value === questions[0]) {found = records.filter(r => r.direction === 'out' && r.matchStatus !== 'accepted');tool='list_transactions';text=`${found.length} of ${records.filter(r=>r.direction==='out').length} example outflows have no accepted document match. A missing match is a review need, not proof of nonpayment.`;}
    else if (value === questions[1]) {found=records.filter(r=>r.categoryStatus!=='accepted');tool='get_review_queue';text=`${found.length} of ${records.length} example records have an unreviewed category. Pending suggestions have not been accepted.`;}
    else if (value === questions[2]) {found=records;tool='get_cash_summary';const total=summarize(records,workspaceId);text=`Net cash movement is PKR ${money(total.netMovementMinor)} across ${records.length} example transactions: PKR ${money(total.inflowMinor)} cash in minus PKR ${money(total.outflowMinor)} cash out. This is recorded cash movement, not profit.`;}
    else {setError('This example demonstrates the three questions above. Open your workspace to ask about your own records.');return;}
    setAnswer({ question:value,text,records:found,partial:false,citations:[],actionTrail:[{tool,recordsConsulted:found.length,partial:false,factRefs:[]}] });
  }
  async function openSource(id: string) {
    setError('');
    try {const link=await run(signal=>api.sourceLink(id,signal));setSource({url:link.signedUrl,expiresAt:Date.now()+link.expiresInSeconds*1000});}
    catch(failure) {if(!(failure instanceof Error && failure.name==='AbortError'))setError(failure instanceof Error?failure.message:'The source could not open. Please retry.');}
  }
  return <><div className={s.pageHeading}><div><h1>Ask Raqam</h1><p>Understand your records, with the sources within reach.</p></div><span className={s.badge}>Read-only</span></div><div className={s.assistant}>
    <div className={s.assistantIntro}><Icon name="spark" size={34}/><h2>A question is a good place to start.</h2><p>{demo ? 'This example uses deterministic answers from the visible records. No AI provider is called.' : 'Ask about recorded cash activity, review needs and supporting evidence.'}</p><div className={s.suggestions}>{questions.map(q=><button key={q} className={s.secondary} disabled={busy} onClick={()=>void ask(q)}>{q}<Icon name="arrow" size={17}/></button>)}</div></div>
    {answer && <section className={`${s.panel} ${s.answer}`} aria-live="polite"><span className={s.badge}>{demo?'Example answer · simulated tool call':answer.partial?'Partial workspace answer':'Workspace answer'}</span><h3>{answer.question}</h3><p style={{whiteSpace:'pre-line'}}>{answer.text}</p>{answer.partial&&<p className={s.muted}>This answer has limited coverage. Refine the question or request the next page before treating a list as complete.</p>}<details><summary>Action trail</summary><ol className={s.trail}>{answer.actionTrail.map((entry,i)=><li key={i}>{entry.tool} · consulted {entry.recordsConsulted} scoped records{entry.partial?' · partial page':''}</li>)}<li>Financial values rendered by code · no changes to the cashbook</li></ol></details>{(answer.records.length>0||answer.citations.some(c=>c.kind==='document'))&&<div><h3>Records consulted</h3><div className={s.evidenceLinks}>{answer.records.map(r=><button key={r.id} className={s.textButton} onClick={()=>onRecord(r)}>{r.description.slice(0,70)} · CSV row {r.source.rowNumber} <Icon name="link" size={13}/></button>)}{answer.citations.filter(c=>c.kind==='document').map(c=><button key={c.id} className={s.textButton} onClick={()=>void openSource(c.source.sourceId)}>Supporting document <Icon name="link" size={13}/></button>)}</div></div>}</section>}
    <form className={s.composer} onSubmit={event=>{event.preventDefault();void ask(question);}}><label className={s.field} htmlFor="question">Your question</label><textarea id="question" value={question} disabled={busy} onChange={event=>setQuestion(event.target.value)} placeholder="What would you like to understand?" maxLength={1000}/><div className={s.actions}><span className={`${s.small} ${s.muted}`} role={busy?'status':undefined}>{busy?'Checking your workspace…':'Your books stay in your control.'}</span><button className={s.button} disabled={busy||!question.trim()} type="submit">{busy?'Asking Raqam…':'Ask Raqam'} <Icon name="arrow" size={16}/></button></div></form>
    {error && <p className={s.error} role="alert" style={{marginTop:16}}>{error}</p>}
  </div>{source&&<Dialog title="Supporting document" onClose={()=>setSource(null)}><img src={source.url} alt="Private supporting document" referrerPolicy="no-referrer" style={{maxWidth:'100%',height:'auto'}}/><p className={s.muted}>This private preview expires automatically.</p></Dialog>}</>;
}
