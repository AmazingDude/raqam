import { MAX_IMPORT_ROWS } from '../contracts/limits.ts';
import type { PdfSourceLine, ImportConfirmation, StatementPreview } from '../contracts/imports.ts';
import { findTransactionHeader, parseSourceAmount, parseSourceDate, previewPdfSourceRows, type CsvPreview, type ImportFieldMap } from './csv.ts';

function minor(value: string): bigint | null {
  const parsed = parseSourceAmount(value);
  return parsed.amountMinor === null ? null : BigInt(parsed.amountMinor) * BigInt(parsed.sign);
}
const footer = /(?:for latest schedule of charges|visit your branch|visit our website|ubl website|www\.[a-z0-9.-]+|ublunitedbankltd|^ubldigital$)/i;
const balanceLabel = /^(?:\*\*\s*)?(?:opening balance|closing balance|balance brought forward|balance carried forward|brought forward|carried forward)\b/i;

// Every physical line survives as either a logical row's source or labelled
// metadata. An undated line with money never disappears into a description.
export function assembleStatement(header: string[], source: PdfSourceLine[], contentHash: string, fieldMap?: ImportFieldMap): CsvPreview {
  const map = fieldMap ?? findTransactionHeader([header])?.fieldMap;
  if (!map) throw new Error('The statement column headings could not be verified.');
  const balanceIndex = header.findIndex(value => /^(?:running |available |closing )?balance(?:\s*\([^)]*\))?$/i.test(value.trim()));
  const moneyColumns = [map.amount, map.debit, map.credit, map.direction, balanceIndex < 0 ? null : balanceIndex]
    .filter((value): value is number => value !== null);
  const logical: { line: PdfSourceLine; sources: PdfSourceLine[] }[] = [];
  const metadata: StatementPreview['metadata'] = [];
  let previous: typeof logical[number] | undefined;
  let footerPage: number | undefined;
  let opening: bigint | null = null;
  for (const input of source) {
    const line = { ...input, original: [...input.original] };
    const text = line.original.join(' ').trim();
    const movementColumns = [map.amount, map.debit, map.credit].filter((value): value is number => value !== null);
    const hasDate = parseSourceDate(line.original[map.date] ?? '') !== null;
    const hasMovement = movementColumns.some(index => { const cash = minor(line.original[index] ?? ''); return cash !== null && cash !== 0n; });
    const unknownCash = movementColumns.some(index => { const value = line.original[index]?.trim() ?? '';
      return !!value && minor(value) === null && !footer.test(value) && !/^ubl(?:unitedbankltd|digital)?$/i.test(value.replace(/[^a-z]/gi, '')); });
    if (!hasDate && !hasMovement && !unknownCash && (footer.test(text) || (footerPage !== undefined && footerPage === line.pageNumber))) {
      footerPage = line.pageNumber; metadata.push({ ...line, kind: 'footer' }); continue;
    }
    const description = line.original[map.description]?.trim() ?? '';
    const noMovement = movementColumns.every(index => !line.original[index]?.trim() || minor(line.original[index]!) === 0n);
    if (balanceLabel.test(description) && noMovement) {
      metadata.push({ ...line, kind: 'balance' }); previous = undefined;
      if (/opening|brought/i.test(description) && balanceIndex >= 0 && logical.length === 0)
        opening = minor(line.original[balanceIndex] ?? '');
      continue;
    }
    const narrationOnly = !line.original[map.date]?.trim() && description.length > 0 &&
      moneyColumns.every(index => !line.original[index]?.trim()) &&
      line.original.every((value, index) => !value.trim() || index === map.description || index === map.reference);
    if (narrationOnly && previous && previous.line.original[map.date]?.trim() &&
      (line.pageNumber ?? 1) <= (previous.sources.at(-1)?.pageNumber ?? 1) + 1) {
      previous.line.original[map.description] += `\n${description}`;
      if (map.reference !== null && line.original[map.reference]?.trim())
        previous.line.original[map.reference] = [previous.line.original[map.reference], line.original[map.reference]].filter(Boolean).join('\n');
      previous.sources.push(line); continue;
    }
    previous = { line: { ...line, original: [...line.original] }, sources: [line] };
    logical.push(previous);
  }
  const preview = previewPdfSourceRows(header, logical.map(row => row.line), contentHash, MAX_IMPORT_ROWS, map);
  const balances: StatementPreview['balances'] = { checked: 0, matched: 0, unavailable: 0, mismatchRows: [] };
  let lastBalance = opening;
  preview.rows.forEach((row, index) => {
    row.sourceLines = logical[index]!.sources;
    const balance = balanceIndex >= 0 ? minor(row.original[balanceIndex] ?? '') : null;
    if (row.transaction && lastBalance !== null && balance !== null) {
      balances.checked++;
      const change = BigInt(row.transaction.amountMinor) * (row.transaction.direction === 'in' ? 1n : -1n);
      if (lastBalance + change === balance) balances.matched++;
      else {
        balances.mismatchRows.push(row.rowNumber);
        row.errors.push({ field: 'balance', message: 'This movement does not reconcile with the previous running balance. Check the source for a missing or misread transaction.' });
        row.transaction = null;
      }
    } else balances.unavailable++;
    lastBalance = balance;
  });
  preview.validCount = preview.rows.filter(row => row.transaction !== null).length;
  preview.invalidCount = preview.rows.length - preview.validCount;
  preview.statement = { parserVersion: 'logical-rows-v1', sourceLineCount: source.length,
    mergedLineCount: logical.reduce((sum, row) => sum + row.sources.length - 1, 0), metadata, balances };
  return preview;
}

// Old stored previews remain immutable. Recovery proposes explicit corrections
// and rejections through the existing audited confirmation/resolution APIs.
export function recoverStatement(preview: CsvPreview): { preview: CsvPreview; decisions: ImportConfirmation['rows'] } | undefined {
  if (preview.statement || !preview.rows.length || preview.rows.some(row => row.pageNumber === undefined)) return;
  let recovered: CsvPreview;
  try { recovered = assembleStatement(preview.header, preview.rows.map(row => ({ rowNumber: row.rowNumber,
    lineNumber: row.lineNumber, pageNumber: row.pageNumber, original: row.original })), preview.contentHash); }
  catch { return; }
  const retained = new Map(recovered.rows.map(row => [row.rowNumber, row]));
  const sourceNumbers = new Set(recovered.rows.flatMap(row => row.sourceLines?.map(line => line.rowNumber) ?? []));
  const metadataNumbers = new Set(recovered.statement?.metadata.map(line => line.rowNumber));
  const decisions: ImportConfirmation['rows'] = [];
  for (const row of preview.rows) {
    const replacement = retained.get(row.rowNumber);
    if (replacement?.transaction && JSON.stringify(replacement.transaction) !== JSON.stringify(row.transaction))
      decisions.push({ rowNumber: row.rowNumber, action: 'correct', transaction: replacement.transaction });
    else if (!replacement && row.transaction === null && (sourceNumbers.has(row.rowNumber) || metadataNumbers.has(row.rowNumber)))
      decisions.push({ rowNumber: row.rowNumber, action: 'reject' });
  }
  // Never hide a formerly valid cash row, even if a layout interpretation changes.
  if (preview.rows.some(row => row.transaction && !retained.get(row.rowNumber)?.transaction)) return;
  return { preview: recovered, decisions };
}
