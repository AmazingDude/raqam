import type { MinorUnits } from '../contracts/index.ts';

const MAX_RECORD_MINOR = 9223372036854775807n; // Postgres bigint

export function parseAmount(value: unknown): MinorUnits | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text) || text.length > 22) return null;
  const [whole, fraction = ''] = text.split('.');
  const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  return minor <= MAX_RECORD_MINOR ? minor.toString() : null;
}

export function assertMinorUnits(value: unknown): asserts value is MinorUnits {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value) || value.length > 19 || BigInt(value) > MAX_RECORD_MINOR) {
    throw new Error('Invalid nonnegative integer minor units');
  }
}

// Also formats signed, arbitrary-size totals calculated by code.
export function formatAmount(value: MinorUnits): string {
  if (!/^-?(0|[1-9]\d*)$/.test(value)) throw new Error('Invalid integer minor units');
  const minor = BigInt(value);
  const magnitude = minor < 0n ? -minor : minor;
  return `${minor < 0n ? '-' : ''}${magnitude / 100n}.${(magnitude % 100n).toString().padStart(2, '0')}`;
}
