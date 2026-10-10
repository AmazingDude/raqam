import { z } from 'zod';
import { categorySchema, dateSchema } from './schemas.ts';

export const cashSummaryRangeSchema = z.strictObject({
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
}).refine(range => !range.dateFrom || !range.dateTo || range.dateFrom <= range.dateTo, 'Date range is reversed');
export type CashSummaryRange = z.infer<typeof cashSummaryRangeSchema>;

export const transactionReviewSchema = z.strictObject({
  expectedVersion: z.number().int().min(0).max(2147483646),
  description: z.string().min(1).max(2000).refine(value => !!value.trim() && !value.includes('\0')).optional(),
  // An explicit null clears an accepted category and returns it to needs_review.
  category: categorySchema.nullable().optional(),
}).refine(value => value.description !== undefined || value.category !== undefined, 'Provide a reviewed description or category');
export type TransactionReview = z.infer<typeof transactionReviewSchema>;
