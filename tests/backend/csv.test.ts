import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { previewCsv } from '../../src/lib/server/csv.ts';
import { previewExcel } from '../../src/lib/server/excel.ts';

test('CSV preview keeps invalid rows and their original fields without inventing money', () => {
  const preview = previewCsv('date,description,direction,amount,reference\r\n2026-10-10,Customer,in,100.05,A\r\n2026-02-30,Unknown,out,?,B\r\n');
  assert.deepEqual([preview.validCount, preview.invalidCount, preview.rows.length], [1, 1, 2]);
  assert.equal(preview.rows[0]?.transaction?.amountMinor, '10005');
  assert.equal(preview.rows[1]?.transaction, null);
  assert.equal(preview.rows[1]?.original[3], '?');
});

test('quoted commas, escaped quotes and multiline fields retain source locations', () => {
  const preview = previewCsv('\uFEFFdate,description,direction,amount\r\n2026-10-10,"A, ""name""\r\ncontinued",out,0.10\r\n2026-10-10,B,out,0.20');
  assert.equal(preview.rows[0]?.transaction?.description, 'A, "name"\r\ncontinued');
  assert.deepEqual(preview.rows.map(row => [row.rowNumber, row.lineNumber]), [[2, 2], [3, 4]]);
  assert.equal(preview.validCount, 2);
});

test('malformed structure is rejected and interior blank records remain visible', () => {
  assert.throws(() => previewCsv('date,description,direction,amount\n2026-10-10,"broken,out,2'), /Unclosed/);
  assert.throws(() => previewCsv('date,description,direction,amount\n2026-10-10,"x"junk,out,2'), /Unexpected/);
  assert.throws(() => previewCsv('date,date,direction,amount'), /template/);
  assert.throws(() => previewCsv('date,description,direction,amount,currency'), /no data rows/);
  const preview = previewCsv('date,description,direction,amount\n\n2026-10-10,A,out,10\n');
  assert.deepEqual([preview.validCount, preview.invalidCount], [1, 1]);
});

test('file identity uses original content while equal rows remain separate', () => {
  const text = 'date,description,direction,amount\n2026-10-10,A,out,10\n2026-10-10,A,out,10\n';
  const first = previewCsv(text), again = previewCsv(text);
  assert.equal(first.contentHash, again.contentHash);
  assert.equal(first.rows.length, 2);
  assert.notEqual(first.contentHash, previewCsv(text.replaceAll('\n', '\r\n')).contentHash);
});

test('bank CSV headings, semicolon separators, day-first dates and grouped PKR amounts map exactly', () => {
  const preview = previewCsv([
    'Statement for October',
    'Transaction Date;Value Date;Particulars;Withdrawals;Deposits;Ref No.;Currency;Balance',
    '11/10/2026;2026-10-11;Subscription;1.234,50;;R-1;PKR;9000',
    '12/10/2026;2026-10-12;Customer receipt;;Rs. 18,000.00;R-2;PKR;27000',
  ].join('\r\n'));
  assert.equal(preview.validCount, 2);
  assert.deepEqual(preview.rows.map(row => [row.transaction?.date, row.transaction?.direction, row.transaction?.amountMinor]), [
    ['2026-10-11', 'out', '123450'], ['2026-10-12', 'in', '1800000'],
  ]);
  assert.deepEqual(preview.rows[0]?.original, ['11/10/2026', '2026-10-11', 'Subscription', '1.234,50', '', 'R-1', 'PKR', '9000']);
});

test('Excel workbook maps a transaction sheet and flags a foreign-currency row for review', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Account statement'], ['Generated automatically']]), 'Summary');
  const transactions = XLSX.utils.aoa_to_sheet([
    ['Txn Date', 'Particulars', 'Withdrawals', 'Deposits', 'Reference No.', 'Currency', 'Balance'],
    ['11/10/2026', 'Cloud plan', '1,234.50', '', 'R-10', 'PKR', '1000'],
    ['12/10/2026', 'Foreign charge', '', '25.00', 'R-11', 'USD', '1025'],
    ['', 'Date serial', '', '50.00', 'R-12', 'PKR', '1075'],
  ]);
  transactions.A4 = { t: 'n', v: (Date.UTC(2026, 9, 13) - Date.UTC(1899, 11, 30)) / 86_400_000, z: 'General' };
  XLSX.utils.book_append_sheet(workbook, transactions, 'Transactions');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  const preview = previewExcel(bytes);
  assert.deepEqual([preview.validCount, preview.invalidCount], [2, 1]);
  assert.deepEqual(preview.rows.map(row => [row.rowNumber, row.transaction?.direction ?? null, row.transaction?.amountMinor ?? null]), [
    [2, 'out', '123450'], [3, null, null], [4, 'in', '5000'],
  ]);
  assert.equal(preview.rows[2]?.transaction?.date, '2026-10-13');
  assert.ok(preview.rows[1]?.errors.some(issue => issue.field === 'currency'));
});

test('Excel ignores formulas in unrelated columns and rejects formulas in imported values', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
    ['2026-10-10', 'Office supplies', '25.00', '', 975],
  ]);
  sheet.E2 = { t: 'n', v: 975, f: '1000-C2' };
  XLSX.utils.book_append_sheet(workbook, sheet, 'Transactions');
  const balanceFormulaFile = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  assert.equal(previewExcel(balanceFormulaFile).validCount, 1);

  sheet.C2 = { t: 'n', v: 25, f: '10+15' };
  const amountFormulaFile = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  assert.throws(() => previewExcel(amountFormulaFile), /imported transaction value uses a formula/);
});
