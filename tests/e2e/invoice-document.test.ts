import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoiceDocument, invoiceDocumentFilename } from '../../src/lib/client/invoice-document.ts';
import { syntheticInvoice } from '../helpers/invoice-fixture.ts';

test('saved invoice artifact preserves exact large amounts and supplied fields without exposing workspace identity', () => {
  const invoice = syntheticInvoice(), amount = '90071992547409930';
  invoice.items[0] = { ...invoice.items[0]!, rateMinor: amount, amountMinor: amount };
  invoice.subtotalMinor = amount; invoice.totalMinor = amount;
  invoice.supplyDate = '2026-10-09'; invoice.paymentDetails = 'Synthetic bank reference ONLY'; invoice.reviewVersion = 7;
  const html = buildInvoiceDocument(invoice);
  assert.ok(html.includes('PKR 900,719,925,474,099.30'));
  for (const value of [invoice.invoiceNumber, invoice.fromName, invoice.clientName, invoice.items[0]!.description, invoice.issueDate, invoice.dueDate, invoice.supplyDate, invoice.paymentDetails, 'Review version 7']) assert.ok(html.includes(value), value);
  assert.ok(!html.includes(invoice.workspaceId));
  assert.ok(!html.includes(invoice.id));
});

test('invoice document escapes untrusted record text and contains no executable or remote resource', () => {
  const invoice = { ...syntheticInvoice(), clientName: '<script>alert(1)</script>', invoiceNumber: 'A"&<B',
    note: '<img src="https://example.invalid/track" onerror="alert(1)">', paymentLink: 'javascript:alert(1)' };
  const html = buildInvoiceDocument(invoice);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=&quot;https://example.invalid/track&quot;'));
  assert.ok(html.includes('A&quot;&amp;&lt;B'));
  assert.ok(html.includes("default-src 'none'"));
  assert.doesNotMatch(html, /<script\b|<img\b|<a\b|<form\b|<link\b/i);
  assert.ok(!invoiceDocumentFilename('../bad/name').includes('/'));
});

test('invalid lines/totals or incomplete drafts cannot be previewed/downloaded as saved invoices', () => {
  for (const invalid of [{ ...syntheticInvoice(), totalMinor: '1' }, { ...syntheticInvoice(), items: [] }, { ...syntheticInvoice(), subtotalMinor: 10000 }, { clientName: 'Unsaved draft' }]) assert.throws(() => buildInvoiceDocument(invalid));
  const html = buildInvoiceDocument({ ...syntheticInvoice(), status: 'paid' });
  assert.ok(html.includes('Marked paid by owner'));
  assert.ok(html.includes('does not establish payment settlement'));
});
