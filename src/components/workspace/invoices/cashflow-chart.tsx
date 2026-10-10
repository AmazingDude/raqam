'use client';
import { money } from '../../../lib/client/presentation.ts';
export function CashflowChart({points,currency}: {points: {day:number;amountMinor:string}[];currency:string}) {
  const amounts=points.map(point=>BigInt(point.amountMinor));
  const max=amounts.reduce((a,b)=>a>b?a:b,0n);
  const coords=points.map((point,index)=>`${30+(point.day-1)*11},${95-(max?Number(amounts[index]!*80n/max):0)}`);
  const path=coords.length?`M ${coords.join(' L ')}`:'';
  return <svg viewBox="0 0 380 115" width="100%" height="100%" role="img" aria-label={`Invoice amounts marked paid, grouped by issue date in ${currency}. This is not bank cash flow.`}>
    {[15,55,95].map(y=><line key={y} x1="30" y1={y} x2="360" y2={y} stroke="#e5e7eb"/>)}
    <text x="30" y="10" fontSize="9">{currency} {money(max.toString())}</text>
    <path d={path} fill="none" stroke="#0ea5e9" strokeWidth="2.5"/>
    {[1,8,15,22,31].map(day=><text key={day} x={30+(day-1)*11} y="109" fontSize="9" textAnchor="middle">{day}</text>)}
    {!max&&<text x="195" y="55" fontSize="11" textAnchor="middle">No invoices marked paid in this period</text>}
  </svg>;
}
