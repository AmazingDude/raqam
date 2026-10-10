'use client';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { money } from '../../lib/client/presentation.ts';
import { Icon, Mark } from '../ui/icon.tsx';
import s from './landing.module.css';

const tabs=[{id:'cashbook',label:'Cashbook',icon:'book'},{id:'evidence',label:'Receipt review',icon:'file'},{id:'assistant',label:'Ask Raqam',icon:'spark'}] as const;
type Tab=typeof tabs[number]['id'];
type Filter='all'|'reviewed'|'pending';
const rows=[
  {id:'aster',title:'Brand identity · Aster Studio',date:'10 Oct',category:'Customer receipts',reviewed:true,amount:6400000n,direction:'in'},
  {id:'northstar',title:'Northstar Cloud subscription',date:'8 Oct',category:'Software & tools',reviewed:false,amount:850000n,direction:'out'},
  {id:'rent',title:'October studio rent',date:'7 Oct',category:'Premises & utilities',reviewed:true,amount:1250000n,direction:'out'},
  {id:'k2',title:'Design retainer · K2 Ventures',date:'4 Oct',category:'Customer receipts',reviewed:true,amount:2800000n,direction:'in'},
  {id:'fiber',title:'Fiber connection',date:'3 Oct',category:'Premises & utilities',reviewed:false,amount:650000n,direction:'out'},
];

export function LandingPreview() {
  const id=useId(),refs=useRef<(HTMLButtonElement|null)[]>([]);
  const [tab,setTab]=useState<Tab>('cashbook'),[filter,setFilter]=useState<Filter>('all'),[mode,setMode]=useState<'reviewed'|'original'>('reviewed');
  const filtered=rows.filter(row=>filter==='all'||(filter==='reviewed'?row.reviewed:!row.reviewed));
  const cashIn=filtered.reduce((total,row)=>total+(row.direction==='in'?row.amount:0n),0n);
  const cashOut=filtered.reduce((total,row)=>total+(row.direction==='out'?row.amount:0n),0n);
  const totals: [string,bigint][]=[['Cash in',cashIn],['Cash out',cashOut],['Net cash movement',cashIn-cashOut]];
  return <section className={s.preview} aria-label="Interactive Raqam example">
    <div className={s.previewBar}><span className={s.previewBrand}><Mark/>raqam <span>/ Sunday Studio</span></span><span className={s.exampleLabel}>Synthetic example · PKR</span></div>
    <div className={s.previewLayout}>
      <div className={s.previewNav} role="tablist" aria-label="Product preview">
        {tabs.map((item,index)=><button key={item.id} ref={element=>{refs.current[index]=element;}} type="button" role="tab" id={`${id}-${item.id}`} aria-controls={`${id}-${item.id}-panel`} aria-selected={tab===item.id} tabIndex={tab===item.id?0:-1} className={tab===item.id?s.previewNavActive:''} onClick={()=>setTab(item.id)} onKeyDown={event=>{let next=index;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();setTab(tabs[next]!.id);refs.current[next]?.focus();}}><Icon name={item.icon} size={18}/>{item.label}</button>)}
      </div>
      {tabs.map(item=><div key={item.id} hidden={tab!==item.id} className={s.previewPanel} role="tabpanel" id={`${id}-${item.id}-panel`} aria-labelledby={`${id}-${item.id}`} tabIndex={0}>
        {item.id==='cashbook'&&<>
          <div className={s.previewHeading}><div><h2>Your cashbook, together.</h2><p>A clear view of your recorded cash activity.</p></div><Link href="/demo" className={s.previewOpen} aria-label="Open the full example workspace"><Icon name="arrow" size={18}/></Link></div>
          <div className={s.previewTotals} aria-label="Cash totals for visible example records" aria-live="polite">{totals.map(([label,value])=><div key={label}><span>{label} <small>PKR</small></span><strong>{money(value.toString())}</strong></div>)}</div>
          <div className={s.previewFilters} aria-label="Filter example records">{([{id:'all',label:'All records',count:5},{id:'reviewed',label:'Reviewed',count:3},{id:'pending',label:'Needs review',count:2}] as const).map(option=><button key={option.id} type="button" aria-pressed={filter===option.id} onClick={()=>setFilter(option.id)} className={filter===option.id?s.filterActive:''}>{option.label}<span>{option.count}</span></button>)}</div>
          <div className={s.previewRows} aria-live="polite"><div className={s.rowHeader}><span>Transaction</span><span>Category review</span><span>Amount · PKR</span></div>{filtered.map(row=><div className={s.previewRow} key={row.id}><div className={s.previewRecord}><span className={s.rowIcon}><Icon name={row.direction==='in'?'arrow':'file'} size={17}/></span><div><strong>{row.title}</strong><span>{row.date} 2026 · {row.category}</span></div></div><span className={row.reviewed?s.reviewed:s.pending}>{row.reviewed?'Reviewed':'Needs review'}</span><strong className={s.rowAmount}>{row.direction==='in'?'+':'−'}{money(row.amount.toString())}</strong></div>)}</div>
          <p className={s.previewFoot}>{filtered.length} visible example records · Totals follow this filter. Review status is separate.</p>
        </>}
        {item.id==='evidence'&&<>
          <div className={s.previewHeading}><div><h2>The source, beside the details.</h2><p>Compare a proposed extraction with a reviewed correction.</p></div></div>
          <div className={s.evidenceGrid}><div className={s.receiptPaper}><span className={s.paperMark}>N</span><h3>Northstar Cloud</h3><p>Receipt #NS-101 · Sunday Studio</p><div className={s.paperLine}><span>Date</span><strong>8 Oct 2026</strong></div><div className={s.paperLine}><span>Cloud subscription</span><strong>8,500.00</strong></div><div className={s.paperTotal}><span>Total · PKR</span><strong>8,500.00</strong></div><small>Synthetic source. A receipt alone does not prove bank settlement.</small></div><div><div className={s.evidenceToggle} aria-label="Evidence version"><button type="button" aria-pressed={mode==='reviewed'} onClick={()=>setMode('reviewed')}>Reviewed details</button><button type="button" aria-pressed={mode==='original'} onClick={()=>setMode('original')}>Original extraction</button></div><dl className={s.fieldList}><div><dt>Counterparty</dt><dd>{mode==='reviewed'?'Northstar Cloud':'Northstar Cl0ud'}</dd></div><div><dt>Date</dt><dd>8 Oct 2026</dd></div><div><dt>Reference</dt><dd>{mode==='reviewed'?'NS-101':'Unknown · needs review'}</dd></div><div><dt>Total</dt><dd>PKR 8,500.00</dd></div></dl><p className={s.evidenceNote} aria-live="polite">{mode==='reviewed'?'Example correction: the owner checked the name and reference against the receipt. Original extraction is preserved.':'Example AI proposal: the name is misread and the reference is unknown. These details still need human review.'}</p></div></div>
        </>}
        {item.id==='assistant'&&<>
          <div className={s.previewHeading}><div><h2>A question for your cashbook.</h2><p>An illustrative answer, grounded in these five example records.</p></div></div><div className={s.previewChat}><div className={s.userQuestion}>How did cash move in October?</div><div className={s.sampleAnswer}><span className={s.assistantMark}><Icon name="spark" size={18}/> raqam</span><p>These five imported example records show <strong>PKR 92,000.00 cash in</strong> and <strong>PKR 27,500.00 cash out</strong>. Net cash movement is <strong>PKR 64,500.00</strong>.</p><p>Two records still need category review. Their cash movements are already included in the recorded totals.</p><details className={s.sourceDetails}><summary><Icon name="link" size={14}/> Inspect 5 example source records</summary><ul>{rows.map(row=><li key={row.id}>{row.title}: {row.direction==='in'?'+':'−'}PKR {money(row.amount.toString())}</li>)}</ul></details></div><p className={s.previewFoot}>Sample response · No live model call · Net movement is not profit.</p></div>
        </>}
      </div>)}
    </div>
  </section>;
}
