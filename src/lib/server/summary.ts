import type { CashBucket, CashSummary, Category, Transaction } from '../contracts/index.ts';
import { cashSummaryRangeSchema, type CashSummaryRange } from '../contracts/cashbook.ts';
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

export function calculateCashSummary(records: readonly Transaction[], workspaceId: string, unresolvedImportRowCount: number, range: CashSummaryRange = {}): CashSummary {
  if (!Number.isSafeInteger(unresolvedImportRowCount) || unresolvedImportRowCount < 0) throw new Error('Invalid unresolved row count');
  const dateRange = cashSummaryRangeSchema.parse(range);
  const validated = validateCashbook(records, workspaceId).filter(record =>
    (!dateRange.dateFrom || record.date >= dateRange.dateFrom) && (!dateRange.dateTo || record.date <= dateRange.dateTo));
  const all = emptyBucket(), unreviewed = emptyBucket();
  const categories: Partial<Record<Category, CashBucket>> = {};
  let categoryAcceptedCount = 0;
  let matchAcceptedCount = 0;
  for (const record of validated) {
    add(all, record);
    if (record.categoryStatus === 'accepted' && record.category !== null) {
      const bucket = categories[record.category] ?? emptyBucket();
      add(bucket, record); categories[record.category] = bucket;
      categoryAcceptedCount += 1;
    } else { add(unreviewed, record); }
    if (record.matchStatus === 'accepted') matchAcceptedCount += 1;
  }
  const transactionCount = validated.length;
  return {
    ...all, currency: 'PKR', transactionCount, transactionIds: validated.map(record => record.id), unresolvedImportRowCount,
    categoryCoverage: { acceptedCount: categoryAcceptedCount, notAcceptedCount: transactionCount - categoryAcceptedCount },
    matchCoverage: { matchedCount: matchAcceptedCount, notMatchedCount: transactionCount - matchAcceptedCount },
    categories, unreviewed,
  };
}
