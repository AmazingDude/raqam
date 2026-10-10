import type { ProposalRecord } from '../contracts/proposals.ts';

// Merge authenticated pages without replacing newer owner-reviewed decisions
// with an older overlapping page. Never combine different workspace scopes.
export function mergeProposalPages(current: ProposalRecord[], incoming: ProposalRecord[], workspaceId: string): ProposalRecord[] {
  const merged = new Map<string, ProposalRecord>();
  for (const proposal of [...current, ...incoming]) {
    if (proposal.workspaceId !== workspaceId) throw new Error('Proposal page belongs to another workspace. Reload your workspace.');
    const previous = merged.get(proposal.id);
    if (!previous || proposal.reviewVersion > previous.reviewVersion) merged.set(proposal.id, proposal);
  }
  return [...merged.values()];
}
