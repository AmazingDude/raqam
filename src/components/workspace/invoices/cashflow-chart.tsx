'use client';
import { money } from '../../../lib/client/presentation.ts';
export function CashflowChart({points,currency}: {points: {day:number;amountMinor:string}[];currency:string}) {
  const amounts=points.map(point=>BigInt(point.amountMinor));
  const max=amounts.reduce((a,b)=>a>b?a:b,0n);
  const coords=points.map((point,index)=>`${30+(point.day-1)*11},${115-(max?Number(amounts[index]!*90n/max):0)}`);
  const path=coords.length?`M ${coords.join(' L ')}`:'';
  return <svg viewBox="0 0 380 140" fill="var(--rq-chart-ink)" style={{fontFamily:'inherit',fontVariantNumeric:'tabular-nums'}} width="100%" height="100%" role="img" aria-label={`Invoice amounts marked paid, grouped by issue date in ${currency}. This is not bank cash flow.`}>
    {[25,70,115].map(y=><line key={y} x1="30" y1={y} x2="360" y2={y} stroke="var(--rq-chart-ink)" strokeOpacity="0.45"/>)}
    <text x="30" y="15" fontSize="11">{currency} {money(max.toString())}</text>
    <path d={path} fill="none" stroke="var(--rq-chart-ink)" strokeWidth="2.5"/>
    {[1,8,15,22,31].map(day=><text key={day} x={30+(day-1)*11} y="134" fontSize="11" textAnchor="middle">{day}</text>)}
    {!max&&<g><rect x="58" y="49" width="274" height="30" rx="8" fill="var(--surface)"/><text x="195" y="68" fontSize="11" textAnchor="middle">No invoices marked paid in this period</text></g>}
  </svg>;
}
