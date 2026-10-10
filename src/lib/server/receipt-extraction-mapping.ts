import type { ExtractionResult } from '../ai/extraction.ts';
import { receiptExtractionOutcomeSchema, modelProvenanceSchema } from '../contracts/documents.ts';
import { receiptEvidenceSchema, receiptFailureSchema } from '../contracts/receipt-extraction.ts';
import { BackendError } from './errors.ts';

export function mapReceiptExtraction(result: ExtractionResult, sourceId: string, sourceHash: string,
  expected: { modelVersion: string; promptVersion: string; schemaVersion: string }) {
  if (result.ok) {
    const output = result.output;
    if (output.source.sourceId !== sourceId || output.source.rowNumber !== null || output.sourceVersion !== sourceHash ||
        output.provenance.model !== expected.modelVersion || output.provenance.promptVersion !== expected.promptVersion ||
        output.provenance.schemaVersion !== expected.schemaVersion)
      throw new BackendError('UNAVAILABLE', 'Receipt extraction could not be verified.');
    const evidence = receiptEvidenceSchema.parse({ sourceId, sourceVersion: sourceHash, status: output.status,
      fields: output.fields, blockers: output.blockers });
    return receiptExtractionOutcomeSchema.parse({ status: 'complete', fields: output.documentFields,
      provenance: modelProvenanceSchema.parse(expected), evidence });
  }
  const failure = receiptFailureSchema.parse(result.error);
  const reason = failure.reason === 'invalid_model_output' ? 'invalid_model_output' :
    ['provider_timeout','deadline_exceeded'].includes(failure.reason) ? 'provider_timeout' :
    ['provider_rate_limited','budget_exhausted'].includes(failure.reason) ? 'provider_rate_limited' : 'provider_unavailable';
  return receiptExtractionOutcomeSchema.parse({ status: 'failed', reason, failure });
}
