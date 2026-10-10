import { z } from 'zod';
import type { Transaction } from '../../contracts/index.ts';
import { categorySuggestionSchema } from '../../contracts/schemas.ts';
import { BackendError } from '../errors.ts';
import { validateCashbook } from '../summary.ts';

// Private output guard. The route must first authorize/read the supplied records.
// C's batch outcomes/skip coverage and A1's persistence/version checks are separate.
export function validateCategorySuggestions(raw: unknown, records: readonly Transaction[], workspaceId: string) {
  try {
    if (records.length > 50) throw new Error('Input batch exceeds cashbook cap');
    const scoped = validateCashbook(records, workspaceId);
    const byId = new Map(scoped.map(record => [record.id, record]));
    const suggestions = z.array(categorySuggestionSchema).max(50).parse(raw);
    const seen = new Set<string>();
    for (const suggestion of suggestions) {
      const record = byId.get(suggestion.transactionId);
      if (!record || seen.has(record.id) || record.categoryStatus === 'accepted') {
        throw new Error('Invalid or already reviewed target');
      }
      seen.add(record.id);
    }
    return suggestions;
  } catch {
    throw new BackendError('UNAVAILABLE', 'Category suggestions could not be verified. Please retry.');
  }
}
