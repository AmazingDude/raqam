import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { DocumentFields, MinorUnits, SourceReference } from '../contracts/index.ts';
import { documentFieldsSchema, sourceReferenceSchema } from '../contracts/schemas.ts';
import { parseAmount } from '../server/money.ts';
import { identifyImage, MAX_IMAGE_BYTES } from '../server/uploads.ts';
import type { GroqProvider, ProviderContext, ProviderFailureReason, ProviderMetadata, ProviderResult } from './provider.ts';
import { VERSION_PATTERN } from './config.ts';
import { RECEIPT_EXTRACTION_PROMPT, RECEIPT_EXTRACTION_PROMPT_VERSION, RECEIPT_EXTRACTION_SCHEMA_VERSION } from './prompts/extraction.ts';

const fieldNames = ['merchant', 'document_date', 'total', 'currency', 'reference'] as const;
const rawExtractionSchema = z.strictObject({
  counterpartyText: z.string().max(2000).nullable(),
  dateText: z.string().max(100).nullable(),
  totalText: z.string().max(200).nullable(),
  totalCandidates: z.array(z.string().max(100)).max(5),
  currencyText: z.string().max(20).nullable(),
  referenceText: z.string().max(500).nullable(),
  unreadableFields: z.array(z.enum(fieldNames)).max(fieldNames.length),
});

export type ExtractionFieldState = 'observed' | 'missing' | 'unreadable' | 'ambiguous';
export type ExtractionIssue = 'missing_field' | 'unreadable_field' | 'ambiguous_date' | 'currency_unknown' | 'currency_mismatch' | 'amount_invalid' | 'multiple_totals';
export interface ExtractionField<T> {
  rawText: string | null;
  observedCandidates: string[];
  normalizedValue: T | null;
  state: ExtractionFieldState;
  evidenceField: typeof fieldNames[number];
  issues: ExtractionIssue[];
}
export interface ReceiptExtraction {
  kind: 'extraction';
  source: SourceReference;
  sourceVersion: string;
  status: 'proposed' | 'needs_review';
  fields: {
    merchant: ExtractionField<string>;
    documentDate: ExtractionField<string>;
    total: ExtractionField<MinorUnits>;
    currency: ExtractionField<string>;
    reference: ExtractionField<string>;
  };
  documentFields: DocumentFields;
  blockers: ExtractionIssue[];
  provenance: Pick<ProviderMetadata, 'requestId' | 'model' | 'providerVersion' | 'promptVersion' | 'schemaVersion' | 'attempts' | 'durationMs' | 'providerRequestIds' | 'usage'>;
}
export type ExtractionResult =
  | { ok: true; output: ReceiptExtraction; metadata: ProviderMetadata }
  | { ok: false; error: { reason: ProviderFailureReason; retryable: boolean; retryAfterMs: number | null }; metadata: ProviderMetadata };

export interface ReceiptExtractionInput {
  source: SourceReference;
  sourceVersion: string;
  mime: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
}

export interface ExtractionCacheIdentityInput {
  ownerId: string;
  workspaceId: string;
  sourceHash: string;
  provider: 'groq' | 'gemini';
  modelId: string;
  promptVersion: string;
  schemaVersion: string;
  preprocessingVersion: string;
}

const clean = (text: string | null): string | null => text === null ? null : text.trim() || null;

function field<T>(rawText: string | null, normalizedValue: T | null, state: ExtractionFieldState,
  evidenceField: typeof fieldNames[number], issues: ExtractionIssue[], observedCandidates: string[] = []): ExtractionField<T> {
  return { rawText, observedCandidates, normalizedValue, state, evidenceField, issues };
}

function missingField<T>(rawText: string | null, name: typeof fieldNames[number], unreadable: boolean): ExtractionField<T> {
  const issue = unreadable ? 'unreadable_field' : 'missing_field';
  return field<T>(rawText, null, unreadable ? 'unreadable' : 'missing', name, [issue]);
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const months = new Map<string, number>([
  ['jan', 1], ['january', 1], ['feb', 2], ['february', 2], ['mar', 3], ['march', 3],
  ['apr', 4], ['april', 4], ['may', 5], ['jun', 6], ['june', 6], ['jul', 7], ['july', 7],
  ['aug', 8], ['august', 8], ['sep', 9], ['sept', 9], ['september', 9],
  ['oct', 10], ['october', 10], ['nov', 11], ['november', 11], ['dec', 12], ['december', 12],
]);
function normalizeDate(text: string): string | null {
  const value = text.trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?[,]?\s+(\d{4})$/.exec(value);
  if (match) {
    const month = months.get(match[2]!.toLowerCase());
    return month ? isoDate(Number(match[3]), month, Number(match[1])) : null;
  }
  match = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(value);
  if (match) {
    const month = months.get(match[1]!.toLowerCase());
    return month ? isoDate(Number(match[3]), month, Number(match[2])) : null;
  }
  return null;
}

const currencyCodes = new Set(Intl.supportedValuesOf('currency'));
function normalizeCurrency(rawText: string | null, totalText: string | null, unreadable: boolean): ExtractionField<string> {
  if (unreadable) return missingField<string>(rawText, 'currency', true);
  // Only an explicit supported currency prefix on the amount is evidence here.
  // Ordinary receipt words such as NET/DUE/TAX must not become currency codes.
  const observed = rawText ?? (totalText?.match(/^\s*(PKR)\s+(?=\d)/i)?.[1] ?? null);
  const printed = clean(observed);
  if (!printed) return missingField<string>(rawText, 'currency', unreadable);
  const normalized = printed.toUpperCase();
  if (!currencyCodes.has(normalized)) return field<string>(observed, null, 'ambiguous', 'currency', ['currency_unknown']);
  if (normalized !== 'PKR') return field(observed, normalized, 'observed', 'currency', ['currency_mismatch']);
  return field(observed, normalized, 'observed', 'currency', []);
}

function exactTotal(rawText: string, currency: string | null): MinorUnits | null {
  let amount = rawText.trim();
  const prefixed = /^(PKR)\s*/i.exec(amount);
  if (prefixed) {
    if (currency !== 'PKR') return null;
    amount = amount.slice(prefixed[0].length);
  }
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(amount)) return null;
  return parseAmount(amount.replaceAll(',', ''));
}

function normalizeTotal(raw: z.infer<typeof rawExtractionSchema>, currency: string | null): ExtractionField<MinorUnits> {
  const observed = raw.totalText ?? (raw.totalCandidates.length === 1 ? raw.totalCandidates[0]! : null);
  const candidates = raw.totalCandidates.length ? raw.totalCandidates : observed ? [observed] : [];
  if (raw.unreadableFields.includes('total')) return field<MinorUnits>(observed, null, 'unreadable', 'total', ['unreadable_field'], candidates);
  if (candidates.length > 1) return field<MinorUnits>(observed, null, 'ambiguous', 'total', ['multiple_totals'], candidates);
  if (!observed) return missingField(null, 'total', raw.unreadableFields.includes('total'));
  if (currency !== null && currency !== 'PKR') return field<MinorUnits>(observed, null, 'ambiguous', 'total', ['currency_mismatch'], candidates);
  const normalized = exactTotal(observed, currency);
  if (raw.totalText !== null && raw.totalCandidates.length === 1
    && normalized !== exactTotal(raw.totalCandidates[0]!, currency)) {
    return field<MinorUnits>(observed, null, 'ambiguous', 'total', ['multiple_totals'], [raw.totalText, ...raw.totalCandidates]);
  }
  if (normalized === null) return field<MinorUnits>(observed, null, 'unreadable', 'total', ['amount_invalid'], candidates);
  return field(observed, normalized, 'observed', 'total', [], candidates);
}

function normalizeOutput(raw: z.infer<typeof rawExtractionSchema>, input: ReceiptExtractionInput,
  metadata: ProviderMetadata): ReceiptExtraction {
  const merchantText = clean(raw.counterpartyText);
  const merchant = merchantText && !raw.unreadableFields.includes('merchant')
    ? field(raw.counterpartyText, merchantText, 'observed', 'merchant', [])
    : missingField<string>(raw.counterpartyText, 'merchant', raw.unreadableFields.includes('merchant'));
  const dateText = clean(raw.dateText);
  let documentDate: ExtractionField<string>;
  if (!dateText || raw.unreadableFields.includes('document_date')) documentDate = missingField<string>(raw.dateText, 'document_date', raw.unreadableFields.includes('document_date'));
  else {
    const normalizedDate = normalizeDate(dateText);
    documentDate = normalizedDate
      ? field(raw.dateText, normalizedDate, 'observed', 'document_date', [])
      : field<string>(raw.dateText, null, 'ambiguous', 'document_date', ['ambiguous_date']);
  }
  const currency = normalizeCurrency(raw.currencyText, raw.totalText, raw.unreadableFields.includes('currency'));
  const total = normalizeTotal(raw, currency.normalizedValue);
  const referenceText = clean(raw.referenceText);
  const reference = referenceText && !raw.unreadableFields.includes('reference')
    ? field(raw.referenceText, referenceText, 'observed', 'reference', [])
    : missingField<string>(raw.referenceText, 'reference', raw.unreadableFields.includes('reference'));
  const fields = { merchant, documentDate, total, currency, reference };
  const blockers = [...new Set(Object.values(fields).flatMap(value => value.issues))];
  const documentFields: DocumentFields = {
    counterparty: merchant.normalizedValue,
    date: documentDate.normalizedValue,
    totalMinor: total.normalizedValue,
    currency: currency.normalizedValue,
    reference: reference.normalizedValue,
  };
  const validatedFields = documentFieldsSchema.parse(documentFields);
  const safeMetadata = {
    requestId: metadata.requestId, model: metadata.model, providerVersion: metadata.providerVersion,
    promptVersion: RECEIPT_EXTRACTION_PROMPT_VERSION, schemaVersion: RECEIPT_EXTRACTION_SCHEMA_VERSION,
    attempts: metadata.attempts, durationMs: metadata.durationMs, providerRequestIds: [...metadata.providerRequestIds],
    usage: metadata.usage ? { ...metadata.usage } : null,
  };
  return {
    kind: 'extraction', source: { ...input.source }, sourceVersion: input.sourceVersion,
    status: blockers.length ? 'needs_review' : 'proposed', fields, documentFields: validatedFields, blockers, provenance: safeMetadata,
  };
}

export function createExtractionCacheIdentity(input: ExtractionCacheIdentityInput): string {
  if (!input.ownerId.trim() || !input.workspaceId.trim() || !/^[a-f0-9]{64}$/.test(input.sourceHash)
    || !input.modelId.trim() || !VERSION_PATTERN.test(input.promptVersion) || !VERSION_PATTERN.test(input.schemaVersion)
    || !VERSION_PATTERN.test(input.preprocessingVersion)) throw new Error('Invalid extraction cache identity inputs');
  const canonical = JSON.stringify([
    'receipt-extraction-cache-v1', input.ownerId, input.workspaceId, input.sourceHash, input.provider,
    input.modelId, input.promptVersion, input.schemaVersion, input.preprocessingVersion,
  ]);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export async function extractReceipt(input: ReceiptExtractionInput, provider: Pick<GroqProvider, 'requestImageExtraction'>,
  context: ProviderContext): Promise<ExtractionResult> {
  if (!input || !sourceReferenceSchema.safeParse(input.source).success || input.source.rowNumber !== null
    || typeof input.sourceVersion !== 'string' || !input.sourceVersion.trim() || input.sourceVersion.length > 128
    || !(input.bytes instanceof Uint8Array) || input.bytes.length === 0 || input.bytes.length > MAX_IMAGE_BYTES
    || !['image/png', 'image/jpeg'].includes(input.mime) || identifyImage(input.bytes)?.mime !== input.mime) {
    return { ok: false, error: { reason: 'invalid_request', retryable: false, retryAfterMs: null }, metadata: emptyMetadata(context) };
  }
  let result: ProviderResult;
  try {
    result = await provider.requestImageExtraction({
      source: input.source, mime: input.mime, bytes: input.bytes,
      prompt: RECEIPT_EXTRACTION_PROMPT,
      versions: { prompt: RECEIPT_EXTRACTION_PROMPT_VERSION, schema: RECEIPT_EXTRACTION_SCHEMA_VERSION },
      schema: rawExtractionSchema,
    }, context);
  } catch {
    return { ok: false, error: { reason: 'provider_unavailable', retryable: true, retryAfterMs: null }, metadata: emptyMetadata(context) };
  }
  if (!result.ok) return { ok: false, error: { reason: result.error.reason, retryable: result.error.retryable, retryAfterMs: result.error.retryAfterMs }, metadata: result.metadata };
  const parsed = rawExtractionSchema.safeParse(result.output);
  if (!parsed.success) return { ok: false, error: { reason: 'invalid_model_output', retryable: false, retryAfterMs: null }, metadata: result.metadata };
  try { return { ok: true, output: normalizeOutput(parsed.data, input, result.metadata), metadata: result.metadata }; }
  catch { return { ok: false, error: { reason: 'invalid_model_output', retryable: false, retryAfterMs: null }, metadata: result.metadata }; }
}

function emptyMetadata(context: ProviderContext): ProviderMetadata {
  return { requestId: typeof context?.requestId === 'string' ? context.requestId : null, mode: 'image', model: null,
    providerVersion: 'receipt-extraction-v1', promptVersion: RECEIPT_EXTRACTION_PROMPT_VERSION, schemaVersion: RECEIPT_EXTRACTION_SCHEMA_VERSION,
    attempts: 0, durationMs: 0, providerRequestIds: [], usage: null };
}
