import 'server-only';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { findTransactionHeader, previewSpreadsheetRows, type CsvPreview, type ImportFieldMap } from './csv.ts';

const packageRequire = createRequire(`${process.cwd()}/package.json`);
const STANDARD_FONTS_PATH = `${resolve(dirname(packageRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs')), '../../standard_fonts').replace(/[\\/]$/, '')}/`;
const MAX_PDF_PAGES = 10;
const MAX_PDF_TEXT_ITEMS = 20_000;
const MAX_PDF_TEXT_CHARACTERS = 200_000;
const HEADER_SCAN_LINES = 30;

type PositionedText = { text: string; x: number; y: number; width: number; height: number };
type PdfLine = { y: number; items: PositionedText[] };
type PdfCell = { text: string; left: number; right: number };
type HeaderLayout = { page: number; line: number; cells: PdfCell[]; fieldMap: ImportFieldMap };
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
  return match ? { page: -1, line: -1, cells, fieldMap: match.fieldMap } : null;
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

function pdfReadError(failure: unknown): PdfImportError {
  const name = failure && typeof failure === 'object' && 'name' in failure ? String(failure.name) : '';
  const message = failure instanceof Error ? failure.message : '';
  if (name === 'PasswordException' || /password/i.test(message)) return new PdfImportError('This PDF is password-protected. Save an unlocked copy and upload it again.');
  return new PdfImportError('This PDF could not be read. Save a valid, unlocked PDF copy and try again.');
}

export async function previewPdf(bytes: Uint8Array): Promise<CsvPreview> {
  if (!hasPdfSignature(bytes)) throw new PdfImportError('This file is not a readable PDF. Choose a PDF account statement.');

  const loadingTask = getDocument({
    // PDF.js may transfer and detach typed-array input to its worker; keep the original upload intact.
    data: bytes.slice(), stopAtErrors: true, disableAutoFetch: true, enableXfa: false, standardFontDataUrl: STANDARD_FONTS_PATH,
  });
  let document: Awaited<typeof loadingTask.promise>;
  try {
    document = await loadingTask.promise;
  } catch (failure) {
    await loadingTask.destroy().catch(() => undefined);
    throw pdfReadError(failure);
  }

  let matrix: string[][];
  try {
    if (document.numPages < 1 || document.numPages > MAX_PDF_PAGES) {
      throw new PdfImportError(`PDF statements must have 1-${MAX_PDF_PAGES} pages.`);
    }

    const pages: PdfLine[][] = [];
    let itemCount = 0, characterCount = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
        itemCount += content.items.length;
        const positioned = positionTextItems(content.items);
        characterCount += positioned.reduce((sum, item) => sum + item.text.length, 0);
        if (itemCount > MAX_PDF_TEXT_ITEMS || characterCount > MAX_PDF_TEXT_CHARACTERS) {
          throw new PdfImportError('This PDF has too much text to preview. Save a smaller statement copy and try again.');
        }
        pages.push(groupLines(positioned));
      } finally {
        page.cleanup();
      }
    }

    const headers: HeaderLayout[] = [];
    pages.forEach((pageLines, pageIndex) => {
      pageLines.slice(0, HEADER_SCAN_LINES).forEach((line, lineIndex) => {
        const header = identifyHeader(line);
        if (header) headers.push({ ...header, page: pageIndex, line: lineIndex });
      });
    });
    const firstHeader = headers[0];
    if (!firstHeader) {
      if (itemCount === 0 || characterCount === 0) {
        throw new PdfImportError('This PDF has no selectable transaction text. Scanned or image-only statements need OCR; upload a text-based PDF, CSV, or Excel file.');
      }
      throw new PdfImportError('Could not find a readable transaction table in this PDF. Include Date, Description, and Amount plus Direction or separate Debit and Credit columns.');
    }

    const headerValues = firstHeader.cells.map(cell => cell.text);
    const centersFor = (header: HeaderLayout): number[] => header.cells.map(cell => (cell.left + cell.right) / 2);
    matrix = [headerValues];
    for (let pageIndex = firstHeader.page; pageIndex < pages.length; pageIndex++) {
      const pageLines = pages[pageIndex]!;
      const repeatedHeader = headers.find(header => header.page === pageIndex && header.line >= (pageIndex === firstHeader.page ? firstHeader.line : 0) &&
        sameFieldMap(header.fieldMap, firstHeader.fieldMap));
      const header = repeatedHeader ?? firstHeader;
      const firstLine = pageIndex === firstHeader.page ? firstHeader.line + 1 : repeatedHeader ? repeatedHeader.line + 1 : 0;
      const centers = centersFor(header);
      for (let lineIndex = firstLine; lineIndex < pageLines.length; lineIndex++) {
        const line = pageLines[lineIndex]!;
        if (lineIndex < HEADER_SCAN_LINES && identifyHeader(line)) continue;
        if (line.items.length) matrix.push(valuesForLine(line, centers));
      }
    }
  } catch (failure) {
    if (failure instanceof PdfImportError) throw failure;
    throw pdfReadError(failure);
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }

  return previewSpreadsheetRows(matrix, bytes);
}
