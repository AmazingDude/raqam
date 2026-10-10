import type { DocumentRecord } from '../contracts/documents.ts';

// Paginated document lists are owner-bound snapshots. Preserve the most recent
// correction when adjacent pages overlap, and reject cross-workspace records.
export function mergeDocumentPages(current:DocumentRecord[],incoming:DocumentRecord[],workspaceId:string):DocumentRecord[]{
 const merged=new Map<string,DocumentRecord>();
 for(const record of [...current,...incoming]){
  if(record.document.workspaceId!==workspaceId)throw new Error('Document page belongs to another workspace. Reload your workspace.');
  const id=record.document.id,previous=merged.get(id);
  if(!previous||record.reviewVersion>previous.reviewVersion)merged.set(id,record);
 }
 return [...merged.values()];
}
