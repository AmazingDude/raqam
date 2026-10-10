import 'server-only';
import { z } from 'zod';
import type { Transaction } from '../contracts/index.ts';
import { CATEGORIES } from '../contracts/index.ts';
import { categorySuggestionSchema, sourceReferenceSchema, transactionSchema } from '../contracts/schemas.ts';
import { reviewVersionSchema, recordIdSchema } from '../contracts/documents.ts';
import { validateCashbook } from '../server/summary.ts';
import type { GroqProvider, ProviderContext, ProviderFailureReason, ProviderMetadata } from './provider.ts';
import { VERSION_PATTERN } from './config.ts';
import { CATEGORY_GUIDE_VERSION, CATEGORY_PROMPT, CATEGORY_PROMPT_VERSION, CATEGORY_SCHEMA_VERSION } from './prompts/categories.ts';

const transactionSnapshotSchema = z.strictObject({
  transaction: transactionSchema.safeExtend({ id: recordIdSchema, workspaceId: recordIdSchema }),
  reviewVersion: reviewVersionSchema,
});
const inputSchema = z.strictObject({
  workspaceId: recordIdSchema,
  records: z.array(transactionSnapshotSchema).min(1).max(50),
}).superRefine((input, ctx) => {
  if (input.records.some(({ transaction }) => transaction.workspaceId !== input.workspaceId)) {
    ctx.addIssue({ code: 'custom', message: 'Transaction is outside the requested workspace', path: ['records'] });
  }
  if (new Set(input.records.map(({ transaction }) => transaction.id)).size !== input.records.length) {
    ctx.addIssue({ code: 'custom', message: 'Transaction IDs must be unique', path: ['records'] });
  }
});

const modelSuggestionSchema = categorySuggestionSchema.extend({ assessment: z.enum(['clear', 'ambiguous']) });
const modelBatchSchema = z.strictObject({ suggestions: z.array(modelSuggestionSchema).max(50) });
const providerMetadataSchema = z.strictObject({
  requestId: z.string().max(128).nullable(), mode: z.enum(['image', 'text', 'tool']), model: z.string().max(200).nullable(),
  providerVersion: z.string().min(1).max(200), promptVersion: z.string().nullable(), schemaVersion: z.string().nullable(),
  attempts: z.number().int().min(0).max(2), durationMs: z.number().finite().min(0),
  providerRequestIds: z.array(z.string().max(120)).max(2),
  usage: z.strictObject({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative() }).nullable(),
});
const providerFailureReasonSchema = z.enum([
  'configuration_missing', 'invalid_request', 'invalid_model_output', 'provider_auth', 'provider_request',
  'provider_blocked', 'provider_rate_limited', 'provider_unavailable', 'provider_timeout', 'provider_network',
  'deadline_exceeded', 'cancelled', 'budget_exhausted', 'budget_unavailable',
]);
const providerResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), output: z.unknown(), metadata: providerMetadataSchema }),
  z.strictObject({ ok: z.literal(false), error: z.strictObject({
    code: z.enum(['UNAUTHENTICATED', 'NOT_FOUND', 'INVALID_INPUT', 'CONFLICT', 'UNAVAILABLE']),
    reason: providerFailureReasonSchema, message: z.string().max(2000), retryable: z.boolean(), retryAfterMs: z.number().finite().nonnegative().nullable(),
  }), metadata: providerMetadataSchema }),
]);
const provenanceSchema = z.strictObject({
  providerVersion: z.string().min(1).max(200), modelVersion: z.string().min(1).max(200),
  promptVersion: z.string().regex(VERSION_PATTERN), schemaVersion: z.string().regex(VERSION_PATTERN),
  categoryGuideVersion: z.string().regex(VERSION_PATTERN),
});
const proposalItemSchema = z.strictObject({
  transactionId: recordIdSchema, transactionVersion: reviewVersionSchema,
  category: z.enum(CATEGORIES), status: z.enum(['proposed', 'needs_review']), rationale: z.string().trim().min(1).max(2000),
  evidence: z.strictObject({ transactionId: recordIdSchema, source: sourceReferenceSchema }),
  categoryGuideVersion: z.string().regex(VERSION_PATTERN),
});
const skippedItemSchema = z.strictObject({
  transactionId: recordIdSchema, transactionVersion: reviewVersionSchema,
  status: z.literal('skipped'), reason: z.literal('accepted_category'),
});

export interface CategoryTransactionSnapshot {
  transaction: Transaction;
  reviewVersion: number;
}
export interface CategoryBatchInput {
  workspaceId: string;
  records: readonly CategoryTransactionSnapshot[];
}
export type CategoryProposalItem = z.infer<typeof proposalItemSchema> | z.infer<typeof skippedItemSchema>;
export type CategoryBatchResult =
  | { ok: true; items: CategoryProposalItem[]; provenance: z.infer<typeof provenanceSchema> | null; metadata: ProviderMetadata | null }
  | { ok: false; error: { reason: 'invalid_input' | 'invalid_model_output' | ProviderFailureReason; message: string; retryable: boolean; retryAfterMs: number | null }; metadata: ProviderMetadata | null };

function failed(reason: 'invalid_input' | 'invalid_model_output' | ProviderFailureReason, metadata: ProviderMetadata | null = null,
  retryable = false, retryAfterMs: number | null = null): CategoryBatchResult {
  return { ok: false, error: {
    reason, message: reason === 'invalid_input' ? 'Check the transaction snapshots and try again.' :
      'Category preparation could not be verified. Keep the existing cashbook and try again when ready.', retryable, retryAfterMs,
  }, metadata };
}

function validatedMetadata(metadata: ProviderMetadata): boolean {
  return metadata.mode === 'text' && typeof metadata.model === 'string' && metadata.model.length > 0 &&
    metadata.promptVersion === CATEGORY_PROMPT_VERSION && metadata.schemaVersion === CATEGORY_SCHEMA_VERSION && metadata.attempts > 0;
}

function promptFor(records: readonly CategoryTransactionSnapshot[]): string {
  const payload = records.map(({ transaction, reviewVersion }) => ({
    transactionId: transaction.id, transactionVersion: reviewVersion, date: transaction.date,
    originalDescription: transaction.originalDescription, reviewedDescription: transaction.description,
    direction: transaction.direction, amountMinor: transaction.amountMinor, currency: transaction.currency,
    reference: transaction.reference, evidence: { transactionId: transaction.id, source: transaction.source },
  }));
  return `${CATEGORY_PROMPT}\n\nSnapshots (JSON data):\n${JSON.stringify(payload)}`;
}

/** Proposes guide-constrained categories. It never mutates or persists a transaction. */
export async function proposeCategories(input: CategoryBatchInput, provider: GroqProvider,
  context: ProviderContext): Promise<CategoryBatchResult> {
  let parsed: z.infer<typeof inputSchema>;
  try {
    parsed = inputSchema.parse(input);
    const rows = validateCashbook(parsed.records.map(record => record.transaction), parsed.workspaceId);
    if (rows.length !== parsed.records.length) return failed('invalid_input');
  } catch { return failed('invalid_input'); }

  const snapshots = new Map(parsed.records.map(record => [record.transaction.id, record]));
  const eligible = parsed.records.filter(record => record.transaction.categoryStatus !== 'accepted');
  const skipped: CategoryProposalItem[] = parsed.records.filter(record => record.transaction.categoryStatus === 'accepted').map(record => ({
    transactionId: record.transaction.id, transactionVersion: record.reviewVersion, status: 'skipped', reason: 'accepted_category',
  }));
  if (!eligible.length) {
    return { ok: true, items: skipped, provenance: null, metadata: null };
  }
  let prompt: string;
  try { prompt = promptFor(eligible); } catch { return failed('invalid_input'); }
  // The provider also enforces this limit. Fail before spending a request instead of truncating a batch.
  if (prompt.length > 30_000) return failed('invalid_input');

  let rawResponse: unknown;
  try {
    rawResponse = await provider.requestTextProposal({ prompt, versions: {
      prompt: CATEGORY_PROMPT_VERSION, schema: CATEGORY_SCHEMA_VERSION,
    }, schema: modelBatchSchema }, context);
  } catch { return failed('provider_unavailable', null, true); }
  const checkedResponse = providerResultSchema.safeParse(rawResponse);
  if (!checkedResponse.success) return failed('invalid_model_output');
  const response = checkedResponse.data;
  if (!response.ok) return failed(response.error.reason, response.metadata, response.error.retryable, response.error.retryAfterMs);
  if (!validatedMetadata(response.metadata)) return failed('invalid_model_output', response.metadata);

  const result = modelBatchSchema.safeParse(response.output);
  if (!result.success) return failed('invalid_model_output', response.metadata);
  const expectedIds = new Set(eligible.map(({ transaction }) => transaction.id));
  const seen = new Set<string>();
  for (const suggestion of result.data.suggestions) {
    if (!expectedIds.has(suggestion.transactionId) || seen.has(suggestion.transactionId)) return failed('invalid_model_output', response.metadata);
    seen.add(suggestion.transactionId);
  }
  if (seen.size !== expectedIds.size) return failed('invalid_model_output', response.metadata);

  const suggestions: CategoryProposalItem[] = [];
  for (const suggestion of result.data.suggestions) {
    const snapshot = snapshots.get(suggestion.transactionId);
    if (!snapshot) return failed('invalid_model_output', response.metadata);
    const evidence = { transactionId: snapshot.transaction.id, source: snapshot.transaction.source };
    if (evidence.transactionId !== suggestion.transactionId || !sourceReferenceSchema.safeParse(evidence.source).success) {
      return failed('invalid_model_output', response.metadata);
    }
    const inflowOnly = suggestion.category === 'customer_receipts';
    const outflowOnly = ['software_services', 'premises_utilities', 'travel'].includes(suggestion.category);
    const directionConflict = (inflowOnly && snapshot.transaction.direction !== 'in') ||
      (outflowOnly && snapshot.transaction.direction !== 'out');
    const ambiguous = suggestion.assessment === 'ambiguous' || suggestion.status === 'needs_review' ||
      suggestion.category === 'uncategorized' || directionConflict;
    const item = proposalItemSchema.safeParse({
      transactionId: snapshot.transaction.id, transactionVersion: snapshot.reviewVersion,
      category: ambiguous ? 'uncategorized' : suggestion.category,
      status: ambiguous ? 'needs_review' : 'proposed', rationale: suggestion.rationale,
      evidence, categoryGuideVersion: CATEGORY_GUIDE_VERSION,
    });
    if (!item.success) return failed('invalid_model_output', response.metadata);
    suggestions.push(item.data);
  }
  const suggestionsById = new Map(suggestions.map(item => [item.transactionId, item]));
  const skippedById = new Map(skipped.map(item => [item.transactionId, item]));
  const all: CategoryProposalItem[] = [];
  for (const { transaction } of parsed.records) {
    const item = suggestionsById.get(transaction.id) ?? skippedById.get(transaction.id);
    if (!item) return failed('invalid_model_output', response.metadata);
    all.push(item);
  }
  if (all.length !== parsed.records.length || new Set(all.map(item => item.transactionId)).size !== parsed.records.length) {
    return failed('invalid_model_output', response.metadata);
  }
  const provenance = provenanceSchema.safeParse({
    providerVersion: response.metadata.providerVersion, modelVersion: response.metadata.model,
    promptVersion: CATEGORY_PROMPT_VERSION, schemaVersion: CATEGORY_SCHEMA_VERSION, categoryGuideVersion: CATEGORY_GUIDE_VERSION,
  });
  if (!provenance.success) return failed('invalid_model_output', response.metadata);
  return { ok: true, items: all, provenance: provenance.data, metadata: response.metadata };
}
