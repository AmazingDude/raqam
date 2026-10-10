import { createHash } from 'node:crypto';
import type { SupportingDocument, Transaction } from '../../contracts/index.ts';
import { assistantSnapshotSchema, type AssistantHistory, type AssistantSnapshot } from '../../contracts/assistant.ts';

type SnapshotSource = AssistantSnapshot['sources'][number];
const ASSISTANT_SNAPSHOT_VERSION = 1 as const;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Assistant snapshot contains a non-JSON value');
  return encoded;
}

export function createAssistantSnapshot(
  workspaceId: string,
  sources: readonly SnapshotSource[],
  parts: readonly unknown[],
): AssistantSnapshot {
  if (!workspaceId || sources.length === 0) throw new Error('Assistant snapshot requires a workspace and source kind');
  const orderedSources = [...new Set(sources)].sort();
  const material = { workspaceId, version: ASSISTANT_SNAPSHOT_VERSION, sources: orderedSources, parts };
  const token = createHash('sha256').update(canonical(material)).digest('hex');
  return assistantSnapshotSchema.parse({ workspaceId, version: ASSISTANT_SNAPSHOT_VERSION, token, sources: orderedSources });
}

export function cashbookSnapshot(workspaceId: string, records: readonly Transaction[], unresolvedImportRowCount: number): AssistantSnapshot {
  return createAssistantSnapshot(workspaceId, ['cashbook'], [
    { unresolvedImportRowCount, records: [...records].sort((left, right) => left.id.localeCompare(right.id)) },
  ]);
}

export function documentSnapshot(workspaceId: string, documents: readonly SupportingDocument[]): AssistantSnapshot {
  return createAssistantSnapshot(workspaceId, ['documents'],
    [...documents].sort((left, right) => left.id.localeCompare(right.id)));
}

export function historySnapshot(workspaceId: string, history: AssistantHistory): AssistantSnapshot {
  return createAssistantSnapshot(workspaceId, ['history'], [history]);
}

export function combinedSnapshot(workspaceId: string, snapshots: readonly AssistantSnapshot[]): AssistantSnapshot {
  const sources = [...new Set(snapshots.flatMap(snapshot => snapshot.sources))].sort() as SnapshotSource[];
  if (snapshots.some(snapshot => snapshot.workspaceId !== workspaceId)) throw new Error('Assistant snapshot workspace mismatch');
  const ordered = [...snapshots].sort((left, right) =>
    left.sources.join(',').localeCompare(right.sources.join(',')) || left.token.localeCompare(right.token));
  return createAssistantSnapshot(workspaceId, sources, ordered);
}
