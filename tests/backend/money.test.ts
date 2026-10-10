import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, formatAmount } from '../../src/lib/server/money.ts';

test('PKR decimals normalize to exact paisa without binary rounding', () => {
  assert.equal(parseAmount('100.05'), '10005');
  assert.equal(parseAmount('0.10'), '10');
  assert.equal(formatAmount('10005'), '100.05');
});

test('unknown, negative, excess precision and overflow amounts stay unresolved', () => {
  for (const value of [null, undefined, 0, '', 'unknown', '-12', '12.345', '1e3', '1,000', '92233720368547758.08']) {
    assert.equal(parseAmount(value), null, String(value));
  }
  assert.equal(parseAmount('0'), '0'); // explicit zero is distinct from unknown
  assert.equal(parseAmount('92233720368547758.07'), '9223372036854775807');
  assert.equal(formatAmount('-11'), '-0.11');
});
