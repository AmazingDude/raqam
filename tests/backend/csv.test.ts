import test from 'node:test';
import assert from 'node:assert/strict';
import { previewCsv } from '../../src/lib/server/csv.ts';

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
  assert.throws(() => previewCsv('date,description,direction,amount,currency'), /template/);
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
