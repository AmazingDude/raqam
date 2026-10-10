import { transactionSchema } from '../contracts/schemas.ts';

export function mapCashbookRow(row: Record<string, unknown>) {
  return transactionSchema.parse({
    id: row.id, workspaceId: row.workspace_id, source: { sourceId: row.source_id, rowNumber: row.source_type === 'manual_chat' ? null : row.source_row, ...(row.source_type === 'manual_chat' ? {kind:'manual_chat'} : {}) },
    date: row.date, originalDescription: row.original_description, description: row.description,
    direction: row.direction, amountMinor: row.amount_minor, currency: row.currency, reference: row.reference,
    // Compatibility with pre-007 hosts; 007 supplies the authoritative allocation projection.
    category: row.category, categoryStatus: row.category_status, matchStatus: row.match_status === undefined ? 'unmatched' : row.match_status,
  });
}
