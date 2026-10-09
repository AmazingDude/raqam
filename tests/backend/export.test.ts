import test from 'node:test';
import assert from 'node:assert/strict';
import { transaction } from './fixtures.ts';
import { exportCashbook, encodeCsvCell } from '../../src/lib/server/export.ts';

test('CSV export preserves exact amounts, statuses and source references', () => {
  const csv = exportCashbook([transaction({ description: 'Reviewed, description' })], 'w1');
  assert.match(csv, /100\.05,PKR/);
  assert.match(csv, /needs_review,unmatched,s1,2/);
  assert.match(csv, /"Reviewed, description"/);
  assert.match(csv, /Synthetic customer payment/);
});

test('spreadsheet formulas, quotes and line breaks are safely encoded', () => {
  for (const value of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =1', '\t=1', '\r=1', '\uFEFF=1']) {
    assert.ok(encodeCsvCell(value).includes(`'${value}`), JSON.stringify(value));
  }
  assert.equal(encodeCsvCell('A "quoted" name'), '"A ""quoted"" name"');
  assert.equal(encodeCsvCell('line1\nline2'), '"line1\nline2"');
  assert.throws(() => exportCashbook([transaction({ workspaceId: 'w2' })], 'w1'), /Inaccessible/);
});
