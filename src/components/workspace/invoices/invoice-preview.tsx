'use client';
import { useMemo, useState } from 'react';
import type { Invoice } from '../../../lib/contracts/invoices.ts';
import { buildInvoiceDocument, invoiceDocumentFilename } from '../../../lib/client/invoice-document.ts';
import { Dialog } from '../../ui/dialog.tsx';
import s from '../../ui/theme.module.css';

export function InvoicePreview({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [error, setError] = useState('');
  const document = useMemo(() => {
    try { return buildInvoiceDocument(invoice); }
    catch { return null; }
  }, [invoice]);
  function download() {
    if (!document) return;
    try {
      const url = URL.createObjectURL(new Blob([document], { type: 'text/html;charset=utf-8' }));
      const anchor = window.document.createElement('a');
      anchor.href = url; anchor.download = invoiceDocumentFilename(invoice.invoiceNumber); anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError('');
    } catch { setError('The download could not start. Your saved invoice is preserved; try again.'); }
  }
  return <Dialog title={`Saved invoice ${invoice.invoiceNumber}`} onClose={onClose}>
    <div className={s.stack}>
      <p className={`${s.small} ${s.muted}`}>Preview of saved review version {invoice.reviewVersion}. Download the HTML invoice, then open it in your browser to print or save as PDF.</p>
      {document ? <iframe title={`Saved invoice preview ${invoice.invoiceNumber}`} sandbox="" srcDoc={document} style={{width:'100%',height:560,border:'1px solid #dedfd6',borderRadius:8,background:'white'}}/> : <p className={s.error} role="alert">This saved invoice could not be verified. Reload invoices before previewing or downloading.</p>}
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}><button type="button" className={s.button} disabled={!document} onClick={download}>Download invoice (HTML)</button><button type="button" className={s.secondary} onClick={onClose}>Close preview</button></div>
    </div>
  </Dialog>;
}
