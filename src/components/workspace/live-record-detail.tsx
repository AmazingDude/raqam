'use client';
import { useEffect, useRef, useState } from 'react';
import type { Category, Transaction } from '../../lib/contracts/index.ts';
import { CATEGORIES } from '../../lib/contracts/index.ts';
import { api, ClientError } from '../../lib/client/api.ts';
import { usePrivateRequests } from '../../lib/client/use-private-requests.ts';
import { categoryLabels, displayDate, money } from '../../lib/client/presentation.ts';
import { Dialog } from '../ui/dialog.tsx';
import s from '../ui/theme.module.css';

type Detail = Awaited<ReturnType<typeof api.transaction>>;
type History = Awaited<ReturnType<typeof api.transactionReviews>>;
export function LiveRecordDetail({ record, onClose, onChanged }: { record: Transaction; onClose: () => void; onChanged: () => Promise<void> }) {
  const run = usePrivateRequests(), locked = useRef(false);
  const [detail, setDetail] = useState<Detail | null>(null), [history, setHistory] = useState<History | null>(null);
  const [description, setDescription] = useState(record.description), [category, setCategory] = useState<Category | null>(record.category);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [historyError, setHistoryError] = useState(''), [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false), [compared, setCompared] = useState(false), [latestLoaded, setLatestLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void run(signal => api.transaction(record.id, signal)).then(next => {
      if (!active) return; setDetail(next); setDescription(next.transaction.description); setCategory(next.transaction.category);
    }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'Transaction could not load. Retry.'); });
    void run(signal => api.transactionReviews(record.id, signal)).then(next => { if (active) setHistory(next); }).catch(() => { if (active) setHistoryError('Review history could not load. Retry.'); });
    return () => { active = false; };
  }, [record.id, run]);
  async function exclusive(work: () => Promise<void>) {
    if (locked.current) return; locked.current = true; setBusy(true); setError('');
    try { await work(); } catch (failure) {
      if (failure instanceof ClientError && failure.code === 'CONFLICT') { setConflict(true); setCompared(false); setLatestLoaded(false); }
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError(failure instanceof Error ? failure.message : 'The review could not complete. Retry.');
    } finally { locked.current = false; setBusy(false); }
  }
  async function refreshHistory(more = false) {
    setHistoryError('');
    try {
      const page = await run(signal => api.transactionReviews(record.id, signal, more ? history?.nextCursor ?? null : null));
      setHistory(current => more && current ? { items: [...current.items, ...page.items], nextCursor: page.nextCursor } : page);
    } catch { setHistoryError('Review history could not load. Retry.'); }
  }
  const current = detail?.transaction ?? record;
  return <Dialog title="Transaction details" onClose={onClose}><div className={s.stack}>
    <dl className={s.details}><dt>Source</dt><dd style={{overflowWrap:'anywhere'}}>{current.source.sourceId} / row {current.source.rowNumber}</dd><dt>Original text</dt><dd>{current.originalDescription || '(blank)'}</dd><dt>Date</dt><dd>{displayDate(current.date)}</dd><dt>Amount</dt><dd>{current.direction === 'in' ? 'Cash in' : 'Cash out'} · PKR {money(current.amountMinor)}</dd><dt>Reference</dt><dd>{current.reference ?? 'Not present'}</dd><dt>Review version</dt><dd>{detail?.reviewVersion ?? 'Loading…'}</dd></dl>
    {!detail && !error && <p role="status">Loading the current reviewed record…</p>}
    {error && <p className={s.error} role="alert">{error}</p>}{notice && <p className={s.success} role="status">{notice}</p>}
    {(!detail || conflict) && <button className={s.secondary} disabled={busy} onClick={() => void exclusive(async () => {
      const next = await run(signal => api.transaction(record.id, signal)); setDetail(next);
      if (!conflict) { setDescription(next.transaction.description); setCategory(next.transaction.category); }
      setNotice('Latest saved record loaded. Your draft is preserved.'); setCompared(false); setLatestLoaded(true);
    })}>Load latest saved record</button>}
    {conflict && detail && <div className={`${s.notice} ${s.stack}`}>
      <p>This record changed while you were reviewing it. Load the latest record, compare it with your draft, then confirm before saving again.</p>
      <p>{latestLoaded ? 'Latest saved description' : 'Previously loaded description'}: <strong>{current.description}</strong><br/>{latestLoaded ? 'Latest category' : 'Previously loaded category'}: <strong>{current.category ? categoryLabels[current.category] : 'Unreviewed'}</strong></p>
      <label className={s.checkbox}><input type="checkbox" checked={compared} disabled={busy || !latestLoaded} onChange={event => setCompared(event.target.checked)}/>I compared the latest saved record with my draft.</label>
    </div>}
    <form className={s.stack} onSubmit={event => { event.preventDefault(); if (!detail || (conflict && !compared)) return; void exclusive(async () => {
      const saved = await run(signal => api.reviewTransaction(record.id, { expectedVersion: detail.reviewVersion, description: description.trim(), category }, signal));
      setDetail(saved); setConflict(false); setCompared(false); setNotice('Reviewed changes saved. Original source values are preserved.');
      await refreshHistory();
      try { await onChanged(); } catch { setError('Changes were saved, but the cashbook could not refresh. Reload the workspace to see current totals.'); }
    }); }}>
      <label className={s.field}>Reviewed description<textarea rows={3} maxLength={2000} value={description} disabled={busy || !detail} onChange={event => setDescription(event.target.value)} required/></label>
      <label className={s.field}>Reviewed category<select value={category ?? ''} disabled={busy || !detail} onChange={event => setCategory(event.target.value ? event.target.value as Category : null)}><option value="">Leave unreviewed</option>{CATEGORIES.map(value => <option key={value} value={value}>{categoryLabels[value]}</option>)}</select></label>
      <p className={`${s.small} ${s.muted}`}>Selecting a category explicitly accepts it. Clearing it returns the record to needs review. Cash amounts and original values stay intact.</p>
      <button className={s.button} disabled={busy || !detail || !description.trim() || (conflict && !compared)}>{busy ? 'Saving…' : 'Save reviewed changes'}</button>
    </form>
    <section className={s.stack} aria-label="Saved review history"><h2>Saved review history</h2>
      {historyError && <p className={s.error} role="alert">{historyError}</p>}
      {history?.items.map(entry => <article key={entry.id} className={s.stack}><strong>Review {entry.reviewVersion}</strong><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time><details><summary>Previous and reviewed values</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12}}>{JSON.stringify({previous:entry.previous,current:entry.current},null,2)}</pre></details></article>)}
      {history && !history.items.length && <p className={s.muted}>No description or category changes have been saved for this record.</p>}
      {!history && !historyError && <p role="status">Loading review history…</p>}
      <button className={s.secondary} disabled={busy} onClick={() => void exclusive(() => refreshHistory(!!history?.nextCursor))}>{history?.nextCursor ? 'Load more reviews' : 'Refresh review history'}</button>
    </section>
  </div></Dialog>;
}
