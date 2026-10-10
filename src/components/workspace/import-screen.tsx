'use client';
import { useState } from 'react';
import type { Transaction } from '../../lib/contracts/index.ts';
import { parseAmount } from '../../lib/server/money.ts';
import { csvTemplate, downloadText, money } from '../../lib/client/presentation.ts';
import { examplePreview } from '../../lib/client/examples.ts';
import { Icon } from '../ui/icon.tsx';
import s from '../ui/theme.module.css';
export function ImportScreen({ demo, workspaceId, imported, onConfirm }: { demo: boolean; workspaceId: string; imported: boolean; onConfirm: (records: Transaction[], unresolved: number) => void }) {
  const [preview, setPreview] = useState(false), [correction, setCorrection] = useState(''), [error, setError] = useState(''), [confirm, setConfirm] = useState(false);
  const amount = correction ? parseAmount(correction) : null;
  const count = examplePreview.validCount + (amount !== null ? 1 : 0);
  function commit() {
    if (imported || !confirm) return;
    if (correction && amount === null) {setError('Enter an exact nonnegative amount with at most two decimals, or leave the row unresolved.');return;}
    const records: Transaction[] = examplePreview.rows.flatMap(row => {
      const transaction = row.transaction ?? (amount !== null ? { date: row.original[0]!, description: row.original[1]!, direction: 'out' as const, amountMinor: amount, currency: 'PKR' as const, reference: null } : null);
      return transaction ? [{ ...transaction, id: `example-import-${row.rowNumber}`, workspaceId, originalDescription: row.original[1]!, source: { sourceId: 'example-import-csv', rowNumber: row.rowNumber }, category: null, categoryStatus: 'needs_review' as const, matchStatus: 'unmatched' as const }] : [];
    });
    onConfirm(records, amount === null ? 1 : 0);
  }
  return <div className={s.stack}>
    <div className={s.pageHeading}><div><h1>Import transactions</h1><p>Start with a preview. Confirm only the rows you understand.</p></div><button className={s.secondary} onClick={() => downloadText('raqam-pkr-template.csv', csvTemplate)}><Icon name="download" size={16}/> Download template</button></div>
    <div className={s.upload}><Icon name="upload" size={30}/><h2>Bring your bank records together.</h2><p>CSV · date, description, direction, amount and optional reference. Use YYYY-MM-DD and exact PKR amounts without thousands separators.</p>{demo ? <button className={s.button} onClick={() => setPreview(true)}>Preview example CSV</button> : <p className={s.notice}>CSV preview and confirmation are awaiting the import API. You can explore the example while this integration is completed.</p>}</div>
    {demo && preview && <section className={s.panel}><div className={s.panelHeading}><h2>Example import preview</h2><span className={s.badge}>{count} valid / {3-count} unresolved</span></div><div className={s.proposal}>
      <p>Original file: <strong>example-october.csv</strong> · 3 rows · PKR. This example stays in memory and resets on reload.</p>
      {examplePreview.rows.map(row => <article key={row.rowNumber} className={s.stack} style={{gap:12}}><div className={s.proposalHeading}><h3>Row {row.rowNumber} · {row.original[1]}</h3><span className={`${s.badge} ${row.transaction || amount !== null ? s.good : s.pending}`}>{row.transaction || amount !== null ? 'Valid' : 'Needs correction'}</span></div><p className={s.small}>Original values: {row.original.join(' / ')}</p>{row.transaction ? <p>{row.transaction.direction === 'in' ? 'Cash in' : 'Cash out'} · PKR {money(row.transaction.amountMinor)}</p> : <label className={s.field}>Reviewed amount · PKR<input inputMode="decimal" value={correction} onChange={event => {setCorrection(event.target.value);setError('');}} placeholder="Leave blank if unknown" disabled={imported}/><small>{row.errors[0]?.message} The original “unknown” remains in the preview.</small></label>}</article>)}
      {error && <p role="alert" className={s.error}>{error}</p>}
      {imported ? <p className={s.success} role="status">Example import confirmed. Repeating this example will not add duplicate records. Changes reset on reload.</p> : <><label className={s.checkbox}><input type="checkbox" checked={confirm} onChange={event => setConfirm(event.target.checked)}/>I reviewed the preview. Import {count} valid rows and leave {3-count} unresolved rows excluded from totals.</label><div className={s.actions}><button className={s.button} disabled={!confirm} onClick={commit}>Confirm example import</button><button className={s.secondary} onClick={() => {setPreview(false);setConfirm(false);}}>Cancel preview</button></div></>}
    </div></section>}
  </div>;
}
