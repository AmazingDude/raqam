import type { Transaction } from '../contracts/index.ts';
import type { ProposalRecord } from '../contracts/proposals.ts';

// Selection over loaded records only. The server validates scope, versions and
// eligibility again. Preserve the upstream 10-record request batch (contract max 50).
export function categoryPreparationBatch(records: Transaction[], proposals: ProposalRecord[]) {
  const pending = new Set(proposals.filter(proposal => proposal.suggestion.kind === 'category' && (proposal.status === 'proposed' || proposal.status === 'needs_review')).map(proposal => proposal.transactionId));
  const ids = [...new Set(records.filter(record => record.categoryStatus !== 'accepted' && !pending.has(record.id)).map(record => record.id))];
  return { transactionIds: ids.slice(0, 10), remainingLoadedCount: Math.max(0, ids.length - 10) };
}
