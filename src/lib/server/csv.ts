import { createHash } from 'node:crypto';
import type { Direction } from '../contracts/index.ts';
import { isISODate } from '../contracts/schemas.ts';
import { formatAmount, parseAmount } from './money.ts';

export const CSV_TEMPLATE = 'date,description,direction,amount,reference\r\n';
export const MAX_CSV_BYTES = 1024 * 1024; // initial app guard, pending host validation
export type ParsedCashRow = { date: string; description: string; direction: Direction; amountMinor: string; currency: 'PKR'; reference: string | null };
export type ImportFieldMap = {
  date: number; description: number; direction: number | null; amount: number | null;
  debit: number | null; credit: number | null; reference: number | null; currency: number | null;
};
export type DraftFields = { date: string; description: string; direction: string; amount: string; reference: string };
export type PreviewRow = {
  rowNumber: number; lineNumber: number; original: string[];
  transaction: ParsedCashRow | null; errors: { field: string; message: string }[]; draftFields?: DraftFields | undefined;
};
export type CsvPreview = {
  currency: 'PKR'; contentHash: string; header: string[]; fieldMap?: ImportFieldMap | undefined;
  rows: PreviewRow[]; validCount: number; invalidCount: number;
};
type SourceRow = { values: string[]; rowNumber: number; lineNumber: number; dateOverride?: string };
type HeaderMatch = { headerIndex: number; header: string[]; fieldMap: ImportFieldMap };

function detectDelimiter(text: string): string {
  const counts = new Map([['\t', 0], [',', 0], [';', 0], ['|', 0]]);
  let quoted = false, lines = 0;
  for (let index = 0; index < Math.min(text.length, 8192); index++) {
    const char = text[index]!;
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { index++; continue; }
      quoted = !quoted;
    } else if (!quoted && (char === '\r' || char === '\n')) {
      if (char === '\n' || text[index + 1] !== '\n') lines++;
      if (lines >= 20) break;
    }
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ',';
}

function decodeRecords(text: string, delimiter: string): { values: string[]; lineNumber: number }[] {
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
    if (char === delimiter) { finishField(); continue; }
    if (char === '\r' || char === '\n') {
      finishRecord();
      if (char === '\r' && text[index + 1] === '\n') index++;
      line++; recordLine = line; continue;
    }
    if (char === '"') {
      if (state !== 'start') throw new Error(`Invalid quote on line ${line}.`);
      state = 'quoted'; continue;
    }
    if (state === 'closed') throw new Error(`Unexpected text after a quoted field on line ${line}.`);
    state = 'plain'; field += char;
  }
  if (state === 'quoted') throw new Error(`Unclosed quoted field on line ${recordLine}.`);
  if (pending || values.length > 0) finishRecord();
  return records;
}

function normalizeHeader(value: string): string {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

const headerAliases: Record<Exclude<keyof ImportFieldMap, 'date' | 'description'>, Set<string>> = {
  direction: new Set(['direction', 'type', 'transaction type', 'dr cr', 'cr dr', 'debit credit', 'credit debit', 'in out', 'cash flow']),
  amount: new Set(['amount', 'transaction amount', 'amount pkr', 'amount rs', 'value', 'transaction value', 'net amount', 'withdrawal deposit']),
  debit: new Set(['debit', 'debit amount', 'debit amt', 'debit pkr', 'debit rs', 'dr amount', 'debits', 'withdrawal', 'withdrawals', 'withdrawal amount', 'withdrawal rs', 'amount debited', 'money out', 'paid out', 'payment']),
  credit: new Set(['credit', 'credit amount', 'credit amt', 'credit pkr', 'credit rs', 'cr amount', 'credits', 'deposit', 'deposits', 'deposit amount', 'deposit rs', 'amount credited', 'money in', 'paid in', 'receipt']),
  reference: new Set(['reference', 'ref', 'ref no', 'ref cheque no', 'reference no', 'reference number', 'transaction reference', 'transaction id', 'transaction number', 'cheque no', 'check no', 'cheque number', 'check number', 'instrument number', 'id']),
  currency: new Set(['currency', 'ccy', 'currency code']),
};
const dateHeaders = new Set(['date', 'transaction date', 'posting date', 'posted date', 'value date', 'booking date', 'txn date', 'trans date']);
const descriptionHeaders = new Set(['description', 'transaction description', 'details', 'transaction details', 'particulars', 'transaction particulars', 'narration', 'narrative', 'transaction narrative', 'memo', 'payee', 'merchant', 'remarks', 'transaction remarks']);

function mapHeader(values: string[]): ImportFieldMap | null {
  const indices: Record<keyof ImportFieldMap, number[]> = {
    date: [], description: [], direction: [], amount: [], debit: [], credit: [], reference: [], currency: [],
  };
  values.forEach((value, index) => {
    const name = normalizeHeader(value);
    if (dateHeaders.has(name)) indices.date.push(index);
    if (descriptionHeaders.has(name)) indices.description.push(index);
    for (const [field, aliases] of Object.entries(headerAliases) as [keyof ImportFieldMap, Set<string>][]) {
      if (aliases.has(name)) indices[field].push(index);
    }
  });
  if (!indices.date.length || !indices.description.length || indices.direction.length > 1 ||
      indices.amount.length > 1 || indices.debit.length > 1 || indices.credit.length > 1 ||
      indices.reference.length > 1 || indices.currency.length > 1) return null;
  const amount = indices.amount[0] ?? null, debit = indices.debit[0] ?? null, credit = indices.credit[0] ?? null;
  if (amount === null && (debit === null || credit === null)) return null;
  const datePriority = ['transaction date', 'txn date', 'trans date', 'date', 'posting date', 'posted date', 'booking date', 'value date'];
  const descriptionPriority = ['description', 'transaction description', 'narration', 'narrative', 'particulars', 'transaction details', 'details', 'memo', 'payee', 'merchant'];
  const date = datePriority.map(name => indices.date.find(index => normalizeHeader(values[index] ?? '') === name)).find(index => index !== undefined);
  const description = descriptionPriority.map(name => indices.description.find(index => normalizeHeader(values[index] ?? '') === name)).find(index => index !== undefined);
  if (date === undefined || description === undefined) return null;
  return {
    date, description, direction: indices.direction[0] ?? null,
    amount, debit, credit, reference: indices.reference[0] ?? null, currency: indices.currency[0] ?? null,
  };
}

function validDate(year: number, month: number, day: number): string | null {
  if (year < 100) year += year < 50 ? 2000 : 1900;
  const value = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isISODate(value) ? value : null;
}

function parseSourceDate(input: string): string | null {
  const value = input.trim();
  if (isISODate(value)) return value;
  let match = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(value);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(value);
  if (match) {
    const first = Number(match[1]), second = Number(match[2]);
    // Pakistan bank exports commonly use day/month. If only one interpretation is possible,
    // use it; otherwise apply that local convention consistently.
    const [day, month] = first > 12 ? [first, second] : second > 12 ? [second, first] : [first, second];
    return validDate(Number(match[3]), month, day);
  }
  match = /^(\d{1,2})[\s\-]+([a-z]{3,9})[\s,\-]+(\d{2,4})$/i.exec(value);
  if (match) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthName = match[2]!.toLowerCase().slice(0, 3), month = months.indexOf(monthName) + 1;
    if (month > 0) return validDate(Number(match[3]), month, Number(match[1]));
  }
  return null;
}

function parseSourceAmount(input: string): { amountMinor: string | null; sign: -1 | 1 } {
  let value = input.trim().replace(/[\u00a0\u202f\s']/g, '');
  if (!value) return { amountMinor: null, sign: 1 };
  value = value.replace(/^(?:PKR|Rs\.?|₨)/i, '').replace(/(?:PKR|Rs\.?|₨)$/i, '');
  let negative = false;
  if (value.startsWith('(') && value.endsWith(')')) { negative = true; value = value.slice(1, -1); }
  if (value.startsWith('-')) { negative = true; value = value.slice(1); }
  else if (value.startsWith('+')) value = value.slice(1);

  const comma = value.lastIndexOf(','), dot = value.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = Math.max(comma, dot), group = decimal === comma ? '.' : ',';
    const fraction = value.slice(decimal + 1);
    const whole = value.slice(0, decimal);
    if (!/^\d{1,2}$/.test(fraction) || !validGroupedInteger(whole, group)) return { amountMinor: null, sign: negative ? -1 : 1 };
    value = whole.split(group).join('') + '.' + fraction;
  } else if (comma >= 0) {
    const parts = value.split(',');
    if (parts.length > 1 && parts.slice(1).every(part => /^\d{3}$/.test(part))) value = parts.join('');
    else {
      const fraction = parts.at(-1) ?? '';
      const whole = parts.slice(0, -1).join(',');
      if (!/^\d{1,2}$/.test(fraction) || !validGroupedInteger(whole, ',')) return { amountMinor: null, sign: negative ? -1 : 1 };
      value = whole.split(',').join('') + '.' + fraction;
    }
  } else if (dot >= 0) {
    const parts = value.split('.');
    if (parts.length > 2) {
      if (!parts.slice(1).every(part => /^\d{3}$/.test(part))) return { amountMinor: null, sign: negative ? -1 : 1 };
      value = parts.join('');
    }
  }
  const amountMinor = parseAmount(value);
  return { amountMinor, sign: negative ? -1 : 1 };
}

function validGroupedInteger(value: string, separator: string): boolean {
  const escaped = separator === '.' ? '\\.' : ',';
  return new RegExp(`^\\d{1,3}(?:${escaped}\\d{3})*$|^\\d+$`).test(value);
}

function parseDirection(input: string): Direction | null {
  const value = normalizeHeader(input);
  if (['in', 'credit', 'cr', 'deposit', 'deposited', 'received', 'receipt', 'inflow', 'money in'].includes(value)) return 'in';
  if (['out', 'debit', 'dr', 'withdrawal', 'withdrawn', 'paid', 'payment', 'outflow', 'money out'].includes(value)) return 'out';
  return null;
}

function trimValue(row: string[], index: number | null): string {
  return index === null ? '' : (row[index] ?? '').trim();
}

function mapSourceRows(sourceRows: SourceRow[], contentHash: string): CsvPreview {
  let match: HeaderMatch | undefined;
  for (let index = 0; index < Math.min(sourceRows.length, 20); index++) {
    const header = sourceRows[index]!.values;
    const fieldMap = mapHeader(header);
    if (fieldMap) { match = { headerIndex: index, header, fieldMap }; break; }
  }
  if (!match) throw new Error(`Could not find transaction columns in the first 20 rows. Include Date, Description, and either Amount plus Direction or separate Debit and Credit columns. Download the Raqam template for an example.`);

  const tableRows = sourceRows.slice(match.headerIndex + 1);
  let lastDataIndex = -1;
  tableRows.forEach((row, index) => { if (row.values.some(value => value.trim() !== '')) lastDataIndex = index; });
  if (lastDataIndex < 0) throw new Error('The transaction table has a header but no data rows.');
  const sourceDataRows = tableRows.slice(0, lastDataIndex + 1);
  if (sourceDataRows.length > 50) throw new Error('This import contains more than 50 rows. Split the file into batches of up to 50 rows.');
  const maxColumns = Math.max(match.header.length, ...sourceDataRows.map(row => row.values.length));
  if (maxColumns > 100) throw new Error('The transaction table has more than 100 columns. Remove unrelated columns or save a smaller copy.');
  const header = Array.from({ length: maxColumns }, (_, index) => match!.header[index] ?? `Extra field ${index + 1}`);
  const fieldMap = match.fieldMap;

  const rows: PreviewRow[] = sourceDataRows.map(source => {
    const original = Array.from({ length: maxColumns }, (_, index) => source.values[index] ?? '');
    const errors: PreviewRow['errors'] = [];
    const rawDate = source.dateOverride ?? trimValue(original, fieldMap.date);
    const date = parseSourceDate(rawDate);
    const description = trimValue(original, fieldMap.description);
    const rawDirection = trimValue(original, fieldMap.direction);
    const explicitDirection = rawDirection ? parseDirection(rawDirection) : null;
    let rawAmount = fieldMap.amount === null ? '' : trimValue(original, fieldMap.amount);
    let sign: -1 | 1 = 1;
    let parsedAmount: string | null = null;
    let direction = explicitDirection;
    if (fieldMap.amount !== null) {
      const parsed = parseSourceAmount(rawAmount);
      parsedAmount = parsed.amountMinor;
      sign = parsed.sign;
      if (!direction && sign < 0) direction = 'out';
      if (explicitDirection && sign < 0 && explicitDirection !== 'out') errors.push({ field: 'direction', message: 'The negative amount conflicts with the inflow direction.' });
    } else {
      const rawDebit = trimValue(original, fieldMap.debit), rawCredit = trimValue(original, fieldMap.credit);
      const debit = rawDebit ? parseSourceAmount(rawDebit) : { amountMinor: '0', sign: 1 as const };
      const credit = rawCredit ? parseSourceAmount(rawCredit) : { amountMinor: '0', sign: 1 as const };
      if ((rawDebit && debit.amountMinor === null) || (rawCredit && credit.amountMinor === null)) {
        errors.push({ field: 'amount', message: 'Use a PKR amount with at most two decimal places.' });
      } else if (debit.sign < 0 || credit.sign < 0) {
        errors.push({ field: 'amount', message: 'Debit and Credit columns must contain nonnegative amounts.' });
      } else if (rawDebit && rawCredit && debit.amountMinor !== '0' && credit.amountMinor !== '0') {
        errors.push({ field: 'amount', message: 'Both Debit and Credit contain an amount; review this row.' });
      } else if (rawDebit && debit.amountMinor !== '0') {
        parsedAmount = debit.amountMinor;
        direction = explicitDirection ?? 'out';
        if (explicitDirection === 'in') errors.push({ field: 'direction', message: 'The inflow direction conflicts with the Debit column.' });
        rawAmount = rawDebit;
      } else if (rawCredit && credit.amountMinor !== '0') {
        parsedAmount = credit.amountMinor;
        direction = explicitDirection ?? 'in';
        if (explicitDirection === 'out') errors.push({ field: 'direction', message: 'The outflow direction conflicts with the Credit column.' });
        rawAmount = rawCredit;
      } else if ((rawDebit && debit.amountMinor === '0') || (rawCredit && credit.amountMinor === '0')) {
        parsedAmount = '0';
        direction = explicitDirection;
        rawAmount = rawDebit || rawCredit;
      }
    }
    if (!date) errors.push({ field: 'date', message: 'Use YYYY-MM-DD or a recognizable day/month bank date.' });
    if (!description || description.length > 2000) errors.push({ field: 'description', message: 'Description must contain 1–2000 characters.' });
    if (fieldMap.direction !== null && rawDirection && !explicitDirection) errors.push({ field: 'direction', message: 'Use In/Credit/Deposit or Out/Debit/Withdrawal.' });
    if (!direction) errors.push({ field: 'direction', message: 'Direction is unclear. Choose cash in or cash out when correcting this row.' });
    if (parsedAmount === null && !errors.some(issue => issue.field === 'amount')) errors.push({ field: 'amount', message: 'Use a PKR amount with at most two decimal places.' });
    const currency = trimValue(original, fieldMap.currency);
    if (fieldMap.currency !== null && !currency) errors.push({ field: 'currency', message: 'Currency is blank; confirm that this row is PKR before importing.' });
    else if (currency && !['pkr', 'rs', 'rupee', 'rupees'].includes(normalizeHeader(currency).replace(/\s/g, '')) && currency.trim() !== '₨') {
      errors.push({ field: 'currency', message: `This workspace imports PKR only; the row is marked ${currency}.` });
    }
    const reference = trimValue(original, fieldMap.reference);
    if (reference.length > 500) errors.push({ field: 'reference', message: 'Reference exceeds 500 characters.' });
    const draftFields: DraftFields = {
      date: date ?? rawDate, description, direction: direction ?? '',
      amount: parsedAmount === null ? rawAmount : formatAmount(parsedAmount), reference,
    };
    const transaction: ParsedCashRow | null = errors.length ? null : {
      date: date!, description, direction: direction!, amountMinor: parsedAmount!, currency: 'PKR', reference: reference || null,
    };
    return { rowNumber: source.rowNumber, lineNumber: source.lineNumber, original, transaction, errors, draftFields };
  });
  const validCount = rows.filter(row => row.transaction !== null).length;
  return { currency: 'PKR', contentHash, header, fieldMap, rows, validCount, invalidCount: rows.length - validCount };
}

export function previewCsv(text: string, sourceHash?: string): CsvPreview {
  if (Buffer.byteLength(text, 'utf8') > MAX_CSV_BYTES) throw new Error('The file exceeds the 1 MiB import limit.');
  const source = text.replace(/^\uFEFF/, '');
  const records = decodeRecords(source, detectDelimiter(source));
  return mapSourceRows(records.map((record, index) => ({ ...record, rowNumber: index + 1 })), sourceHash ?? createHash('sha256').update(text, 'utf8').digest('hex'));
}

export function findTransactionHeader(rows: unknown[][]): { index: number; fieldMap: ImportFieldMap } | null {
  for (let index = 0; index < Math.min(rows.length, 20); index++) {
    const fieldMap = mapHeader((rows[index] ?? []).map(value => value === null || value === undefined ? '' : String(value)));
    if (fieldMap) return { index, fieldMap };
  }
  return null;
}

export function previewSpreadsheetRows(rows: unknown[][], bytes: Uint8Array, firstWorksheetRow = 1, dateOverrides = new Map<number, string>()): CsvPreview {
  if (rows.length > 75) throw new Error('The worksheet is larger than the supported preview. Save a copy with only the transaction table.');
  const sourceRows: SourceRow[] = rows.map((row, index) => ({
    values: row.map(value => value === null || value === undefined ? '' : String(value)),
    rowNumber: firstWorksheetRow + index, lineNumber: firstWorksheetRow + index,
    ...(dateOverrides.has(index) ? { dateOverride: dateOverrides.get(index)! } : {}),
  }));
  return mapSourceRows(sourceRows, createHash('sha256').update(bytes).digest('hex'));
}
