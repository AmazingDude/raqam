import type { Category, Transaction } from '../contracts/index.ts';
// A's existing pure helpers are browser-safe. No provider client or credentials.
import { formatAmount } from '../server/money.ts';
import { calculateCashSummary } from '../server/summary.ts';
import { exportCashbook } from '../server/export.ts';

export const categoryLabels: Record<Category, string> = {
  customer_receipts: 'Customer receipts', software_services: 'Software & services',
  premises_utilities: 'Premises & utilities', travel: 'Travel',
  other_operating_cash_activity: 'Other operating activity',
  transfers_owner_movements: 'Transfers & owner movements', uncategorized: 'Uncategorized',
};
export function money(value: string | null): string {
  if (value === null) return 'Unknown';
  const amount = formatAmount(value);
  const [whole = '', decimals] = amount.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimals}`;
}
export function displayDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}
export function summarize(records: Transaction[], workspaceId: string, unresolved = 0) {
  return calculateCashSummary(records, workspaceId, unresolved);
}
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadExample(records: Transaction[], workspaceId: string): void {
  downloadText('raqam-example-cashbook.csv', exportCashbook(records, workspaceId));
}
export const csvTemplate = 'date,description,direction,amount,reference\r\n';
