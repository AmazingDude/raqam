import { createHash } from 'node:crypto';
import { csvPreviewSchema, importConfirmationSchema, type ImportPlanRow } from '../contracts/imports.ts';
import { previewCsv, MAX_CSV_BYTES, type CsvPreview } from './csv.ts';
import { previewExcel } from './excel.ts';
import { previewPdf } from './pdf.ts';
import { BackendError } from './errors.ts';
import { readRequestBytes } from './http.ts';

function decodeDelimitedText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return new TextDecoder('windows-1252', { fatal: true }).decode(bytes); }
}

export async function readCsvUpload(request: Request) {
  const contentType = request.headers.get('content-type');
  if (!contentType?.startsWith('multipart/form-data;')) throw new BackendError('INVALID_INPUT', 'Upload one CSV, TSV, Excel, or PDF transaction file as multipart form data.');
  const body = await readRequestBytes(request, MAX_CSV_BYTES + 8192);
  let form: FormData;
  try { form = await new Response(new Uint8Array(body), { headers: { 'Content-Type': contentType } }).formData(); }
  catch { throw new BackendError('INVALID_INPUT', 'Invalid multipart upload.'); }
  const file = form.get('file');
  const extension = file instanceof File ? file.name.toLowerCase().split('.').at(-1) : undefined;
  if ([...form.entries()].length !== 1 || !(file instanceof File) || file.size === 0 || file.size > MAX_CSV_BYTES ||
    !['csv', 'tsv', 'xls', 'xlsx', 'pdf'].includes(extension ?? '') || file.name.length > 255 || file.name.includes('\0')) {
    throw new BackendError('INVALID_INPUT', 'Choose one .csv, .tsv, .xls, .xlsx, or .pdf transaction file up to 1 MiB.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let preview: CsvPreview;
  try {
    if (extension === 'csv' || extension === 'tsv') {
      const text = decodeDelimitedText(bytes);
      if (text.includes('\0')) throw new Error('This file contains a character that cannot be stored in the transaction source.');
      preview = csvPreviewSchema.parse(previewCsv(text, createHash('sha256').update(bytes).digest('hex')));
    } else if (extension === 'xls' || extension === 'xlsx') preview = csvPreviewSchema.parse(previewExcel(bytes));
    else preview = csvPreviewSchema.parse(await previewPdf(bytes));
  } catch (failure) {
    const message = failure instanceof Error && failure.name !== 'ZodError'
      ? failure.message
      : 'The transaction columns could not be mapped. Use a supported bank export or download the Raqam template.';
    throw new BackendError('INVALID_INPUT', message);
  }
  if (preview.contentHash !== createHash('sha256').update(bytes).digest('hex')) throw new BackendError('INVALID_INPUT', 'The original transaction file could not be verified.');
  return { bytes, originalName: file.name, extension, preview };
}

export function buildImportPlan(previewInput: unknown, decisionsInput: unknown): ImportPlanRow[] {
  const preview = csvPreviewSchema.safeParse(previewInput);
  const decisions = importConfirmationSchema.safeParse(decisionsInput);
  if (!preview.success || !decisions.success) throw new BackendError('INVALID_INPUT', 'Provide valid row corrections or rejections.');
  const byRow = new Map(decisions.data.rows.map(row => [row.rowNumber, row]));
  if ([...byRow.keys()].some(number => !preview.data.rows.some(row => row.rowNumber === number))) {
    throw new BackendError('INVALID_INPUT', 'A decision refers to a row outside this import.');
  }
  return preview.data.rows.map(row => {
    const decision = byRow.get(row.rowNumber);
    if (decision?.action === 'reject') return { rowNumber: row.rowNumber, action: 'reject', transaction: null };
    if (decision?.action === 'correct') return { rowNumber: row.rowNumber, action: 'correct', transaction: decision.transaction };
    return row.transaction
      ? { rowNumber: row.rowNumber, action: 'import', transaction: row.transaction }
      : { rowNumber: row.rowNumber, action: 'unresolved', transaction: null };
  });
}
