import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { previewCsv } from '../../src/lib/server/csv.ts';
import { buildImportPlan, readCsvUpload } from '../../src/lib/server/imports.ts';
import { importConfirmationSchema } from '../../src/lib/contracts/imports.ts';

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
test('UTF-8 CSV upload preserves BOM bytes, column order and original fields', async () => {
  const text = '\uFEFFamount,description,date,direction\r\n1.00," A, original ",2026-10-10,out\r\n';
  const bytes = Buffer.from(text);
  const result = await readCsvUpload(upload(bytes));
  assert.deepEqual(result.preview.header, ['amount', 'description', 'date', 'direction']);
  assert.equal(result.preview.contentHash, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(result.preview.rows[0]?.original[1], ' A, original ');
  assert.deepEqual(result.bytes, new Uint8Array(bytes));
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
