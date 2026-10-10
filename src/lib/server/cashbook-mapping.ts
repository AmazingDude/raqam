import { transactionSchema } from '../contracts/schemas.ts';

export function mapCashbookRow(row: Record<string, unknown>) {
  return transactionSchema.parse({
    id: row.id, workspaceId: row.workspace_id, source: { sourceId: row.source_id, rowNumber: row.source_row },
    date: row.date, originalDescription: row.original_description, description: row.description,
    direction: row.direction, amountMinor: row.amount_minor, currency: row.currency, reference: row.reference,
    category: row.category, categoryStatus: row.category_status, matchStatus: 'unmatched',
  });
}
