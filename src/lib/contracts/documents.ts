import { z } from 'zod';
import { dateSchema, documentFieldsSchema, minorUnitsSchema, reviewStatusSchema } from './schemas.ts';

export const recordIdSchema = z.uuid();
export const requestIdSchema = z.uuid();
export const reviewVersionSchema = z.number().int().min(0).max(2147483647);
const versionNameSchema = z.string().trim().min(1).max(200);
export const modelProvenanceSchema = z.strictObject({
  modelVersion: versionNameSchema, promptVersion: versionNameSchema, schemaVersion: versionNameSchema,
});

// User-confirmed review policy: unknown merchant/reference are allowed; currency is explicit.
export const acceptedDocumentFieldsSchema = documentFieldsSchema.extend({
  date: dateSchema, totalMinor: minorUnitsSchema, currency: z.literal('PKR'),
});
export const documentRegistrationSchema = z.strictObject({ sourceId: recordIdSchema });
export const documentExtractionRequestSchema = z.strictObject({
  requestId: requestIdSchema, expectedVersion: reviewVersionSchema,
});
export const extractionFailureSchema = z.enum([
  'provider_timeout', 'provider_rate_limited', 'provider_unavailable', 'invalid_model_output', 'unreadable_source',
]);
export const documentExtractionOutcomeSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('complete'), fields: documentFieldsSchema, provenance: modelProvenanceSchema }),
  z.strictObject({ status: z.literal('failed'), reason: extractionFailureSchema }),
]);
// Internal A2 persistence boundary, never a public request accepting model output from the browser.
export const documentExtractionSaveSchema = documentExtractionRequestSchema.extend({ outcome: documentExtractionOutcomeSchema });
export const documentReviewSchema = z.discriminatedUnion('action', [
  z.strictObject({ requestId: requestIdSchema, expectedVersion: reviewVersionSchema, action: z.literal('accept'), fields: acceptedDocumentFieldsSchema }),
  z.strictObject({ requestId: requestIdSchema, expectedVersion: reviewVersionSchema, action: z.literal('correct'), fields: documentFieldsSchema }),
  z.strictObject({ requestId: requestIdSchema, expectedVersion: reviewVersionSchema, action: z.literal('reject') }),
]);
export const documentRecordSchema = z.strictObject({
  document: z.strictObject({
    id: recordIdSchema, workspaceId: recordIdSchema,
    source: z.strictObject({ sourceId: recordIdSchema, rowNumber: z.null() }),
    extractedFields: documentFieldsSchema, correctedFields: documentFieldsSchema.nullable(),
    extractionStatus: z.enum(['pending', 'complete', 'failed']), reviewStatus: reviewStatusSchema,
    modelVersion: versionNameSchema.nullable(), promptVersion: versionNameSchema.nullable(),
  }),
  reviewVersion: reviewVersionSchema, schemaVersion: versionNameSchema.nullable(),
  extractionFailure: extractionFailureSchema.nullable(),
}).superRefine((record, ctx) => {
  const complete = record.document.extractionStatus === 'complete';
  if ((record.document.extractionStatus === 'failed') !== (record.extractionFailure !== null) ||
      (complete && (!record.document.modelVersion || !record.document.promptVersion || !record.schemaVersion)) ||
      (record.document.reviewStatus === 'accepted' && !acceptedDocumentFieldsSchema.safeParse(record.document.correctedFields ?? record.document.extractedFields).success)) {
    ctx.addIssue({ code: 'custom', message: 'Document state, provenance and reviewed financial fields must agree' });
  }
});
export const documentRegistrationResultSchema = z.strictObject({ record: documentRecordSchema, duplicate: z.boolean() });
export const documentMutationResultSchema = z.strictObject({ requestId: requestIdSchema, record: documentRecordSchema, duplicate: z.boolean() });
export const extractionReservationResultSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('reserved'), requestId: requestIdSchema, expiresAt: z.iso.datetime({ offset: true }) }),
  z.strictObject({ state: z.literal('busy'), requestId: requestIdSchema, expiresAt: z.iso.datetime({ offset: true }) }),
  z.strictObject({ state: z.literal('cached'), requestId: requestIdSchema, record: documentRecordSchema }),
]);

export type DocumentRecord = z.infer<typeof documentRecordSchema>;
export type DocumentReviewCommand = z.infer<typeof documentReviewSchema>;
export type DocumentExtractionOutcome = z.infer<typeof documentExtractionOutcomeSchema>;
