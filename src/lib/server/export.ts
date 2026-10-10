import type { Transaction } from '../contracts/index.ts';
import { validateCashbook } from './summary.ts';
import { formatAmount } from './money.ts';

// Quoting alone does not prevent spreadsheet formula execution.
export function encodeCsvCell(value: string): string {
  const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function exportCashbook(records: readonly Transaction[], workspaceId: string): string {
  const validated = validateCashbook(records, workspaceId);
  const header = ['id', 'date', 'original_description', 'reviewed_description', 'direction', 'amount', 'currency', 'reference', 'accepted_category', 'category_review_status', 'match_status', 'source_id', 'source_row'];
  const rows = validated.map(record => [
    record.id, record.date, record.originalDescription, record.description, record.direction,
    formatAmount(record.amountMinor), record.currency, record.reference ?? '',
    record.categoryStatus === 'accepted' ? record.category ?? '' : '',
    record.categoryStatus, record.matchStatus, record.source.sourceId, String(record.source.rowNumber),
  ]);
  return [header, ...rows].map(row => row.map(encodeCsvCell).join(',')).join('\r\n') + '\r\n';
}
