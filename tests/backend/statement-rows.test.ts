import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { assembleStatement, recoverStatement } from '../../src/lib/server/statement-rows.ts';
import { previewPdf } from '../../src/lib/server/pdf.ts';
import { previewPdfRows } from '../../src/lib/server/csv.ts';
import { buildImportPlan } from '../../src/lib/server/imports.ts';
import { csvPreviewSchema } from '../../src/lib/contracts/imports.ts';
import { statementPdf } from '../helpers/pdf-fixture.ts';
const header = ['DATE','PARTICULARS','INST. NO.','DEBIT','CREDIT','BALANCE'];
const cash = (description: string, debit = '0', credit = '0', balance = '') => ['10-Oct-2026',description,'',debit,credit,balance];
const raw = [cash('** Opening Balance','0','0','100.00'),cash('Synthetic payment','10.00','0','90.00'),
  ['', 'wrapped narration','','','',''], ['', 'reference continuation','REF-A','','',''],
  cash('Synthetic receipt','0','25.00','115.00'), ['', 'www.synthetic.invalid','','','','']];
const source = raw.map((original,index) => ({ original, rowNumber:index+2,lineNumber:index+2,pageNumber:1 }));
const hash = 'a'.repeat(64);
test('logical transactions retain all physical sources and exact balance checks without false exceptions', () => {
  const p=csvPreviewSchema.parse(assembleStatement(header,source,hash));
  assert.equal(p.validCount,2);assert.equal(p.invalidCount,0);
  assert.deepEqual(p.rows.map(r=>r.rowNumber),[3,6]);
  assert.equal(p.rows[0]!.transaction!.description,'Synthetic payment\nwrapped narration\nreference continuation');
  assert.equal(p.rows[0]!.transaction!.reference,'REF-A');
  assert.deepEqual(p.statement!.balances,{checked:2,matched:2,unavailable:0,mismatchRows:[]});
  const covered=[...p.rows.flatMap(r=>r.sourceLines!.map(s=>s.rowNumber)),...p.statement!.metadata.map(s=>s.rowNumber)].sort((a,b)=>a-b);
  assert.deepEqual(covered,source.map(s=>s.rowNumber));
  assert.equal(p.statement!.mergedLineCount,2);
});
test('balance gaps and undated money remain exceptions; unavailable balances do not reject clear cash', () => {
  const altered=source.map(s=>({...s,original:[...s.original]}));altered[1]!.original[5]='91.00';
  const p=assembleStatement(header,altered,hash);
  assert.equal(p.rows[0]!.transaction,null);assert.equal(p.rows[0]!.errors[0]!.field,'balance');
  assert.equal(p.statement!.balances.mismatchRows.length,2);
  const orphan=assembleStatement(header,[source[1]!,{rowNumber:4,lineNumber:4,pageNumber:1,original:['','Unknown movement','','4','0','']}],hash);
  assert.equal(orphan.rows.length,2);assert.equal(orphan.rows[1]!.transaction,null);
  assert.equal(orphan.rows[0]!.transaction!.amountMinor,'1000');
  const unknown=assembleStatement(header,[source[1]!,{rowNumber:4,lineNumber:4,pageNumber:1,original:['','www.vendor.invalid','','unknown','0','']}],hash);
  assert.equal(unknown.rows.length,2);assert.equal(unknown.rows[1]!.transaction,null);
});
test('equal-valued cash, narration websites and page-break continuations are preserved', () => {
  const p=assembleStatement(header,[{...source[1]!,original:cash('Pay www.vendor.invalid','10','0','')},
    {rowNumber:4,lineNumber:4,pageNumber:2,original:['','continuation next page','','','','']},
    {rowNumber:5,lineNumber:5,pageNumber:2,original:cash('Pay www.vendor.invalid','10','0','')}],hash);
  assert.equal(p.rows.length,2);assert.equal(p.validCount,2);
  assert.match(p.rows[0]!.transaction!.description,/continuation next page/);
  assert.equal(p.statement!.metadata.length,0);
});
test('old saved preview recovery uses explicit audited decisions and never replaces a confirmed source', () => {
  const bytes=Buffer.from('synthetic old file');
  const old=previewPdfRows([header,...raw],bytes,20000,raw.map(()=>1));
  const before=JSON.stringify(old);const recovered=recoverStatement(old)!;
  assert.equal(JSON.stringify(old),before);
  assert.equal(recovered.preview.validCount,2);assert.equal(recovered.preview.invalidCount,0);
  const plan=buildImportPlan(old,{rows:recovered.decisions});
  assert.equal(plan.filter(r=>r.action==='import'||r.action==='correct').length,2);
  assert.equal(plan.filter(r=>r.action==='reject').length,4);
  assert.equal(plan.filter(r=>r.action==='unresolved').length,0);
  assert.equal(plan.find(r=>r.rowNumber===3)!.action,'correct');
  assert.equal(recoverStatement(recovered.preview),undefined);
  assert.equal(recovered.preview.contentHash,createHash('sha256').update(bytes).digest('hex'));
});
test('compiled parser reconstructs a synthetic six-column statement before validating rows', async () => {
  const p=await previewPdf(statementPdf([[header,...raw]],false,[30,120,300,370,460,550]));
  assert.equal(p.validCount,2);assert.equal(p.invalidCount,0);
  assert.match(p.rows[0]!.transaction!.description,/wrapped narration/);
  assert.equal(p.statement!.balances.matched,2);
});
