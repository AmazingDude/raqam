import { createHash } from 'node:crypto';
import type { SupportingDocument, Transaction } from '../../contracts/index.ts';
import { assistantSnapshotSchema, type AssistantSnapshot } from '../../contracts/assistant.ts';

type SnapshotSource = AssistantSnapshot['sources'][number];

export function createAssistantSnapshot(
  workspaceId: string,
  sources: readonly SnapshotSource[],
  parts: readonly string[],
): AssistantSnapshot {
  if (!workspaceId || sources.length === 0) throw new Error('Assistant snapshot requires a workspace and source kind');
  const token = createHash('sha256').update(`${workspaceId}\0${sources.join(',')}\0${parts.join('\0')}`).digest('hex');
  return assistantSnapshotSchema.parse({ workspaceId, token, sources: [...sources] });
}

export function cashbookSnapshot(workspaceId: string, records: readonly Transaction[], unresolvedImportRowCount: number): AssistantSnapshot {
  return createAssistantSnapshot(workspaceId, ['cashbook'], [
    String(unresolvedImportRowCount),
    ...[...records].map(record => `${record.id}:${record.amountMinor}:${record.categoryStatus}:${record.matchStatus}`).sort(),
  ]);
}

export function documentSnapshot(workspaceId: string, documents: readonly SupportingDocument[]): AssistantSnapshot {
  return createAssistantSnapshot(workspaceId, ['documents'],
    [...documents].map(document => `${document.id}:${document.extractionStatus}:${document.reviewStatus}`).sort());
}

export function historySnapshot(workspaceId: string, history: { items: readonly { kind: string; id: string; partial: boolean; decisions: readonly { version: number }[] }[]; partial: boolean }): AssistantSnapshot {
  return createAssistantSnapshot(workspaceId, ['history'], [
    history.partial ? 'partial' : 'complete',
    ...history.items.map(item => `${item.kind}:${item.id}:${item.partial}:${item.decisions.map(decision => decision.version).join(',')}`),
  ]);
}

export function combinedSnapshot(workspaceId: string, snapshots: readonly AssistantSnapshot[]): AssistantSnapshot {
  const sources = [...new Set(snapshots.flatMap(snapshot => snapshot.sources))] as SnapshotSource[];
  if (snapshots.some(snapshot => snapshot.workspaceId !== workspaceId)) throw new Error('Assistant snapshot workspace mismatch');
  return createAssistantSnapshot(workspaceId, sources, snapshots.map(snapshot => snapshot.token));
}
