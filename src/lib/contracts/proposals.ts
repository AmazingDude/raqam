import { z } from 'zod';
import { categorySchema, categorySuggestionSchema, matchSuggestionSchema, reviewStatusSchema } from './schemas.ts';
import { modelProvenanceSchema, recordIdSchema, requestIdSchema, reviewVersionSchema } from './documents.ts';

export const categoryGenerationRequestSchema = z.strictObject({
  requestId: requestIdSchema, transactionIds: z.array(recordIdSchema).min(1).max(50),
}).refine(value => new Set(value.transactionIds).size === value.transactionIds.length, 'Transaction IDs must be unique');
export const matchGenerationRequestSchema = z.strictObject({ requestId: requestIdSchema, documentId: recordIdSchema });
export const categoryPersistenceSchema = z.strictObject({
  requestId: requestIdSchema, provenance: modelProvenanceSchema,
  proposals: z.array(categorySuggestionSchema.extend({ transactionId: recordIdSchema, transactionVersion: reviewVersionSchema })).min(1).max(50),
}).refine(value => new Set(value.proposals.map(item => item.transactionId)).size === value.proposals.length, 'One suggestion per transaction');
export const matchPersistenceSchema = z.strictObject({
  requestId: requestIdSchema, provenance: modelProvenanceSchema,
  proposals: z.array(matchSuggestionSchema.extend({
    transactionId: recordIdSchema, documentId: recordIdSchema,
    transactionVersion: reviewVersionSchema, documentVersion: reviewVersionSchema,
  })).min(1).max(50),
}).refine(value => new Set(value.proposals.map(item => `${item.transactionId}:${item.documentId}`)).size === value.proposals.length,
  'Candidate pairs must be unique');
export const proposalRecordSchema = z.strictObject({
  id: recordIdSchema, workspaceId: recordIdSchema, transactionId: recordIdSchema,
  transactionVersion: reviewVersionSchema, reviewVersion: reviewVersionSchema,
  rationale: z.string().trim().min(1).max(2000), status: reviewStatusSchema, provenance: modelProvenanceSchema,
  suggestion: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('category'), category: categorySchema }),
    z.strictObject({ kind: z.literal('match'), documentId: recordIdSchema, documentVersion: reviewVersionSchema }),
  ]),
});
export const proposalBatchResultSchema = z.strictObject({
  // An empty result is valid when every requested record is already reviewed
  // or already has an open proposal. In that case no new AI call is needed.
  requestId: requestIdSchema, items: z.array(proposalRecordSchema).max(50), duplicate: z.boolean(),
}).refine(value => new Set(value.items.map(item => item.id)).size === value.items.length, 'Proposal IDs must be unique');

const reviewBase = { requestId: requestIdSchema, proposalId: recordIdSchema, expectedVersion: reviewVersionSchema };
export const proposalReviewSchema = z.discriminatedUnion('decision', [
  z.strictObject({ ...reviewBase, decision: z.literal('accept') }),
  z.strictObject({ ...reviewBase, decision: z.literal('reject') }),
  z.strictObject({ ...reviewBase, decision: z.literal('correct_category'), category: categorySchema }),
  z.strictObject({ ...reviewBase, decision: z.literal('correct_match'), transactionId: recordIdSchema, transactionVersion: reviewVersionSchema }),
]);
export const acceptedMatchSchema = z.strictObject({
  id: recordIdSchema, workspaceId: recordIdSchema, transactionId: recordIdSchema,
  documentId: recordIdSchema, reviewDecisionId: recordIdSchema,
});
export const proposalReviewResultSchema = z.strictObject({
  requestId: requestIdSchema, proposal: proposalRecordSchema, reviewDecisionId: recordIdSchema,
  affectedTransactionIds: z.array(recordIdSchema).max(2), match: acceptedMatchSchema.nullable(), duplicate: z.boolean(),
}).superRefine((value, ctx) => {
  if (new Set(value.affectedTransactionIds).size !== value.affectedTransactionIds.length ||
      ((value.proposal.status === 'accepted' && value.proposal.suggestion.kind === 'match') !== (value.match !== null)) ||
      (value.match !== null && (value.proposal.suggestion.kind !== 'match' || value.proposal.status !== 'accepted' ||
        value.match.workspaceId !== value.proposal.workspaceId || value.match.documentId !== value.proposal.suggestion.documentId ||
        value.match.transactionId !== value.proposal.transactionId))) {
    ctx.addIssue({ code: 'custom', message: 'Reviewed proposal and allocation must agree' });
  }
});
export const proposalReviewHistoryItemSchema = z.strictObject({
  id: recordIdSchema, workspaceId: recordIdSchema, targetId: recordIdSchema, actorSubject: z.string().min(1),
  decision: z.record(z.string(), z.unknown()), previous: proposalRecordSchema, current: proposalRecordSchema,
  reviewVersion: reviewVersionSchema.refine(version => version > 0), createdAt: z.string().min(1),
});

export type ProposalRecord = z.infer<typeof proposalRecordSchema>;
export type CategoryGenerationRequest = z.infer<typeof categoryGenerationRequestSchema>;
export type MatchGenerationRequest = z.infer<typeof matchGenerationRequestSchema>;
export type ProposalReviewCommand = z.infer<typeof proposalReviewSchema>;
export type ProposalReviewResult = z.infer<typeof proposalReviewResultSchema>;
