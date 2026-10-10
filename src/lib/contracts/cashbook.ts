import { z } from 'zod';
import { categorySchema } from './schemas.ts';

export const transactionReviewSchema = z.strictObject({
  expectedVersion: z.number().int().min(0).max(2147483646),
  description: z.string().min(1).max(2000).refine(value => !!value.trim() && !value.includes('\0')).optional(),
  // An explicit null clears an accepted category and returns it to needs_review.
  category: categorySchema.nullable().optional(),
}).refine(value => value.description !== undefined || value.category !== undefined, 'Provide a reviewed description or category');
export type TransactionReview = z.infer<typeof transactionReviewSchema>;
