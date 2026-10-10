import { z } from 'zod';
import { dateSchema, minorUnitsSchema } from './schemas.ts';

export const MAX_IMPORT_ROWS = 50; // initial prototype guard; host/capacity gate pending
const requiredHeaders = ['date', 'description', 'direction', 'amount'] as const;
export const cashRowSchema = z.strictObject({
  date: dateSchema, description: z.string().min(1).max(2000).refine(value => !!value.trim()),
  direction: z.enum(['in', 'out']), amountMinor: minorUnitsSchema, currency: z.literal('PKR'),
  reference: z.string().max(500).nullable(),
});
export const csvPreviewSchema = z.strictObject({
  currency: z.literal('PKR'), contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  header: z.array(z.enum(['date', 'description', 'direction', 'amount', 'reference'])).min(4).max(5),
  rows: z.array(z.strictObject({
    rowNumber: z.number().int().min(2), lineNumber: z.number().int().min(2),
    original: z.array(z.string()), transaction: cashRowSchema.nullable(),
    errors: z.array(z.strictObject({ field: z.string(), message: z.string() })),
  })).min(1).max(MAX_IMPORT_ROWS),
  validCount: z.number().int().min(0), invalidCount: z.number().int().min(0),
}).superRefine((preview, ctx) => {
  if (new Set(preview.header).size !== preview.header.length || requiredHeaders.some(name => !preview.header.includes(name)) ||
    preview.rows.some((row, index) => row.rowNumber !== index + 2 || (row.transaction !== null) !== (row.errors.length === 0)) ||
    preview.validCount !== preview.rows.filter(row => row.transaction !== null).length ||
    preview.invalidCount !== preview.rows.filter(row => row.transaction === null).length) {
    ctx.addIssue({ code: 'custom', message: 'Preview rows and counts must agree' });
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
