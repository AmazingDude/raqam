import { z } from 'zod';
import { sourceReferenceSchema, transactionSchema } from './schemas.ts';

export const assistantRequestSchema = z.strictObject({ question: z.string().trim().min(1).max(1000) });
export const assistantCitationSchema = z.strictObject({
  kind: z.enum(['transaction', 'document']), id: z.string().min(1), source: sourceReferenceSchema,
});
export const assistantResponseSchema = z.strictObject({
  workspaceId: z.string().min(1), question: z.string().min(1).max(1000), text: z.string().max(12000),
  records: z.array(transactionSchema).max(50), citations: z.array(assistantCitationSchema).max(200),
  actionTrail: z.array(z.strictObject({
    tool: z.enum(['list_transactions', 'get_cash_summary', 'get_review_queue', 'get_record_evidence']),
    recordsConsulted: z.number().int().nonnegative(), partial: z.boolean(),
  })).max(4), partial: z.boolean(),
});
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;
