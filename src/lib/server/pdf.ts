import 'server-only';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFParse } from 'pdf-parse';
import { MAX_PDF_PAGES } from '../contracts/limits.ts';
import { findTransactionHeader, type CsvPreview, type ImportFieldMap } from './csv.ts';
import { BackendError } from './errors.ts';
import { createHash } from 'node:crypto';
import { assembleStatement } from './statement-rows.ts';
import { decideStatementHeader } from './statement-header-decision.ts';

const packageRequire = createRequire(`${process.cwd()}/package.json`);
const PDFJS_ROOT = resolve(dirname(packageRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs')), '../..');
const STANDARD_FONTS_PATH = `${resolve(PDFJS_ROOT, 'standard_fonts')}/`;
const CMAPS_PATH = `${resolve(PDFJS_ROOT, 'cmaps')}/`;
GlobalWorkerOptions.workerSrc = pathToFileURL(resolve(PDFJS_ROOT, 'legacy/build/pdf.worker.mjs')).href;
PDFParse.setWorker(GlobalWorkerOptions.workerSrc);
const MAX_PDF_TEXT_ITEMS = 2_000_000;
const MAX_PDF_TEXT_CHARACTERS = 20_000_000;
const HEADER_SCAN_LINES = 30;

type PositionedText = { text: string; x: number; y: number; width: number; height: number };
type PdfLine = { y: number; items: PositionedText[] };
type PdfCell = { text: string; left: number; right: number };
type HeaderLayout = { cells: PdfCell[]; fieldMap: ImportFieldMap };
class PdfImportError extends Error {}

function hasPdfSignature(bytes: Uint8Array): boolean {
  const prefix = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 1024))).toString('latin1');
  return /%PDF-\d\.\d/.test(prefix);
}

function positionTextItems(items: unknown[]): PositionedText[] {
  const positioned: PositionedText[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || !('str' in item) || typeof item.str !== 'string' || !item.str.trim()) continue;
    const textItem = item as { str: string; transform?: unknown[]; width?: number; height?: number };
    const x = Number(textItem.transform?.[4]), y = Number(textItem.transform?.[5]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(textItem.width) || !Number.isFinite(textItem.height)) continue;
    positioned.push({ text: textItem.str.trim(), x, y, width: Math.max(0, textItem.width!), height: Math.max(0, textItem.height!) });
  }
  return positioned.sort((left, right) => right.y - left.y || left.x - right.x);
}

function groupLines(items: PositionedText[]): PdfLine[] {
  const lines: PdfLine[] = [];
  for (const item of items) {
    const current = lines.at(-1);
    const tolerance = Math.max(2, Math.min(4.5, item.height * 0.35));
    if (current && Math.abs(current.y - item.y) <= tolerance) {
      current.items.push(item);
      current.y = (current.y * (current.items.length - 1) + item.y) / current.items.length;
    } else lines.push({ y: item.y, items: [item] });
  }
  return lines;
}

function groupCells(line: PdfLine): PdfCell[] {
  const cells: PdfCell[] = [];
  for (const item of [...line.items].sort((left, right) => left.x - right.x)) {
    const previous = cells.at(-1);
    const gap = previous ? item.x - previous.right : Number.POSITIVE_INFINITY;
    const joinGap = Math.max(6, Math.min(12, item.height * 1.2));
    if (previous && gap <= joinGap) {
      previous.text = `${previous.text} ${item.text}`.trim();
      previous.right = Math.max(previous.right, item.x + item.width);
    } else cells.push({ text: item.text, left: item.x, right: item.x + item.width });
  }
  return cells;
}

function identifyHeader(line: PdfLine): HeaderLayout | null {
  const cells = groupCells(line);
  if (cells.length < 4 || cells.length > 100) return null;
  const match = findTransactionHeader([cells.map(cell => cell.text)]);
  return match ? { cells, fieldMap: match.fieldMap } : null;
}

function valuesForLine(line: PdfLine, centers: number[]): string[] {
  const values = Array.from({ length: centers.length }, () => '');
  const boundaries = centers.slice(0, -1).map((center, index) => (center + centers[index + 1]!) / 2);
  for (const item of [...line.items].sort((left, right) => left.x - right.x)) {
    const column = boundaries.findIndex(boundary => item.x < boundary);
    const index = column < 0 ? centers.length - 1 : column;
    values[index] = `${values[index]} ${item.text}`.trim();
  }
  return values;
}

function sameFieldMap(left: ImportFieldMap, right: ImportFieldMap): boolean {
  return left.date === right.date && left.description === right.description && left.direction === right.direction &&
    left.amount === right.amount && left.debit === right.debit && left.credit === right.credit &&
    left.reference === right.reference && left.currency === right.currency;
}

function pdfReadError(failure: unknown): Error {
  const name = failure && typeof failure === 'object' && 'name' in failure ? String(failure.name) : '';
  const message = failure instanceof Error ? failure.message : '';
  if (name === 'PasswordException' || /password/i.test(message)) return new PdfImportError('This PDF is password-protected. Save an unlocked copy and upload it again.', { cause: failure });
  if (name === 'InvalidPDFException') return new PdfImportError('This PDF is damaged or incomplete. Download a fresh PDF copy and try again.', { cause: failure });
  const unavailable = new BackendError('UNAVAILABLE', /fake worker|workerSrc|Cannot find module/i.test(message)
    ? 'The PDF reader could not start. Restart the Raqam server and try again.'
    : 'Raqam could not process this PDF right now. Please try again.');
  unavailable.cause = failure;
  return unavailable;
}

export async function previewPdf(bytes: Uint8Array, signal?: AbortSignal): Promise<CsvPreview> {
  if (!hasPdfSignature(bytes)) throw new PdfImportError('This file is not a readable PDF. Choose a PDF account statement.');
  const active = () => { if (signal?.aborted) throw new BackendError('UNAVAILABLE', 'PDF import was cancelled.'); };
  active();
  const options = { stopAtErrors: true, disableAutoFetch: true, enableXfa: false,
    standardFontDataUrl: STANDARD_FONTS_PATH, cMapUrl: CMAPS_PATH, cMapPacked: true };
  const loadingTask = getDocument({ ...options, data: new Uint8Array(bytes) });
  // Use the library's ruled-table detector; positional text preserves blank
  // Debit/Credit cells when the statement has no drawn table borders.
  const tables = new PDFParse({ ...options, data: new Uint8Array(bytes) });
  const cancel = () => { void loadingTask.destroy().catch(() => undefined); void tables.destroy().catch(() => undefined); };
  signal?.addEventListener('abort', cancel, { once: true });
  const matrix: string[][] = [], sourcePages: number[] = [];
  let firstHeader: HeaderLayout | null = null, itemCount = 0, characterCount = 0, decisionAttempted = false;
  const append = (values: string[], pageNumber: number) => {
    if (!values.some(value => value.trim())) return;
    if (matrix.length > MAX_PDF_TEXT_ITEMS) throw new PdfImportError('This PDF exceeds the source-line processing limit.');
    matrix.push(values); sourcePages.push(pageNumber);
  };
  try {
    const document = await loadingTask.promise;
    if (document.numPages < 1 || document.numPages > MAX_PDF_PAGES) throw new PdfImportError(`PDF statements must have 1-${MAX_PDF_PAGES} pages.`);
    // Keep only one 25-page table result and one page's text in memory.
    for (let start = 1; start <= document.numPages; start += 25) {
      active();
      const end = Math.min(document.numPages, start + 24);
      const tableBatch = await tables.getTable({ first: start, last: end });
      for (let pageNumber = start; pageNumber <= end; pageNumber++) {
        active();
        const page = await document.getPage(pageNumber);
        try {
          const content = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
          const positioned = positionTextItems(content.items);
          itemCount += content.items.length;
          characterCount += positioned.reduce((sum, item) => sum + item.text.length, 0);
          if (itemCount > MAX_PDF_TEXT_ITEMS || characterCount > MAX_PDF_TEXT_CHARACTERS) throw new PdfImportError('This PDF exceeds the text processing limit. Split it into smaller date ranges.');
          // Do not return a deceptively complete preview if a scanned page occurs
          // in the middle of an otherwise selectable-text statement.
          if (!positioned.length) throw new PdfImportError(`Page ${pageNumber} has no selectable transaction text. Scanned or image-only statements need OCR; upload an OCR text-based PDF, CSV, or Excel file.`);
          const lines = groupLines(positioned);
          let headerLine = lines.slice(0, HEADER_SCAN_LINES).findIndex(line => identifyHeader(line) !== null);
          let pageHeader = headerLine >= 0 ? identifyHeader(lines[headerLine]!) : null;
          if (!pageHeader && firstHeader) {
            const repeated = lines.slice(0, HEADER_SCAN_LINES).findIndex(line =>
              JSON.stringify(groupCells(line).map(cell => cell.text)) === JSON.stringify(firstHeader!.cells.map(cell => cell.text)));
            if (repeated >= 0) { headerLine = repeated; pageHeader = { cells: groupCells(lines[repeated]!), fieldMap: firstHeader.fieldMap }; }
          }
          if (!firstHeader && !pageHeader && !decisionAttempted) {
            const candidateLine = lines.slice(0, HEADER_SCAN_LINES).findIndex(line => {
              const text = groupCells(line).map(cell => cell.text).join(' ');
              return /\bdate\b/i.test(text) && /\bdebit\b/i.test(text) && /\bcredit\b/i.test(text);
            });
            if (candidateLine >= 0) {
              decisionAttempted = true;
              const cells = groupCells(lines[candidateLine]!);
              const map = await decideStatementHeader(cells.map(cell => cell.text), signal);
              if (map) { pageHeader = { cells, fieldMap: map }; headerLine = candidateLine; }
            }
          }
          if (pageHeader && firstHeader && !sameFieldMap(pageHeader.fieldMap, firstHeader.fieldMap)) throw new PdfImportError(`The transaction columns change on page ${pageNumber}. Import each account or table layout separately.`);
          if (!firstHeader && pageHeader) {
            const previousMap = matrix.length ? findTransactionHeader([matrix[0]!])?.fieldMap : null;
            if (previousMap && !sameFieldMap(previousMap, pageHeader.fieldMap)) throw new PdfImportError(`The transaction columns change on page ${pageNumber}. Import each account or table layout separately.`);
            firstHeader = pageHeader;
            if (!matrix.length) matrix.push(pageHeader.cells.map(cell => cell.text));
          }
          const detectedTables = tableBatch.pages.find(p => p.num === pageNumber)?.tables ?? [];
          let usedTable = false;
          for (const table of detectedTables) {
            const match = findTransactionHeader(table);
            if (!match) continue;
            if (firstHeader && !sameFieldMap(match.fieldMap, firstHeader.fieldMap)) throw new PdfImportError(`Conflicting transaction tables on page ${pageNumber}. Import the account tables separately.`);
            const previousMap = matrix.length ? findTransactionHeader([matrix[0]!])?.fieldMap : null;
            if (previousMap && !sameFieldMap(previousMap, match.fieldMap)) throw new PdfImportError(`Conflicting transaction tables on page ${pageNumber}. Import the account tables separately.`);
            if (!matrix.length) matrix.push(table[match.index]!);
            for (const values of table.slice(match.index + 1)) {
              if (findTransactionHeader([values])) continue;
              append(values, pageNumber);
            }
            usedTable = true;
          }
          if (usedTable) continue;
          if (!firstHeader) {
            if (matrix.length) throw new PdfImportError(`The transaction layout on page ${pageNumber} could not be verified. Upload a bank CSV/Excel export or a PDF with repeated column headings.`);
            continue; // introductory pages before the first table
          }
          const header = pageHeader ?? firstHeader;
          const centers = header.cells.map(cell => (cell.left + cell.right) / 2);
          for (const line of lines.slice(headerLine >= 0 ? headerLine + 1 : 0)) {
            if (identifyHeader(line)) continue;
            append(valuesForLine(line, centers), pageNumber);
          }
        } finally { page.cleanup(); }
      }
    }
    if (!matrix.length) throw new PdfImportError('Could not find a readable transaction table in this PDF. Include Date, Description, and Amount plus Direction or separate Debit and Credit columns.');
    active();
    return assembleStatement(matrix[0]!, matrix.slice(1).map((original, index) => ({
      original, rowNumber: index + 2, lineNumber: index + 2, pageNumber: sourcePages[index]!,
    })), createHash('sha256').update(bytes).digest('hex'), firstHeader?.fieldMap);
  } catch (failure) {
    active();
    if (failure instanceof PdfImportError || failure instanceof BackendError) throw failure;
    throw pdfReadError(failure);
  } finally {
    signal?.removeEventListener('abort', cancel);
    await Promise.allSettled([loadingTask.destroy(), tables.destroy()]);
  }
}
