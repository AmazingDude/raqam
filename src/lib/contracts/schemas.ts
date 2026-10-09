import { z } from 'zod';
import { CATEGORIES } from './index.ts';
import { assertMinorUnits } from '../server/money.ts';

export function isISODate(value: string): boolean {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const dateSchema = z.string().refine(isISODate, 'Use a valid YYYY-MM-DD date');
export const minorUnitsSchema = z.string().refine(value => {
  try { assertMinorUnits(value); return true; } catch { return false; }
}, 'Use nonnegative integer paisa within Postgres bigint range');
export const reviewStatusSchema = z.enum(['proposed', 'accepted', 'rejected', 'needs_review']);
export const categorySchema = z.enum(CATEGORIES);
export const workspaceInputSchema = z.strictObject({ businessName: z.string().trim().min(1).max(200) });
export const sourceReferenceSchema = z.strictObject({ sourceId: z.string().min(1), rowNumber: z.number().int().min(2).nullable() });
export const transactionSchema = z.strictObject({
  id: z.string().min(1), workspaceId: z.string().min(1), source: sourceReferenceSchema,
  date: dateSchema, originalDescription: z.string().min(1).max(2000), description: z.string().min(1).max(2000),
  direction: z.enum(['in', 'out']), amountMinor: minorUnitsSchema, currency: z.literal('PKR'),
  reference: z.string().max(500).nullable(), category: categorySchema.nullable(),
  categoryStatus: reviewStatusSchema, matchStatus: z.enum(['unmatched', 'proposed', 'accepted']),
}).refine(record => (record.categoryStatus === 'accepted') === (record.category !== null), {
  message: 'Only accepted categories belong on reviewed transactions', path: ['category'],
});
export const documentFieldsSchema = z.strictObject({
  counterparty: z.string().max(2000).nullable(), date: dateSchema.nullable(),
  totalMinor: minorUnitsSchema.nullable(), currency: z.string().max(10).nullable(), reference: z.string().max(500).nullable(),
});
export const categoryProposalSchema = z.strictObject({
  id: z.string().min(1), workspaceId: z.string().min(1), kind: z.literal('category'), transactionId: z.string().min(1),
  category: categorySchema, rationale: z.string().min(1).max(2000), status: reviewStatusSchema,
});
export const matchProposalSchema = z.strictObject({
  id: z.string().min(1), workspaceId: z.string().min(1), kind: z.literal('match'), transactionId: z.string().min(1),
  documentId: z.string().min(1), rationale: z.string().min(1).max(2000), status: reviewStatusSchema,
});

// Raw AI output cannot assign proposal IDs/ownership or claim user acceptance.
export const categorySuggestionSchema = z.strictObject({
  transactionId: z.string().min(1), category: categorySchema,
  rationale: z.string().min(1).max(2000), status: z.enum(['proposed', 'needs_review']),
});
export const matchSuggestionSchema = z.strictObject({
  transactionId: z.string().min(1), documentId: z.string().min(1),
  rationale: z.string().min(1).max(2000), status: z.enum(['proposed', 'needs_review']),
});

// No owner/workspace arguments: scoped execution supplies those from Clerk.
const rangeFields = { dateFrom: dateSchema.optional(), dateTo: dateSchema.optional() };
const validRange = (range: { dateFrom?: string | undefined; dateTo?: string | undefined }): boolean =>
  !range.dateFrom || !range.dateTo || range.dateFrom <= range.dateTo;
export const assistantToolSchemas = {
  list_transactions: z.strictObject({
    ...rangeFields, category: categorySchema.optional(), categoryStatus: reviewStatusSchema.optional(),
    matchStatus: z.enum(['unmatched', 'proposed', 'accepted']).optional(), limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().max(200).optional(),
  }).refine(validRange, 'Date range is reversed'),
  get_cash_summary: z.strictObject({ ...rangeFields, scope: z.literal('valid_imported_cash') }).refine(validRange, 'Date range is reversed'),
  get_review_queue: z.strictObject({
    kind: z.enum(['unreviewed_categories', 'unmatched_records', 'unresolved_document_fields']),
    limit: z.number().int().min(1).max(50).default(20), cursor: z.string().max(200).optional(),
  }),
  get_record_evidence: z.strictObject({
    transactionIds: z.array(z.string().min(1)).max(20).default([]),
    documentIds: z.array(z.string().min(1)).max(20).default([]),
  }).refine(args => args.transactionIds.length + args.documentIds.length > 0 && args.transactionIds.length + args.documentIds.length <= 20,
    'Provide between 1 and 20 record IDs in total'),
} as const;
