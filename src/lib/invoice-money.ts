import { assertMinorUnits } from './server/money.ts';

// Invoice quantities have two decimals. Round each line half up to a minor unit
// using integer arithmetic; the editor, model proposal and database use this rule.
export function invoiceLineAmount(quantity: number, rateMinor: string): string {
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 100000 || !/^\d+(?:\.\d{1,2})?$/.test(String(quantity))) throw new Error('Use a quantity with at most two decimals.');
  assertMinorUnits(rateMinor);
  const [whole, fraction = ''] = String(quantity).split('.');
  const quantityHundredths = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  const amount = (quantityHundredths * BigInt(rateMinor) + 50n) / 100n;
  assertMinorUnits(amount.toString()); return amount.toString();
}
export function invoiceTotals(items: readonly { quantity: number; rateMinor: string }[], discount = '0', shipping = '0', tax = '0') {
  [discount, shipping, tax].forEach(assertMinorUnits);
  const amounts = items.map(item => invoiceLineAmount(item.quantity, item.rateMinor));
  const subtotal = amounts.reduce((sum, amount) => sum + BigInt(amount), 0n);
  const total = subtotal - BigInt(discount) + BigInt(shipping) + BigInt(tax);
  if (total < 0n) throw new Error('Discount exceeds the invoice amount.');
  assertMinorUnits(subtotal.toString()); assertMinorUnits(total.toString());
  return { amounts, subtotalMinor: subtotal.toString(), totalMinor: total.toString() };
}
