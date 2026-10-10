import type { CashBucket, CashSummary, Category, Transaction } from '../contracts/index.ts';
import { transactionSchema } from '../contracts/schemas.ts';

export function validateCashbook(records: readonly Transaction[], workspaceId: string): Transaction[] {
  if (!workspaceId) throw new Error('Workspace scope is required');
  const ids = new Set<string>(), sourceRows = new Set<string>();
  return records.map(raw => {
    const record = transactionSchema.parse(raw);
    if (record.workspaceId !== workspaceId) throw new Error('Inaccessible transaction');
    if (record.source.rowNumber === null) throw new Error('Cash movement requires an imported source row');
    const sourceKey = JSON.stringify([record.source.sourceId, record.source.rowNumber]);
    if (ids.has(record.id) || sourceRows.has(sourceKey)) throw new Error('Duplicate cash movement');
    ids.add(record.id); sourceRows.add(sourceKey);
    return record;
  });
}

function emptyBucket(): CashBucket { return { inflowMinor: '0', outflowMinor: '0', netMovementMinor: '0' }; }
function add(bucket: CashBucket, record: Transaction): void {
  const key = record.direction === 'in' ? 'inflowMinor' : 'outflowMinor';
  bucket[key] = (BigInt(bucket[key]) + BigInt(record.amountMinor)).toString();
  bucket.netMovementMinor = (BigInt(bucket.inflowMinor) - BigInt(bucket.outflowMinor)).toString();
}

export function calculateCashSummary(records: readonly Transaction[], workspaceId: string, unresolvedImportRowCount: number): CashSummary {
  if (!Number.isSafeInteger(unresolvedImportRowCount) || unresolvedImportRowCount < 0) throw new Error('Invalid unresolved row count');
  const validated = validateCashbook(records, workspaceId);
  const all = emptyBucket(), unreviewed = emptyBucket();
  const categories: Partial<Record<Category, CashBucket>> = {};
  for (const record of validated) {
    add(all, record);
    if (record.categoryStatus === 'accepted' && record.category !== null) {
      const bucket = categories[record.category] ?? emptyBucket();
      add(bucket, record); categories[record.category] = bucket;
    } else { add(unreviewed, record); }
  }
  return { ...all, currency: 'PKR', transactionCount: validated.length, transactionIds: validated.map(record => record.id), unresolvedImportRowCount, categories, unreviewed };
}
