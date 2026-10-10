'use client';
import { useState } from 'react';
import type { CashSummary, Transaction } from '../../lib/contracts/index.ts';
import { categoryLabels, displayDate, money, summarize } from '../../lib/client/presentation.ts';
import { Icon } from '../ui/icon.tsx';
import s from '../ui/theme.module.css';
export function Cashbook({ records, workspaceId, unresolved, onRecord, onImport, onReview, hasMore, loadMore, live = false, liveSummary = null, summaryError = '', onRefreshSummary }: {
  records: Transaction[]; workspaceId: string; unresolved: number; onRecord: (record: Transaction) => void;
  onImport: () => void; onReview: () => void; hasMore: boolean; loadMore?: (() => Promise<void>) | undefined;
  live?: boolean; liveSummary?: CashSummary | null; summaryError?: string; onRefreshSummary?: (() => Promise<void>) | undefined;
}) {
  const [search, setSearch] = useState(''), [direction, setDirection] = useState('all'), [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [loadingMore, setLoadingMore] = useState(false), [loadError, setLoadError] = useState('');
  const filtered = records.filter(r => (!search || `${r.description} ${r.reference ?? ''}`.toLowerCase().includes(search.toLowerCase())) &&
    (direction === 'all' || r.direction === direction) && (!from || r.date >= from) && (!to || r.date <= to)).sort((a,b) => b.date.localeCompare(a.date));
  const summary = live ? liveSummary : summarize(filtered, workspaceId, unresolved);
  const excluded = live ? summary?.unresolvedImportRowCount : unresolved;
  const accepted = filtered.filter(r => r.categoryStatus === 'accepted').length;
  const matched = filtered.filter(r => r.matchStatus === 'accepted').length;
  const reversed = !!from && !!to && from > to;
  return <>
    <div className={s.pageHeading}><div><h1>Cashbook</h1><p>A clear view of your recorded cash activity.</p></div><button className={s.button} onClick={onImport}><Icon name="plus" size={17}/> Import transactions</button></div>
    {reversed && <p className={s.error} role="alert">The end date is before the start date. Adjust the date range.</p>}
    {live && <p className={`${s.small} ${s.muted}`} style={{marginBottom:16}}>Whole-workspace cash totals{summary ? ` · ${summary.transactionCount} imported records` : ' · unavailable'}. Table filters below change the visible rows only.</p>}
    {summaryError && <p className={s.error} role="alert">{summaryError} {onRefreshSummary && <button className={s.textButton} onClick={() => void onRefreshSummary().catch(() => {})}>Retry cashbook totals</button>}</p>}
    <div className={s.totals} aria-label={live ? 'Whole-workspace cash totals' : 'Cash totals for the filtered loaded records'}>
      {[['Cash in', summary?.inflowMinor ?? null, 'Imported inflows'], ['Cash out', summary?.outflowMinor ?? null, 'Imported outflows'], ['Net cash movement', summary?.netMovementMinor ?? null, 'Cash in minus cash out']].map(([label, amount, foot]) => <section className={s.total} key={label}><div className={s.totalLabel}>{label}<Icon name="arrow" size={16}/></div><p className={s.totalValue}><span>PKR</span>{money(amount ?? null)}</p><p className={s.totalFoot}>{foot}</p></section>)}
    </div>
    <div className={s.coverage}><span><strong>{accepted}/{filtered.length}</strong> visible categories reviewed</span><span><strong>{matched}/{filtered.length}</strong> visible documents matched</span>{excluded !== undefined && excluded > 0 && <span className={`${s.badge} ${s.pending}`}>{excluded} import {excluded === 1 ? 'row' : 'rows'} excluded</span>}<button className={s.textButton} onClick={onReview}>Open review queue</button></div>
    <section className={s.panel} aria-label="Transactions">
      <div className={s.panelHeading}><h2>Transactions <span className={s.muted}>({filtered.length})</span></h2><span className={`${s.small} ${s.muted}`}>{live ? `PKR · ${filtered.length} visible records · workspace totals above` : `PKR · totals cover these ${filtered.length} records${hasMore ? ' only' : ''}`}</span></div>
      <div className={s.filters}>
        <label className={`${s.field} ${s.searchField}`}>Search records<Icon name="search" size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Description or reference" type="search"/></label>
        <label className={s.field}>Direction<select value={direction} onChange={event => setDirection(event.target.value)}><option value="all">All movement</option><option value="in">Cash in</option><option value="out">Cash out</option></select></label>
        <label className={s.field}>From<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label className={s.field}>To<input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
        {(search || direction !== 'all' || from || to) && <button className={s.textButton} onClick={() => {setSearch('');setDirection('all');setFrom('');setTo('');}}>Clear filters</button>}
      </div>
      {filtered.length ? <table className={s.table}><thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Category</th><th scope="col">Evidence</th><th scope="col" className={s.amount}>Amount · PKR</th></tr></thead><tbody>{filtered.map(record => <tr key={record.id}>
        <td>{displayDate(record.date)}</td><td><div className={s.recordTitle}><span className={s.recordIcon}><Icon name={record.direction === 'in' ? 'arrow' : 'file'} size={16}/></span><div><button className={s.rowLink} onClick={() => onRecord(record)}>{record.description}</button><small>CSV row {record.source.rowNumber} {record.reference ? `/ ${record.reference}` : ''}</small></div></div></td>
        <td data-label="Category">{record.categoryStatus === 'accepted' && record.category ? categoryLabels[record.category] : <span className={`${s.badge} ${s.pending}`}>{record.categoryStatus === 'proposed' ? 'Proposed' : record.categoryStatus === 'rejected' ? 'Uncategorized' : 'Needs review'}</span>}</td>
        <td data-label="Evidence"><span className={`${s.badge} ${record.matchStatus === 'accepted' ? s.good : ''}`}>{record.matchStatus === 'accepted' ? 'Matched' : record.matchStatus === 'proposed' ? 'Match proposed' : 'Unmatched'}</span></td>
        <td className={s.amount}>{record.direction === 'in' ? '+' : '−'}{money(record.amountMinor)}</td>
      </tr>)}</tbody></table> : <div className={s.empty}><Icon name="book" size={32}/><h2>{records.length ? 'No records match these filters.' : 'Your cashbook starts here.'}</h2><p>{records.length ? 'Try another description or clear the filters.' : 'Import your transactions and review the records before assigning categories.'}</p><button className={s.secondary} onClick={onImport}>Open import</button></div>}
      <div className={s.tableFooter}>{filtered.length} of {records.length} loaded records · Supporting documents do not add cash to these totals.{hasMore && loadMore && <button className={s.textButton} disabled={loadingMore} onClick={async () => { if (loadingMore) return; setLoadingMore(true); setLoadError(''); try {await loadMore();} catch {setLoadError('More records could not be loaded. Retry.');} finally {setLoadingMore(false);} }}>{loadingMore ? 'Loading…' : 'Load more records'}</button>}{loadError && <p className={s.error} role="alert">{loadError}</p>}</div>
    </section>
    {summary && (live || accepted > 0) && <section className={s.panel} style={{marginTop:24}}><div className={s.panelHeading}><h2>Reviewed categories</h2><span className={`${s.small} ${s.muted}`}>{live ? 'Whole workspace · accepted categories only' : `${accepted} accepted records only`}</span></div><div className={s.proposal}>{Object.entries(summary.categories).map(([category,bucket]) => <div className={s.proposalHeading} key={category}><span>{categoryLabels[category as keyof typeof categoryLabels]}</span><span className={s.small}>In PKR {money(bucket!.inflowMinor)} / Out PKR {money(bucket!.outflowMinor)}</span></div>)}<div className={s.proposalHeading}><strong>Unreviewed remainder</strong><span className={s.small}>In PKR {money(summary.unreviewed.inflowMinor)} / Out PKR {money(summary.unreviewed.outflowMinor)}</span></div></div></section>}
  </>;
}
