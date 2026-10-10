import { z } from 'zod';
import { dateSchema, minorUnitsSchema } from './schemas.ts';

import { MAX_IMPORT_ROWS, MAX_PDF_BYTES, MAX_PDF_PAGES } from './limits.ts';
export { MAX_IMPORT_ROWS } from './limits.ts';
const uuidPathSegment = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
export const importUploadPathSchema = z.string().regex(new RegExp(`^${uuidPathSegment}/imports/${uuidPathSegment}\\.(?:csv|tsv|xls|xlsx|pdf)$`, 'i'));
export const importUploadFileNameSchema = z.string().min(1).max(255).refine(name => !/[\\/\\\\\\0]/.test(name));
export const importUploadIntentRequestSchema = z.strictObject({
  name: importUploadFileNameSchema, size: z.number().int().min(1).max(MAX_PDF_BYTES),
});
export const importUploadIntentSchema = z.strictObject({ path: importUploadPathSchema, signedUrl: z.url() });
export const importFinalizeUploadSchema = z.strictObject({ path: importUploadPathSchema, name: importUploadFileNameSchema });
const requiredHeaders = ['date', 'description', 'direction', 'amount'] as const;
export const pdfSourceLineSchema = z.strictObject({
  rowNumber: z.number().int().min(2), lineNumber: z.number().int().min(2),
  pageNumber: z.number().int().min(1).max(MAX_PDF_PAGES).optional(), original: z.array(z.string()),
});
export const statementPreviewSchema = z.strictObject({
  parserVersion: z.literal('logical-rows-v1'), sourceLineCount: z.number().int().nonnegative(),
  mergedLineCount: z.number().int().nonnegative(),
  metadata: z.array(pdfSourceLineSchema.extend({ kind: z.enum(['balance', 'footer']) })),
  balances: z.strictObject({ checked: z.number().int().nonnegative(), matched: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(), mismatchRows: z.array(z.number().int().min(2)) }),
});
export type StatementPreview = z.infer<typeof statementPreviewSchema>;
export type PdfSourceLine = z.infer<typeof pdfSourceLineSchema>;
export const importFieldMapSchema = z.strictObject({
  date: z.number().int().min(0), description: z.number().int().min(0),
  direction: z.number().int().min(0).nullable(), amount: z.number().int().min(0).nullable(),
  debit: z.number().int().min(0).nullable(), credit: z.number().int().min(0).nullable(),
  reference: z.number().int().min(0).nullable(), currency: z.number().int().min(0).nullable(),
});
export const importDraftFieldsSchema = z.strictObject({
  date: z.string(), description: z.string(), direction: z.string(), amount: z.string(), reference: z.string(),
});
export const cashRowSchema = z.strictObject({
  date: dateSchema, description: z.string().min(1).max(2000).refine(value => !!value.trim()),
  direction: z.enum(['in', 'out']), amountMinor: minorUnitsSchema, currency: z.literal('PKR'),
  reference: z.string().max(500).nullable(),
});
export const csvPreviewSchema = z.strictObject({
  currency: z.literal('PKR'), contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  // New previews preserve the source's raw header and row order. Older stored previews
  // still use the canonical header and omit fieldMap/draftFields.
  header: z.array(z.string().max(200)).min(4).max(100),
  fieldMap: importFieldMapSchema.optional(),
  statement: statementPreviewSchema.optional(),
  rows: z.array(z.strictObject({
    rowNumber: z.number().int().min(2), lineNumber: z.number().int().min(2),
    pageNumber: z.number().int().min(1).max(MAX_PDF_PAGES).optional(),
    original: z.array(z.string()), transaction: cashRowSchema.nullable(),
    errors: z.array(z.strictObject({ field: z.string(), message: z.string() })),
    draftFields: importDraftFieldsSchema.optional(),
    sourceLines: z.array(pdfSourceLineSchema).optional(),
  })).min(1).max(MAX_IMPORT_ROWS),
  validCount: z.number().int().min(0), invalidCount: z.number().int().min(0),
}).superRefine((preview, ctx) => {
  const legacyHeaderValid = new Set(preview.header).size === preview.header.length && requiredHeaders.every(name => preview.header.includes(name));
  const fieldMapValid = !!preview.fieldMap && preview.fieldMap.date < preview.header.length && preview.fieldMap.description < preview.header.length &&
    (preview.fieldMap.amount !== null || (preview.fieldMap.debit !== null && preview.fieldMap.credit !== null)) &&
    [preview.fieldMap.direction, preview.fieldMap.amount, preview.fieldMap.debit, preview.fieldMap.credit, preview.fieldMap.reference, preview.fieldMap.currency]
      .every(index => index === null || index < preview.header.length);
  if ((!legacyHeaderValid && !fieldMapValid) ||
    (preview.fieldMap !== undefined && !fieldMapValid) ||
    preview.rows.some((row, index) => row.rowNumber <= (preview.rows[index - 1]?.rowNumber ?? 1) ||
      (row.transaction !== null) !== (row.errors.length === 0) || (preview.fieldMap && row.original.length !== preview.header.length)) ||
    preview.validCount !== preview.rows.filter(row => row.transaction !== null).length ||
    preview.invalidCount !== preview.rows.filter(row => row.transaction === null).length) {
    ctx.addIssue({ code: 'custom', message: 'Preview rows and counts must agree' });
  }
  if (preview.statement) {
    const lines = [...preview.rows.flatMap(row => row.sourceLines ?? []), ...preview.statement.metadata];
    const check = preview.statement.balances;
    const rowsByNumber = new Map(preview.rows.map(row => [row.rowNumber, row]));
    if (preview.rows.some(row => !row.sourceLines?.length || row.sourceLines[0]?.rowNumber !== row.rowNumber) ||
      lines.length !== preview.statement.sourceLineCount || new Set(lines.map(line => line.rowNumber)).size !== lines.length ||
      preview.statement.mergedLineCount !== preview.rows.reduce((sum, row) => sum + (row.sourceLines?.length ?? 1) - 1, 0) ||
      check.checked + check.unavailable !== preview.rows.length || check.matched + check.mismatchRows.length !== check.checked ||
      new Set(check.mismatchRows).size !== check.mismatchRows.length ||
      check.mismatchRows.some(number => { const row = rowsByNumber.get(number); return !row || row.transaction !== null || !row.errors.some(error => error.field === 'balance'); }))
      ctx.addIssue({ code: 'custom', message: 'Statement source coverage and balance checks must agree' });
  }
});

export const importConfirmationSchema = z.strictObject({
  // Omitted rows keep their preview interpretation; invalid rows stay unresolved.
  rows: z.array(z.discriminatedUnion('action', [
    z.strictObject({ rowNumber: z.number().int().min(2), action: z.literal('correct'), transaction: cashRowSchema }),
    z.strictObject({ rowNumber: z.number().int().min(2), action: z.literal('reject') }),
  ])).max(MAX_IMPORT_ROWS).default([]),
}).refine(input => new Set(input.rows.map(row => row.rowNumber)).size === input.rows.length, 'A row can have only one decision');

export const importPlanRowSchema = z.discriminatedUnion('action', [
  z.strictObject({ rowNumber: z.number().int().min(2), action: z.enum(['import', 'correct']), transaction: cashRowSchema }),
  z.strictObject({ rowNumber: z.number().int().min(2), action: z.enum(['reject', 'unresolved']), transaction: z.null() }),
]);
export const importConfirmationResultSchema = z.strictObject({
  importId: z.uuid(), importedCount: z.number().int().min(0), rejectedCount: z.number().int().min(0),
  unresolvedCount: z.number().int().min(0), duplicate: z.boolean(),
});
export type ImportConfirmation = z.infer<typeof importConfirmationSchema>;
export const importRecoverySchema = z.strictObject({
  preview: csvPreviewSchema, decisions: importConfirmationSchema.shape.rows,
});
export type ImportPlanRow = z.infer<typeof importPlanRowSchema>;

// Subsequent corrections only resolve rows left unresolved by confirmation.
// A request ID is stable for retries; a different decision needs a new request ID.
export const importResolutionSchema = z.strictObject({
  requestId: z.uuid(),
  rows: importConfirmationSchema.shape.rows.unwrap().min(1),
}).refine(input => new Set(input.rows.map(row => row.rowNumber)).size === input.rows.length,
  'A row can have only one resolution');
export const importResolutionResultSchema = z.strictObject({
  importId: z.uuid(), requestId: z.uuid(), correctedCount: z.number().int().min(0),
  rejectedCount: z.number().int().min(0), remainingUnresolvedCount: z.number().int().min(0),
  transactionIds: z.array(z.uuid()).max(MAX_IMPORT_ROWS), duplicate: z.boolean(),
}).refine(result => result.transactionIds.length === result.correctedCount, 'Corrected count must match created cash records');
export const importResolutionStateSchema = z.strictObject({
  importId: z.uuid(),
  rows: z.array(z.strictObject({
    rowNumber: z.number().int().min(2), outcome: z.enum(['imported', 'rejected', 'unresolved']),
    transactionId: z.uuid().nullable(),
  })).min(1).max(MAX_IMPORT_ROWS),
  importedCount: z.number().int().min(0), rejectedCount: z.number().int().min(0), unresolvedCount: z.number().int().min(0),
}).refine(state => new Set(state.rows.map(row => row.rowNumber)).size === state.rows.length &&
  state.rows.every(row => (row.outcome === 'imported') === (row.transactionId !== null)) &&
  state.importedCount === state.rows.filter(row => row.outcome === 'imported').length &&
  state.rejectedCount === state.rows.filter(row => row.outcome === 'rejected').length &&
  state.unresolvedCount === state.rows.filter(row => row.outcome === 'unresolved').length,
  'Resolution rows, counts and cash references must agree');
export type ImportResolution = z.infer<typeof importResolutionSchema>;
