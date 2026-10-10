import 'server-only';
import * as XLSX from 'xlsx';
import { findTransactionHeader, previewSpreadsheetRows, type CsvPreview } from './csv.ts';

const MAX_WORKSHEET_ROWS = 75;
const MAX_WORKSHEETS = 20;

export function previewExcel(bytes: Uint8Array): CsvPreview {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { cellFormula: true, cellHTML: false, sheetRows: MAX_WORKSHEET_ROWS });
  } catch {
    throw new Error('Excel could not read this workbook. Save it as .xlsx or .xls and try again.');
  }
  if (!workbook.SheetNames.length || workbook.SheetNames.length > MAX_WORKSHEETS) {
    throw new Error(`The workbook must contain 1–${MAX_WORKSHEETS} worksheets.`);
  }

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '', blankrows: true });
    const header = findTransactionHeader(rows);
    if (!header) continue;

    const rangeRef = sheet['!fullref'] ?? sheet['!ref'];
    const dateOverrides = new Map<number, string>();
    if (rangeRef) {
      const range = XLSX.utils.decode_range(rangeRef);
      const physicalHeaderRow = range.s.r + header.index;
      if (range.e.r + 1 - physicalHeaderRow > MAX_WORKSHEET_ROWS) {
        throw new Error('The transaction worksheet is too long to preview. Save a copy with up to 50 transaction rows.');
      }
      if (range.e.c + 1 - range.s.c > 100) {
        throw new Error('The transaction worksheet has more than 100 columns. Save a smaller copy and try again.');
      }
      const sourceColumns = [header.fieldMap.date, header.fieldMap.description, header.fieldMap.direction,
        header.fieldMap.amount, header.fieldMap.debit, header.fieldMap.credit, header.fieldMap.reference,
        header.fieldMap.currency].filter((column): column is number => column !== null);
      for (let row = physicalHeaderRow + 1; row <= range.e.r; row++) {
        for (const column of sourceColumns) {
          const address = XLSX.utils.encode_cell({ r: row, c: range.s.c + column });
          const cell = sheet[address] as XLSX.CellObject | undefined;
          if (cell?.f) throw new Error('An imported transaction value uses a formula. Save calculated values in a copy, then upload it again.');
        }
      }
      const uses1904Dates = !!workbook.Workbook?.WBProps?.date1904;
      for (let row = header.index + 1; row < rows.length; row++) {
        const address = XLSX.utils.encode_cell({ r: range.s.r + row, c: range.s.c + header.fieldMap.date });
        const cell = sheet[address] as XLSX.CellObject | undefined;
        if (cell?.t !== 'n' || typeof cell.v !== 'number') continue;
        const date = XLSX.SSF.parse_date_code(cell.v + (uses1904Dates ? 1462 : 0));
        if (!date) continue;
        dateOverrides.set(row, `${String(date.y).padStart(4, '0')}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`);
      }
    }
    return previewSpreadsheetRows(rows, bytes, rangeRef ? XLSX.utils.decode_range(rangeRef).s.r + 1 : 1, dateOverrides);
  }
  throw new Error('Could not find transaction columns in the first 20 rows of any worksheet. Include Date, Description, and either Amount plus Direction or separate Debit and Credit columns.');
}
