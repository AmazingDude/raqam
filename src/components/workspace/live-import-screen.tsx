'use client';
import { MAX_PDF_BYTES, MAX_PDF_PAGES, MAX_IMPORT_ROWS } from '../../lib/contracts/limits.ts';
import { useRef, useState } from 'react';
import type { z } from 'zod';
import { cashRowSchema, type ImportConfirmation, type importResolutionStateSchema } from '../../lib/contracts/imports.ts';
import { api, type ImportBatch } from '../../lib/client/api.ts';
import { usePrivateRequests } from '../../lib/client/use-private-requests.ts';
import { money } from '../../lib/client/presentation.ts';
import { formatAmount, parseAmount } from '../../lib/server/money.ts';
import s from '../ui/theme.module.css';

type Row = ImportBatch['preview']['rows'][number];
type Draft = { action: 'keep' | 'correct' | 'reject'; date: string; description: string; direction: string; amount: string; reference: string };
type Outcomes = z.infer<typeof importResolutionStateSchema>;
type Attempt = { kind: 'confirm'; input: ImportConfirmation } | { kind: 'resolve'; input: ImportConfirmation & { requestId: string } };
function initialDraft(row: Row, header: ImportBatch['preview']['header']): Draft {
  if (row.draftFields) return { action: 'keep', ...row.draftFields };
  const original = Object.fromEntries(header.map((field, index) => [field, row.original[index] ?? '']));
  return { action: 'keep', date: original.date ?? '', description: original.description ?? '', direction: original.direction ?? '', amount: original.amount ?? '', reference: original.reference ?? '' };
}
function reviewDrafts(batch: ImportBatch, recover = true): Record<number, Draft> {
  const drafts = Object.fromEntries(batch.preview.rows.map(row => [row.rowNumber, initialDraft(row, batch.preview.header)]));
  if (recover) for (const decision of batch.recovery?.decisions ?? []) {
    if (decision.action === 'reject') drafts[decision.rowNumber] = { ...drafts[decision.rowNumber]!, action: 'reject' };
    else drafts[decision.rowNumber] = { ...decision.transaction, amount: formatAmount(decision.transaction.amountMinor),
      reference: decision.transaction.reference ?? '', action: 'correct' };
  }
  return drafts;
}
export function LiveImportScreen({ onChanged }: { onChanged: () => Promise<void> }) {
  const run = usePrivateRequests(), locked = useRef(false);
  const [page, setPage] = useState(0);
  const [previousPreview, setPreviousPreview] = useState(false);
  const [batch, setBatch] = useState<ImportBatch | null>(null), [name, setName] = useState('');
  const [drafts, setDrafts] = useState<Record<number, Draft>>({}), [outcomes, setOutcomes] = useState<Outcomes | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [acknowledged, setAcknowledged] = useState(false), [attempt, setAttempt] = useState<Attempt | null>(null);
  async function exclusive(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await work(); } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError(failure instanceof Error ? failure.message : 'The import could not complete. Retry.');
    } finally { locked.current = false; setBusy(false); }
  }
  async function loadState(id: string) {
    const next = await run(signal => api.importBatch(id, signal));
    const current = next.status === 'confirmed' ? await run(signal => api.importOutcomes(id, signal)) : null;
    setBatch(next); setOutcomes(current); setAttempt(null); setAcknowledged(false); setPreviousPreview(false); setDrafts(reviewDrafts(next));
  }
  async function upload(file: File) {
    await exclusive(async () => {
      if (!/\.(csv|tsv|xls|xlsx|pdf)$/i.test(file.name) || !file.size || file.size > (/\.pdf$/i.test(file.name) ? MAX_PDF_BYTES : 1024 * 1024)) throw new Error('Choose a .csv, .tsv, .xls, .xlsx, or text-based .pdf file PDFs allow 20 MiB and 20,000 rows; other formats allow 1 MiB and 50 rows.');
      const next = await run(signal => api.registerImport(file, signal));
      setPage(0); setBatch(next); setName(file.name); setOutcomes(null); setAttempt(null); setAcknowledged(false);
      setPreviousPreview(false); setDrafts(reviewDrafts(next));
      setNotice(next.duplicate ? 'Existing import reopened. No duplicate cash records were created.' : 'Original transaction file saved. Review the preview before adding cash records.');
      if (next.status === 'confirmed') setOutcomes(await run(signal => api.importOutcomes(next.importId, signal)));
    });
  }
  const byOutcome = new Map(outcomes?.rows.map(row => [row.rowNumber, row.outcome]) ?? []);
  const available = batch?.preview.rows.filter(row => batch.status === 'pending' || byOutcome.get(row.rowNumber) === 'unresolved') ?? [];
  const preview = !previousPreview && batch?.recovery ? batch.recovery.preview : batch?.preview;
  const pageCount = Math.ceil((preview?.rows.length ?? 0) / 50);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  function makeAttempt(): Attempt {
    if (!batch) throw new Error('Upload a transaction file first.');
    const rows: ImportConfirmation['rows'] = available.flatMap<ImportConfirmation['rows'][number]>(row => {
      const draft = drafts[row.rowNumber];
      if (!draft || draft.action === 'keep') return [];
      if (draft.action === 'reject') return [{ rowNumber: row.rowNumber, action: 'reject' as const }];
      const amountMinor = parseAmount(draft.amount);
      const transaction = cashRowSchema.safeParse({ date: draft.date, description: draft.description.trim(), direction: draft.direction, amountMinor, currency: 'PKR', reference: draft.reference.trim() || null });
      if (!transaction.success) throw new Error(`Row ${row.rowNumber}: enter a real YYYY-MM-DD date, description, direction and exact nonnegative PKR amount with at most two decimals. Unknown values must stay unresolved.`);
      return [{ rowNumber: row.rowNumber, action: 'correct' as const, transaction: transaction.data }];
    });
    if (batch.status === 'pending') return { kind: 'confirm', input: { rows } };
    if (!rows.length) throw new Error('Choose a correction or rejection for at least one unresolved row.');
    return { kind: 'resolve', input: { rows, requestId: crypto.randomUUID() } };
  }
  async function submit() {
    if (!batch || (!acknowledged && !attempt)) return;
    await exclusive(async () => {
      const command = attempt ?? makeAttempt(); setAttempt(command);
      if (command.kind === 'confirm') {
        const receipt = await run(signal => api.confirmImport(batch.importId, command.input, signal));
        setNotice(`${receipt.importedCount} rows imported; ${receipt.rejectedCount} rejected; ${receipt.unresolvedCount} left unresolved at confirmation.${receipt.duplicate ? ' Existing confirmation reused.' : ''}`);
      } else {
        const receipt = await run(signal => api.resolveImport(batch.importId, command.input, signal));
        setNotice(`${receipt.correctedCount} corrections and ${receipt.rejectedCount} rejections saved.${receipt.duplicate ? ' Existing decision receipt reused.' : ''}`);
      }
      // Refresh current cumulative outcomes: immutable retry receipts can be older.
      await loadState(batch.importId);
      setDrafts(current => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, { ...value, action: 'keep' as const }])));
      try { await onChanged(); } catch { setError('The import was saved, but the cashbook could not refresh. Reload the workspace to see current totals.'); }
    });
  }
  const frozen = busy || attempt !== null;
  return <div className={s.stack}>
    <div className={s.pageHeading}><div><h1>Import transactions</h1><p>Review the original rows, then choose what enters your cashbook.</p></div><a className={s.secondary} href="/api/imports/template" download>Download template</a></div>
    <section className={`${s.upload} ${s.stack}`}><h2>Choose a transaction file</h2><p>PDF: up to {MAX_PDF_BYTES / 1024 / 1024} MiB, {MAX_PDF_PAGES.toLocaleString()} pages and {MAX_IMPORT_ROWS.toLocaleString()} transactions. CSV, TSV and Excel: up to 1 MiB and 50 rows. PKR. Reopen an earlier import by uploading the same file. PDFs need selectable text; scanned-statement OCR is not available yet.</p><label className={s.field}>Transaction file<input type="file" accept=".csv,.tsv,.xls,.xlsx,.pdf,text/csv,text/tab-separated-values,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf" disabled={frozen} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }}/></label></section>
    {notice && <p role="status" className={s.success}>{notice}</p>}{error && <p role="alert" className={s.error}>{error}</p>}{busy && <p role="status">Saving or loading your import…</p>}
    {batch && preview && <section className={s.panel}>
      <div className={s.panelHeading}><div><h2>{name || 'Stored transaction file'} · {batch.status === 'pending' ? 'Preview' : 'Confirmed import'}</h2><p className={s.small}>{preview.validCount} transactions ready / {preview.invalidCount} needing review</p></div><button className={s.secondary} disabled={busy} onClick={() => void exclusive(async () => { await loadState(batch.importId); await onChanged(); setNotice('Current import status loaded. Check your row choices before confirming.'); })}>Refresh import status</button></div>
      {batch.recovery && <div className={s.proposal}><p>Wrapped descriptions and statement text from the earlier preview have been grouped. Review the complete transactions below. Confirmation records the proposed description corrections and rejects the extra text as separate cash rows.</p>{batch.status === 'confirmed' && <p>Existing imported transactions keep their saved values. Only still-unresolved rows can receive new decisions here.</p>}<button className={s.secondary} disabled={frozen} onClick={() => { setPreviousPreview(value => !value); setDrafts(reviewDrafts(batch, previousPreview)); setPage(0); setAcknowledged(false); }}>{previousPreview ? 'Use grouped transaction preview' : 'View earlier preview'}</button></div>}
      {preview.statement && <div className={s.proposal}><p>Running balance: {preview.statement.balances.matched} of {preview.statement.balances.checked} available checks agree{preview.statement.balances.unavailable ? `; ${preview.statement.balances.unavailable} rows have no complete balance check` : ''}. {preview.statement.mergedLineCount} continuation lines grouped into their transactions.</p><details><summary>Statement information ({preview.statement.metadata.length} source lines)</summary>{preview.statement.metadata.map(line => <p key={line.rowNumber}>Page {line.pageNumber} · {line.kind === 'balance' ? 'Balance information' : 'Page text'} · {line.original.join(' | ')}</p>)}</details></div>}
      {outcomes && <p className={s.proposal} role="status">Current outcomes: {outcomes.importedCount} imported / {outcomes.rejectedCount} rejected / {outcomes.unresolvedCount} unresolved. Unresolved rows stay out of cash totals.</p>}
      {batch.status === 'confirmed' && !outcomes && <p className={`${s.proposal} ${s.error}`}>Current row outcomes are unavailable. Refresh import status before making further decisions.</p>}
      <nav aria-label="Import preview pages" className={s.panelHeading}>
        <button className={s.secondary} disabled={busy || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <p>Page {currentPage + 1} of {pageCount} · {preview.rows.length.toLocaleString()} transactions. Confirmation includes choices across all pages.</p>
        <button className={s.secondary} disabled={busy || currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
      </nav>
      {preview.rows.slice(currentPage * 50, (currentPage + 1) * 50).map(row => {
        const draft = drafts[row.rowNumber] ?? initialDraft(row, preview.header);
        const outcome = byOutcome.get(row.rowNumber);
        const editable = batch.status === 'pending' || outcome === 'unresolved';
        const update = (patch: Partial<Draft>) => { setDrafts(current => ({ ...current, [row.rowNumber]: { ...draft, ...patch } })); setAcknowledged(false); };
        return <article key={row.rowNumber} className={s.proposal} aria-label={`Transaction row ${row.rowNumber}`}>
          <div className={s.proposalHeading}><h3>Row {row.rowNumber}{row.pageNumber ? ` · PDF page ${row.pageNumber}` : ''}</h3><span className={`${s.badge} ${outcome === 'imported' ? s.good : s.pending}`}>{outcome ?? (row.transaction ? 'Ready to import' : 'Needs review')}</span></div>
          <details><summary>Original source values</summary><dl className={s.details}>{row.original.map((value, index) => <div key={index} style={{display:'contents'}}><dt>{batch.preview.header[index] ?? `Extra field ${index + 1}`}</dt><dd style={{overflowWrap:'anywhere'}}>{value || '(blank)'}</dd></div>)}</dl></details>
          {row.sourceLines && <details><summary>Original lines before grouping ({row.sourceLines.length})</summary>{row.sourceLines.map(line => <p key={line.rowNumber} style={{overflowWrap:'anywhere'}}>Page {line.pageNumber} · line {line.lineNumber}: {line.original.join(' | ')}</p>)}</details>}
          {row.transaction && <p>{row.transaction.date} · {row.transaction.description} · {row.transaction.direction === 'in' ? 'Cash in' : 'Cash out'} · PKR {money(row.transaction.amountMinor)}</p>}
          {row.errors.length > 0 && <ul>{row.errors.map((issue, index) => <li key={index}>{issue.field}: {issue.message}</li>)}</ul>}
          {editable && <><label className={s.field}>Decision for row {row.rowNumber}<select value={draft.action} disabled={frozen} onChange={event => update({ action: event.target.value as Draft['action'] })}><option value="keep">{batch.status === 'pending' && row.transaction ? 'Include original valid row' : 'Leave unresolved'}</option><option value="correct">Correct and include</option><option value="reject">Reject row</option></select></label>
            {draft.action === 'correct' && <div className={s.stack}>
              <label className={s.field}>Reviewed date<input type="date" value={draft.date} disabled={frozen} onChange={event => update({date:event.target.value})}/></label>
              <label className={s.field}>Reviewed description<textarea value={draft.description} maxLength={2000} disabled={frozen} onChange={event => update({description:event.target.value})}/></label>
              <label className={s.field}>Reviewed direction<select value={draft.direction} disabled={frozen} onChange={event => update({direction:event.target.value})}><option value="">Choose direction</option><option value="in">Cash in</option><option value="out">Cash out</option></select></label>
              <label className={s.field}>Reviewed amount · PKR<input inputMode="decimal" value={draft.amount} disabled={frozen} onChange={event => update({amount:event.target.value})}/><small>Do not replace an unknown amount with zero.</small></label>
              <label className={s.field}>Reviewed reference (optional)<input value={draft.reference} maxLength={500} disabled={frozen} onChange={event => update({reference:event.target.value})}/></label>
            </div>}</>}
        </article>;
      })}
      {(batch.status === 'pending' || (outcomes && outcomes.unresolvedCount > 0)) && <div className={s.proposal}>
        {attempt ? <p className={s.notice}>A request was sent. Retry these exact decisions, or refresh the import status before changing them.</p> : <label className={s.checkbox}><input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)}/>I reviewed these choices. Valid rows enter the cashbook once; rejected and unresolved rows add no cash.</label>}
        <button className={s.button} disabled={busy || (!acknowledged && !attempt)} onClick={() => void submit()}>{busy ? 'Saving…' : attempt ? 'Retry saved decisions' : batch.status === 'pending' ? 'Confirm import' : 'Save unresolved row decisions'}</button>
      </div>}
    </section>}
  </div>;
}
