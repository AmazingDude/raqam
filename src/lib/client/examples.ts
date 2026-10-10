import type { CategoryProposal, SupportingDocument, Transaction, Workspace } from '../contracts/index.ts';
import type { CsvPreview } from '../server/csv.ts';

// Development-only synthetic examples. No evaluation answers or private records.
export const exampleWorkspace: Workspace = { id: 'example-studio', ownerSubject: 'example-owner', businessName: 'Sunday Studio', currency: 'PKR' };
export function exampleTransactions(): Transaction[] {
  return [
    { id: 'example-1', date: '2026-10-10', description: 'Brand identity · Aster Studio', direction: 'in', amountMinor: '6400000', category: 'customer_receipts', categoryStatus: 'accepted', matchStatus: 'unmatched', reference: 'AST-104' },
    { id: 'example-2', date: '2026-10-08', description: 'Northstar Cloud subscription', direction: 'out', amountMinor: '850000', category: null, categoryStatus: 'proposed', matchStatus: 'proposed', reference: 'NS-101' },
    { id: 'example-3', date: '2026-10-07', description: 'October studio rent', direction: 'out', amountMinor: '1250000', category: 'premises_utilities', categoryStatus: 'accepted', matchStatus: 'unmatched', reference: 'RENT-10' },
    { id: 'example-4', date: '2026-10-06', description: 'Website project · Fieldwork', direction: 'in', amountMinor: '2800000', category: null, categoryStatus: 'proposed', matchStatus: 'unmatched', reference: 'FLD-208' },
    { id: 'example-5', date: '2026-10-05', description: 'Fuel stop · client visit', direction: 'out', amountMinor: '325000', category: null, categoryStatus: 'needs_review', matchStatus: 'unmatched', reference: null },
    { id: 'example-6', date: '2026-10-05', description: 'Card purchase', direction: 'out', amountMinor: '325000', category: null, categoryStatus: 'needs_review', matchStatus: 'unmatched', reference: null },
  ].map((record, index) => ({ ...record, workspaceId: exampleWorkspace.id, originalDescription: record.description, currency: 'PKR', source: { sourceId: 'example-csv', rowNumber: index + 2 } } as Transaction));
}
export function exampleDocuments(): SupportingDocument[] {
  return [
    { id: 'example-doc-1', source: { sourceId: 'example-image-1', rowNumber: null }, extractedFields: { counterparty: 'Northstar Cloud', date: '2026-10-08', totalMinor: '850000', currency: 'PKR', reference: 'NS-101' } },
    { id: 'example-doc-2', source: { sourceId: 'example-image-2', rowNumber: null }, extractedFields: { counterparty: 'Metro Fuel', date: '2026-10-05', totalMinor: null, currency: 'PKR', reference: null } },
  ].map(doc => ({ ...doc, workspaceId: exampleWorkspace.id, correctedFields: null, extractionStatus: 'complete', reviewStatus: 'proposed', modelVersion: 'synthetic-example', promptVersion: 'synthetic-example' }));
}
// What is printed on the synthetic source, separately from OCR's proposed fields.
export const exampleReceiptPrint = {
  'example-doc-1': { counterparty: 'Northstar Cloud', date: '2026-10-08', totalMinor: '850000', currency: 'PKR', reference: 'NS-101' },
  'example-doc-2': { counterparty: 'Metro Fuel', date: '2026-10-05', totalMinor: '325000', currency: 'PKR', reference: null },
} satisfies Record<string, import('../contracts/index.ts').DocumentFields>;
export function exampleProposals(): CategoryProposal[] {
  return [
    { id: 'example-category-2', transactionId: 'example-2', category: 'software_services', rationale: 'The description names a cloud subscription. Review the source row before accepting.' },
    { id: 'example-category-4', transactionId: 'example-4', category: 'customer_receipts', rationale: 'The description names a customer website project. This is a suggestion, not an approved label.' },
  ].map(p => ({ ...p, workspaceId: exampleWorkspace.id, kind: 'category', status: 'proposed' } as CategoryProposal));
}
export const examplePreview: CsvPreview = {
  currency: 'PKR', contentHash: 'synthetic-example-import', validCount: 2, invalidCount: 1,
  header: ['date', 'description', 'direction', 'amount', 'reference'],
  rows: [
    { rowNumber: 2, lineNumber: 2, original: ['2026-10-11', 'Design retainer · Cedar', 'in', '18000.00', 'CDR-11'], transaction: { date: '2026-10-11', description: 'Design retainer · Cedar', direction: 'in', amountMinor: '1800000', currency: 'PKR', reference: 'CDR-11' }, errors: [] },
    { rowNumber: 3, lineNumber: 3, original: ['2026-10-11', 'Printer supplies', 'out', '1450.00', 'PRINT-11'], transaction: { date: '2026-10-11', description: 'Printer supplies', direction: 'out', amountMinor: '145000', currency: 'PKR', reference: 'PRINT-11' }, errors: [] },
    { rowNumber: 4, lineNumber: 4, original: ['2026-10-11', 'Unclear card entry', 'out', 'unknown', ''], transaction: null, errors: [{ field: 'amount', message: 'The amount is unknown. Correct it from your source or leave this row unresolved.' }] },
  ],
};
