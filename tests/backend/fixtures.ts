import type { Transaction } from '../../src/lib/contracts/index.ts';
export function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1', workspaceId: 'w1', source: { sourceId: 's1', rowNumber: 2 },
    date: '2026-10-10', originalDescription: 'Synthetic customer payment', description: 'Synthetic customer payment',
    direction: 'in', amountMinor: '10005', currency: 'PKR', reference: null,
    category: null, categoryStatus: 'needs_review', matchStatus: 'unmatched', ...overrides,
  };
}
