'use client';
import { useState } from 'react';
import type { Transaction } from '../../lib/contracts/index.ts';
import { money, summarize } from '../../lib/client/presentation.ts';
import { Icon } from '../ui/icon.tsx';
import s from '../ui/theme.module.css';
const questions = ['Which outflows need receipts?', 'What remains unreviewed?', 'What is our net cash movement?'];
type Answer = { question: string; text: string; tool: string; records: Transaction[] };
export function AssistantScreen({ demo, records, workspaceId, onRecord }: { demo: boolean; records: Transaction[]; workspaceId: string; onRecord: (record: Transaction) => void }) {
  const [question, setQuestion] = useState(''), [answer, setAnswer] = useState<Answer | null>(null), [error, setError] = useState('');
  function ask(value: string) {
    setQuestion(value); setError('');
    if (!demo) {setError('The assistant is awaiting its scoped tool API. Your question is preserved; try again after integration.'); return;}
    let found: Transaction[], text: string, tool: string;
    if (value === questions[0]) {found = records.filter(r => r.direction === 'out' && r.matchStatus !== 'accepted');tool='list_transactions';text=`${found.length} of ${records.filter(r=>r.direction==='out').length} example outflows have no accepted document match. A missing match is a review need, not proof of nonpayment.`;}
    else if (value === questions[1]) {found=records.filter(r=>r.categoryStatus!=='accepted');tool='get_review_queue';text=`${found.length} of ${records.length} example records have an unreviewed category. Pending suggestions have not been accepted.`;}
    else if (value === questions[2]) {found=records;tool='get_cash_summary';const total=summarize(records,workspaceId);text=`Net cash movement is PKR ${money(total.netMovementMinor)} across ${records.length} example transactions: PKR ${money(total.inflowMinor)} cash in minus PKR ${money(total.outflowMinor)} cash out. This is recorded cash movement, not profit.`;}
    else {setError('This example demonstrates the three questions above. Select one to see a deterministic answer and its evidence. Free-text AI is awaiting integration.');return;}
    setAnswer({question:value,text,tool,records:found});
  }
  return <><div className={s.pageHeading}><div><h1>Ask Raqam</h1><p>Understand your records, with the sources within reach.</p></div><span className={s.badge}>Read-only</span></div><div className={s.assistant}>
    <div className={s.assistantIntro}><Icon name="spark" size={34}/><h2>A question is a good place to start.</h2><p>{demo ? 'This example uses deterministic answers from the visible records. No AI provider is called.' : 'Ask about recorded cash activity, review needs and supporting evidence.'}</p><div className={s.suggestions}>{questions.map(q=><button key={q} className={s.secondary} onClick={()=>ask(q)}>{q}<Icon name="arrow" size={17}/></button>)}</div></div>
    {answer && <section className={`${s.panel} ${s.answer}`} aria-live="polite"><span className={s.badge}>Example answer · simulated tool call</span><h3>{answer.question}</h3><p>{answer.text}</p><details><summary>Action trail</summary><ol className={s.trail}><li>{answer.tool} · example workspace only</li><li>Consulted {answer.records.length} of {records.length} loaded records</li><li>Calculated by code · no changes to the cashbook</li></ol></details><div><h3>Records consulted</h3><div className={s.evidenceLinks}>{answer.records.map(r=><button key={r.id} className={s.textButton} onClick={()=>onRecord(r)}>CSV row {r.source.rowNumber} <Icon name="link" size={13}/></button>)}</div></div></section>}
    <form className={s.composer} onSubmit={event=>{event.preventDefault();ask(question);}}><label className={s.field} htmlFor="question">Your question</label><textarea id="question" value={question} onChange={event=>setQuestion(event.target.value)} placeholder="What would you like to understand?" maxLength={1000}/><div className={s.actions}><span className={`${s.small} ${s.muted}`}>Your books stay in your control.</span><button className={s.button} disabled={!question.trim()} type="submit">Ask Raqam <Icon name="arrow" size={16}/></button></div></form>
    {error && <p className={s.error} role="alert" style={{marginTop:16}}>{error}</p>}
  </div></>;
}
