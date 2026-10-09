import { createHash } from 'node:crypto';
import type { Direction } from '../contracts/index.ts';
import { isISODate } from '../contracts/schemas.ts';
import { parseAmount } from './money.ts';

export const CSV_TEMPLATE = 'date,description,direction,amount,reference\r\n';
export const MAX_CSV_BYTES = 1024 * 1024; // initial app guard, pending host validation
export type ParsedCashRow = { date: string; description: string; direction: Direction; amountMinor: string; currency: 'PKR'; reference: string | null };
export type PreviewRow = {
  rowNumber: number; lineNumber: number; original: string[];
  transaction: ParsedCashRow | null; errors: { field: string; message: string }[];
};
export type CsvPreview = { currency: 'PKR'; contentHash: string; rows: PreviewRow[]; validCount: number; invalidCount: number };

function decodeRecords(text: string): { values: string[]; lineNumber: number }[] {
  const records: { values: string[]; lineNumber: number }[] = [];
  let values: string[] = [], field = '', state: 'start' | 'plain' | 'quoted' | 'closed' = 'start';
  let line = 1, recordLine = 1, pending = false;
  const finishField = (): void => { values.push(field); field = ''; state = 'start'; };
  const finishRecord = (): void => { finishField(); records.push({ values, lineNumber: recordLine }); values = []; pending = false; };
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    pending = true;
    if (state === 'quoted') {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index++; } else { state = 'closed'; }
      } else {
        field += char;
        if (char === '\n' || (char === '\r' && text[index + 1] !== '\n')) line++;
      }
      continue;
    }
    if (char === ',') { finishField(); continue; }
    if (char === '\r' || char === '\n') {
      finishRecord();
      if (char === '\r' && text[index + 1] === '\n') index++;
      line++; recordLine = line; continue;
    }
    if (char === '"') {
      if (state !== 'start') throw new Error(`Invalid CSV quote on line ${line}`);
      state = 'quoted'; continue;
    }
    if (state === 'closed') throw new Error(`Unexpected text after CSV quote on line ${line}`);
    state = 'plain'; field += char;
  }
  if (state === 'quoted') throw new Error('Unclosed CSV quote; fix the source file before importing');
  if (pending || values.length > 0) finishRecord();
  return records;
}

export function previewCsv(text: string): CsvPreview {
  if (Buffer.byteLength(text, 'utf8') > MAX_CSV_BYTES) throw new Error('CSV exceeds the initial 1 MiB app limit');
  const records = decodeRecords(text.replace(/^\uFEFF/, ''));
  const header = records.shift()?.values;
  const required = ['date', 'description', 'direction', 'amount'];
  const allowed = [...required, 'reference'];
  if (!header || header.length < 4 || header.length > 5 || new Set(header).size !== header.length ||
      header.some(name => !allowed.includes(name)) || required.some(name => !header.includes(name))) {
    throw new Error('Use the PKR CSV template: date,description,direction,amount and optional reference');
  }
  const rows: PreviewRow[] = records.map(({ values, lineNumber }, index) => {
    const get = (name: string): string => values[header.indexOf(name)] ?? '';
    const errors: PreviewRow['errors'] = [];
    const date = get('date').trim(), description = get('description'), direction = get('direction').trim();
    const amountMinor = parseAmount(get('amount'));
    if (values.length !== header.length) errors.push({ field: 'row', message: 'Column count does not match the header' });
    if (!isISODate(date)) errors.push({ field: 'date', message: 'Use a valid YYYY-MM-DD date' });
    if (!description.trim() || description.length > 2000) errors.push({ field: 'description', message: 'Description must contain 1–2000 characters' });
    if (direction !== 'in' && direction !== 'out') errors.push({ field: 'direction', message: 'Direction must be in or out' });
    if (amountMinor === null) errors.push({ field: 'amount', message: 'Use a nonnegative decimal with at most two places; direction carries the sign' });
    if (get('reference').length > 500) errors.push({ field: 'reference', message: 'Reference exceeds 500 characters' });
    const transaction: ParsedCashRow | null = errors.length ? null : {
      date, description, direction: direction as Direction, amountMinor: amountMinor!, currency: 'PKR', reference: get('reference') || null,
    };
    return { rowNumber: index + 2, lineNumber, original: values, transaction, errors };
  });
  return {
    currency: 'PKR', contentHash: createHash('sha256').update(text, 'utf8').digest('hex'), rows,
    validCount: rows.filter(row => row.transaction !== null).length, invalidCount: rows.filter(row => row.transaction === null).length,
  };
}
