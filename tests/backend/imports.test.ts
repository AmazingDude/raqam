import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { previewCsv } from '../../src/lib/server/csv.ts';
import { buildImportPlan, readCsvUpload } from '../../src/lib/server/imports.ts';
import { importConfirmationSchema } from '../../src/lib/contracts/imports.ts';
import { previewPdf } from '../../src/lib/server/pdf.ts';

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

function statementPdf(pages: string[][][]): Buffer {
  const objectCount = 3 + pages.length * 2;
  const fontId = objectCount;
  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  ];
  const columnX = [30, 120, 330, 430, 530];
  const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  pages.forEach((rows, pageIndex) => {
    const pageId = 3 + pageIndex * 2, contentId = pageId + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    const lines = rows.map((row, rowIndex) => {
      const y = rowIndex === 0 ? 740 : 710 - (rowIndex - 1) * 30;
      return row.map((cell, column) => cell ? `1 0 0 1 ${columnX[column]} ${y} Tm (${escapeText(cell)}) Tj` : '').filter(Boolean).join(' ');
    });
    const stream = Buffer.from(`BT /F1 10 Tf ${lines.join(' ')} ET`, 'ascii');
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream.toString('ascii')}\nendstream`);
  });
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'ascii')];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.concat(parts).length);
    parts.push(Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'ascii'));
  });
  const xrefOffset = Buffer.concat(parts).length;
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`)].join('');
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, 'ascii'));
  return Buffer.concat(parts);
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
