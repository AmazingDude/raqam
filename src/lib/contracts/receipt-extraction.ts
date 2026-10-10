import { z } from 'zod';
import { dateSchema, minorUnitsSchema, documentFieldsSchema } from './schemas.ts';

export const receiptIssueSchema = z.enum(['missing_field','unreadable_field','ambiguous_date','currency_unknown','currency_mismatch','amount_invalid','multiple_totals']);
const state = z.enum(['observed','missing','unreadable','ambiguous']);
function observation(name: string, value: z.ZodType, max: number) {
  return z.strictObject({ rawText: z.string().max(max).nullable(), observedCandidates: z.array(z.string().max(2000)).max(5),
    normalizedValue: value.nullable(), state, evidenceField: z.literal(name), issues: z.array(receiptIssueSchema).max(7),
  }).superRefine((field, ctx) => {
    if ((field.state === 'observed') !== (field.normalizedValue !== null) || new Set(field.issues).size !== field.issues.length)
      ctx.addIssue({ code: 'custom', message: 'Observation state and normalized value must agree' });
  });
}
export const receiptEvidenceSchema = z.strictObject({
  sourceId: z.uuid(), sourceVersion: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(['proposed','needs_review']),
  fields: z.strictObject({
    merchant: observation('merchant', z.string().max(2000), 2000),
    documentDate: observation('document_date', dateSchema, 100), total: observation('total', minorUnitsSchema, 200),
    currency: observation('currency', z.string().max(10), 20), reference: observation('reference', z.string().max(500), 500),
  }), blockers: z.array(receiptIssueSchema).max(7),
}).superRefine((evidence, ctx) => {
  const issues = [...new Set(Object.values(evidence.fields).flatMap(field => field.issues))].sort();
  if (JSON.stringify([...evidence.blockers].sort()) !== JSON.stringify(issues) ||
      evidence.status !== (issues.length ? 'needs_review' : 'proposed'))
    ctx.addIssue({ code: 'custom', message: 'Extraction uncertainty and observations must agree' });
});
const version = z.string().trim().min(1).max(200);
export const receiptIdentitySchema = z.strictObject({
  ownerId: z.string().min(1).max(200), workspaceId: z.uuid(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  provider: z.enum(['groq','gemini']), providerVersion: version, modelId: version, promptVersion: version, schemaVersion: version,
  preprocessingVersion: version, cacheKey: z.string().regex(/^[a-f0-9]{64}$/),
});
export const providerFailureReasonSchema = z.enum(['configuration_missing','invalid_request','invalid_model_output','provider_auth',
  'provider_request','provider_blocked','provider_rate_limited','provider_unavailable','provider_timeout','provider_network',
  'deadline_exceeded','cancelled','budget_exhausted','budget_unavailable']);
export const receiptFailureSchema = z.strictObject({ reason: providerFailureReasonSchema,
  retryable: z.boolean(), retryAfterMs: z.number().int().min(0).max(2147483647).nullable(),
});
export const receiptContextSchema = z.strictObject({ identity: receiptIdentitySchema,
  evidence: receiptEvidenceSchema.nullable(), failure: receiptFailureSchema.nullable(),
}).refine(value => (value.evidence === null) !== (value.failure === null), 'A saved extraction is evidence or failure');

export function observedDocumentFields(evidence: z.infer<typeof receiptEvidenceSchema>) {
  return documentFieldsSchema.parse({ counterparty: evidence.fields.merchant.normalizedValue, date: evidence.fields.documentDate.normalizedValue,
    totalMinor: evidence.fields.total.normalizedValue, currency: evidence.fields.currency.normalizedValue, reference: evidence.fields.reference.normalizedValue });
}
export type ReceiptIdentity = z.infer<typeof receiptIdentitySchema>;
export type ReceiptEvidence = z.infer<typeof receiptEvidenceSchema>;
export type ReceiptFailure = z.infer<typeof receiptFailureSchema>;
