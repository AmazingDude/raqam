import type { AcceptedMatch, SupportingDocument, Transaction } from '../../../../src/lib/contracts/index.ts';

// Synthetic development records; never reserved evaluation answers.
export function transaction(id = 'tx-1', overrides: Partial<Transaction> = {}): Transaction {
  return {
    id, workspaceId: 'workspace-1', source: { sourceId: 'csv-1', rowNumber: 2 },
    date: '2026-10-09', originalDescription: 'SVC WORKSPACE BD-104', description: 'SVC WORKSPACE BD-104',
    direction: 'out', amountMinor: '450000', currency: 'PKR', reference: 'BD-104',
    category: null, categoryStatus: 'needs_review', matchStatus: 'unmatched', ...overrides,
  };
}

export function document(overrides: Partial<SupportingDocument> = {}): SupportingDocument {
  return {
    id: 'doc-1', workspaceId: 'workspace-1', source: { sourceId: 'image-1', rowNumber: null },
    extractedFields: { counterparty: 'BrightDesk', date: '2026-10-08', totalMinor: '450000', currency: 'PKR', reference: 'BD-104' },
    correctedFields: null, extractionStatus: 'complete', reviewStatus: 'accepted',
    modelVersion: null, promptVersion: null, ...overrides,
  };
}

export function input(records: Transaction[] = [transaction()], doc = document(), items: AcceptedMatch[] = []) {
  return {
    workspaceId: 'workspace-1', document: { record: doc, version: 1 },
    transactions: records.map(record => ({ record, version: 1 })),
    pool: { complete: true as const, revision: 'pool-1' },
    allocations: { complete: true as const, version: 1, items },
  };
}
