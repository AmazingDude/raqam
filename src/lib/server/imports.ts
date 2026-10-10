import { createHash } from 'node:crypto';
import { csvPreviewSchema, importConfirmationSchema, type ImportPlanRow } from '../contracts/imports.ts';
import { previewCsv, MAX_CSV_BYTES, type CsvPreview } from './csv.ts';
import { BackendError } from './errors.ts';
import { readRequestBytes } from './http.ts';

export async function readCsvUpload(request: Request) {
  const contentType = request.headers.get('content-type');
  if (!contentType?.startsWith('multipart/form-data;')) throw new BackendError('INVALID_INPUT', 'Upload one CSV file as multipart form data.');
  const body = await readRequestBytes(request, MAX_CSV_BYTES + 8192);
  let form: FormData;
  try { form = await new Response(new Uint8Array(body), { headers: { 'Content-Type': contentType } }).formData(); }
  catch { throw new BackendError('INVALID_INPUT', 'Invalid multipart upload.'); }
  const file = form.get('file');
  if ([...form.entries()].length !== 1 || !(file instanceof File) || file.size === 0 || file.size > MAX_CSV_BYTES ||
    !file.name.toLowerCase().endsWith('.csv') || file.name.length > 255 || file.name.includes('\0')) {
    throw new BackendError('INVALID_INPUT', 'Provide one .csv file named file, up to 1 MiB.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let preview: CsvPreview;
  try {
    // Retain a BOM in text for byte-exact hashing; the CSV parser removes it only for parsing.
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.includes('\0')) throw new Error('NUL cannot be stored as PostgreSQL text');
    preview = csvPreviewSchema.parse(previewCsv(text));
  } catch { throw new BackendError('INVALID_INPUT', 'Use the UTF-8 PKR CSV template with 1–50 rows. Correct malformed CSV before uploading.'); }
  if (preview.contentHash !== createHash('sha256').update(bytes).digest('hex')) throw new BackendError('INVALID_INPUT', 'CSV encoding could not be preserved.');
  return { bytes, originalName: file.name, preview };
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
