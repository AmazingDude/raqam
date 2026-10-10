import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { previewCsv } from '../../src/lib/server/csv.ts';
import { buildImportPlan, readCsvUpload } from '../../src/lib/server/imports.ts';
import { importConfirmationSchema } from '../../src/lib/contracts/imports.ts';
import { previewPdf } from '../../src/lib/server/pdf.ts';
import { statementPdf } from '../helpers/pdf-fixture.ts';

const csv = 'date,description,direction,amount\n2026-10-10,A,out,10.05\n2026-10-10,A,out,10.05\n2026-10-10,,out,?\n';
const corrected = { date: '2026-10-10', description: 'Corrected', direction: 'out', amountMinor: '9007199254740993', currency: 'PKR', reference: null };

test('import plans retain every row, equal amounts and unresolved unknowns', () => {
  const plan = buildImportPlan(previewCsv(csv), {});
  assert.deepEqual(plan.map(row => [row.rowNumber, row.action, row.transaction?.amountMinor ?? null]), [
    [2, 'import', '1005'], [3, 'import', '1005'], [4, 'unresolved', null],
  ]);
});
test('explicit corrections/rejections retain the original preview and exact money', () => {
  const preview = previewCsv(csv), before = structuredClone(preview);
  const plan = buildImportPlan(preview, { rows: [{ rowNumber: 4, action: 'correct', transaction: corrected }, { rowNumber: 3, action: 'reject' }] });
  assert.deepEqual(preview, before);
  assert.deepEqual(plan[2], { rowNumber: 4, action: 'correct', transaction: corrected });
  assert.deepEqual(plan[1], { rowNumber: 3, action: 'reject', transaction: null });
});
test('confirmation rejects ownership, duplicate/unknown rows and invalid corrected amounts', () => {
  for (const body of [
    { ownerSubject: 'other' }, { rows: [{ rowNumber: 99, action: 'reject' }] },
    { rows: [{ rowNumber: 2, action: 'reject' }, { rowNumber: 2, action: 'reject' }] },
    { rows: [{ rowNumber: 4, action: 'correct', transaction: { ...corrected, amountMinor: 0 } }] },
    { rows: [{ rowNumber: 4, action: 'correct', transaction: { ...corrected, amountMinor: '-1' } }] },
    { rows: [{ rowNumber: 4, action: 'correct', transaction: { ...corrected, date: '2026-02-30' } }] },
    { rows: [{ rowNumber: 4, action: 'correct', transaction: { ...corrected, currency: 'USD' } }] },
  ]) assert.throws(() => buildImportPlan(previewCsv(csv), body));
  assert.equal(importConfirmationSchema.safeParse({ rows: [], workspaceId: 'forged' }).success, false);
});

function upload(bytes: Uint8Array, name = 'sample.csv', extra = false): Request {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(bytes)], { type: 'text/csv' }), name);
  if (extra) form.set('owner', 'forged');
  return new Request('http://localhost/api/imports', { method: 'POST', body: form });
}

const statementHeader = ['Date', 'Description', 'Debit', 'Credit', 'Currency'];
const statementRow = (description: string, debit: string, credit: string) => ['2026-10-10', description, debit, credit, 'PKR'];

test('selectable-text PDF statement previews exact rows and keeps its original hash and bytes', async () => {
  const bytes = statementPdf([[statementHeader, statementRow('Service fee', '25.50', ''), statementRow('Customer payment', '', '1,000.00')]]);
  const preview = await previewPdf(new Uint8Array(bytes));
  const result = await readCsvUpload(upload(bytes, 'account-statement.pdf'));
  assert.equal(result.extension, 'pdf');
  assert.equal(result.originalName, 'account-statement.pdf');
  assert.equal(preview.contentHash, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(result.preview.contentHash, preview.contentHash);
  assert.deepEqual(result.bytes, new Uint8Array(bytes));
  assert.deepEqual(result.preview.rows.map(row => [row.original[1], row.transaction?.direction, row.transaction?.amountMinor]), [
    ['Service fee', 'out', '2550'], ['Customer payment', 'in', '100000'],
  ]);
});

test('PDF extraction skips repeated headers across pages and rejects image-only or malformed PDFs', async () => {
  const bytes = statementPdf([
    [statementHeader, statementRow('Page one fee', '10.00', '')],
    [statementHeader, statementRow('Page two deposit', '', '20.00')],
  ]);
  const preview = await previewPdf(new Uint8Array(bytes));
  assert.deepEqual(preview.rows.map(row => row.original[1]), ['Page one fee', 'Page two deposit']);
  await assert.rejects(() => previewPdf(new Uint8Array(statementPdf([[]]))), /no selectable transaction text/i);
  await assert.rejects(() => readCsvUpload(upload(Buffer.from('not a PDF'), 'statement.pdf')), /not a readable PDF/i);
});

test('UTF-8 CSV upload preserves BOM bytes, column order and original fields', async () => {
  const text = '\uFEFFamount,description,date,direction\r\n1.00," A, original ",2026-10-10,out\r\n';
  const bytes = Buffer.from(text);
  const result = await readCsvUpload(upload(bytes));
  assert.deepEqual(result.preview.header, ['amount', 'description', 'date', 'direction']);
  assert.equal(result.preview.contentHash, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(result.preview.rows[0]?.original[1], ' A, original ');
  assert.deepEqual(result.bytes, new Uint8Array(bytes));
});
test('XLS and XLSX uploads keep their exact source bytes and preview mapped bank rows', async () => {
  for (const [extension, bookType] of [['xlsx', 'xlsx'], ['xls', 'biff8']] as const) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Posting Date', 'Narration', 'Debit (PKR)', 'Credit (PKR)', 'Ref No.'],
      ['10/10/2026', 'Bank fee', '25.50', '', 'FEE-1'],
    ]), 'Transactions');
    const bytes = XLSX.write(workbook, { bookType, type: 'buffer' });
    const result = await readCsvUpload(upload(bytes, `bank.${extension}`));
    assert.equal(result.extension, extension);
    assert.equal(result.originalName, `bank.${extension}`);
    assert.equal(result.preview.contentHash, createHash('sha256').update(bytes).digest('hex'));
    assert.deepEqual(result.preview.rows[0]?.transaction && [
      result.preview.rows[0].transaction.direction, result.preview.rows[0].transaction.amountMinor,
    ], ['out', '2550']);
  }
});
test('TSV uploads accept UTF-16 input, preserve source identity and decode legacy Windows text', async () => {
  const tsvText = 'Date\tDescription\tDirection\tAmount\n2026-10-10\tCafé subscription\tout\t10.50\n';
  const tsvBytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(tsvText, 'utf16le')]);
  const tsv = await readCsvUpload(upload(tsvBytes, 'bank.tsv'));
  assert.equal(tsv.preview.contentHash, createHash('sha256').update(tsvBytes).digest('hex'));
  assert.equal(tsv.preview.rows[0]?.transaction?.description, 'Café subscription');

  const legacyText = 'date,description,direction,amount\n2026-10-10,Café subscription,out,10.50\n';
  const legacyBytes = Buffer.from(legacyText, 'latin1');
  const legacy = await readCsvUpload(upload(legacyBytes, 'bank.csv'));
  assert.equal(legacy.preview.rows[0]?.transaction?.description, 'Café subscription');
});
test('CSV upload rejects invalid encoding, extra fields, unsupported files and over-cap previews', async () => {
  await assert.rejects(() => readCsvUpload(upload(new Uint8Array([255, 254, 0]))));
  await assert.rejects(() => readCsvUpload(upload(Buffer.from(csv.replace(',A,', ',A\0,')))));
  await assert.rejects(() => readCsvUpload(upload(Buffer.from(csv), 'sample.pdf')));
  await assert.rejects(() => readCsvUpload(upload(Buffer.from(csv), 'sample.csv', true)));
  await assert.rejects(() => readCsvUpload(upload(Buffer.from('date,description,direction,amount\n'))));
  await assert.rejects(() => readCsvUpload(upload(Buffer.from('date,description,direction,amount\n' + '2026-10-10,A,out,1\n'.repeat(51)))));
});
test('preview inconsistencies fail rather than dropping a row during confirmation', () => {
  const preview = previewCsv(csv);
  assert.throws(() => buildImportPlan({ ...preview, validCount: 99 }, {}));
  assert.throws(() => buildImportPlan({ ...preview, rows: [...preview.rows, preview.rows[0]] }, {}));
});


test('long PDF imports extract 8000/8000 synthetic transactions across 400 pages, beyond 1 MiB', async () => {
  const pages = Array.from({length:400}, (_, p) => [statementHeader,
    ...Array.from({length:20}, (_, r) => statementRow(`Synthetic pg${p + 1} row${r + 1} bank activity`, r % 2 ? '' : '25.50', r % 2 ? '100.00' : ''))]);
  const bytes = statementPdf(pages);
  assert.ok(bytes.length > 1024 * 1024);
  const result = await readCsvUpload(upload(bytes, 'long-synthetic.pdf'));
  assert.equal(result.preview.rows.length,8000);
  assert.equal(result.preview.validCount,8000);
  assert.equal(result.preview.invalidCount,0);
  assert.equal(result.preview.rows[0]?.pageNumber,1);
  assert.equal(result.preview.rows.at(-1)?.pageNumber,400);
  assert.equal(result.preview.rows.at(-1)?.rowNumber,8001);
  assert.equal(result.preview.contentHash,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(result.preview.rows.filter(r => r.transaction?.direction === 'out').reduce((sum,r) => sum + BigInt(r.transaction!.amountMinor),0n),10200000n);
  assert.equal(result.preview.rows.filter(r => r.transaction?.direction === 'in').reduce((sum,r) => sum + BigInt(r.transaction!.amountMinor),0n),40000000n);
});

test('native ruled-table parser preserves empty debit/credit cells and exact values', async () => {
  const result = await previewPdf(statementPdf([[statementHeader,statementRow('Ruled fee','25.50',''),statementRow('Ruled deposit','','100.00')]],true));
  assert.deepEqual(result.rows.map(r => [r.transaction?.direction,r.transaction?.amountMinor]),[['out','2550'],['in','10000']]);
  assert.deepEqual(result.rows.map(r => r.pageNumber),[1,1]);
});

test('PDF processing rejects cancellation, over-page documents, and mixed scanned pages', async () => {
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(() => previewPdf(statementPdf([[statementHeader,statementRow('Fee','1','')]]),cancelled.signal),/cancelled/);
  await assert.rejects(() => previewPdf(statementPdf(Array.from({length:1001}, () => []))),/1-1000 pages/);
  await assert.rejects(() => previewPdf(statementPdf([[statementHeader,statementRow('Fee','1','')],[]])),/Page 2.*no selectable/i);
});
