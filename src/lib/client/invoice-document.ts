import { verifiedInvoiceSchema } from '../contracts/invoices.ts';
import { money } from './presentation.ts';

function escape(value: string | number): string {
  return String(value).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]!);
}

export function invoiceDocumentFilename(invoiceNumber: string): string {
  return `raqam-invoice-${invoiceNumber.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64) || 'saved'}.html`;
}

// Only validated saved invoice values reach this artifact; no AI output or draft
// is accepted. All record text is escaped, and external resources are disabled.
export function buildInvoiceDocument(input: unknown): string {
  const invoice = verifiedInvoiceSchema.parse(input);
  const amount = (value: string) => `${escape(invoice.currency)} ${escape(money(value))}`;
  const optional = (label: string, value: string | null | undefined) => value ? `<p><strong>${label}</strong><br>${escape(value)}</p>` : '';
  const party = (name: string, values: (string | null | undefined)[]) => `<h2>${escape(name)}</h2>${values.filter(value => value).map(value => `<p>${escape(value!)}</p>`).join('')}`;
  const status = invoice.status === 'paid' ? 'Marked paid by owner' : invoice.status;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Invoice ${escape(invoice.invoiceNumber)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f4ef;color:#242820;font:14px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}main{max-width:820px;margin:24px auto;background:white;padding:40px}header,.parties{display:flex;justify-content:space-between;gap:24px}header{align-items:start;border-bottom:2px solid #242820;padding-bottom:24px}.parties{margin:28px 0}.parties>section{flex:1}h1{font-size:30px;margin:0}h2{font-size:17px;margin:8px 0}p{margin:6px 0;white-space:pre-wrap}.meta{text-align:right}.muted{color:#5c6157}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{padding:12px 6px;text-align:right;border-bottom:1px solid #dedfd6;vertical-align:top}th:first-child,td:first-child{text-align:left;width:43%}.totals{margin:24px 0 24px auto;max-width:330px}.totals p{display:flex;justify-content:space-between;gap:20px}.total{border-top:2px solid #242820;padding-top:12px;font-weight:700;font-size:18px}footer{margin-top:32px;border-top:1px solid #dedfd6;padding-top:16px;font-size:12px}@media(max-width:520px){main{margin:0;padding:20px}header,.parties{flex-direction:column;gap:12px}.meta{text-align:left}th,td{padding:8px 3px;font-size:12px}.totals{max-width:100%}}@page{size:A4;margin:15mm}@media print{body{background:white}main{margin:0;padding:0;max-width:none}thead{display:table-header-group}tr{break-inside:avoid}footer,.totals{break-inside:avoid}}
</style></head><body><main>
<header><div><h1>Invoice</h1><p>${escape(invoice.invoiceNumber)}</p><p class="muted">Recorded status: ${escape(status)}</p></div><div class="meta"><p>Issued ${escape(invoice.issueDate)}</p><p>Due ${escape(invoice.dueDate)}</p>${invoice.supplyDate ? `<p>Supply / service date ${escape(invoice.supplyDate)}</p>` : ''}</div></header>
<div class="parties"><section><p class="muted">From</p>${party(invoice.fromName, [invoice.fromAddress, invoice.fromContact])}${optional('Tax ID', invoice.fromTaxId)}</section><section><p class="muted">Bill to</p>${party(invoice.clientName, [invoice.clientAddress, invoice.clientContact, invoice.clientEmail])}${optional('Tax ID', invoice.clientTaxId)}</section></div>
<table><thead><tr><th scope="col">Description</th><th scope="col">Quantity</th><th scope="col">Rate (${escape(invoice.currency)})</th><th scope="col">Amount (${escape(invoice.currency)})</th></tr></thead><tbody>${invoice.items.map(item => `<tr><td>${escape(item.description)}</td><td>${escape(item.quantity)}</td><td>${escape(money(item.rateMinor))}</td><td>${escape(money(item.amountMinor))}</td></tr>`).join('')}</tbody></table>
<section class="totals" aria-label="Saved totals"><p><span>Subtotal</span><span>${amount(invoice.subtotalMinor)}</span></p><p><span>Discount</span><span>${amount(invoice.discountMinor)}</span></p><p><span>Shipping</span><span>${amount(invoice.shippingMinor)}</span></p><p><span>Tax entered by owner</span><span>${amount(invoice.taxMinor)}</span></p><p class="total"><span>Total</span><span>${amount(invoice.totalMinor)}</span></p></section>
${optional('Note', invoice.note)}${optional('Payment details', invoice.paymentDetails)}${optional('Payment reference / link', invoice.paymentLink)}
<footer><p>Raqam · Saved invoice · Review version ${invoice.reviewVersion}</p><p>Invoice status is recorded by the owner. This document alone does not establish payment settlement or tax compliance.</p></footer>
</main></body></html>`;
}
