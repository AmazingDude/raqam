import test from 'node:test';
import assert from 'node:assert/strict';
import type { DocumentRecord } from '../../src/lib/contracts/documents.ts';
import { mergeDocumentPages } from '../../src/lib/client/document-pages.ts';

const workspaceId='70000000-0000-4000-8000-000000000001';
const id='70000000-0000-4000-8000-000000000002';
function record(reviewVersion:number,counterparty:string|null):DocumentRecord {
  return {document:{id,workspaceId,source:{sourceId:'70000000-0000-4000-8000-000000000003',rowNumber:null},
    extractedFields:{counterparty,date:null,totalMinor:null,currency:null,reference:null},correctedFields:counterparty?{counterparty,date:null,totalMinor:null,currency:null,reference:null}:null,
    extractionStatus:'pending',reviewStatus:'needs_review',modelVersion:null,promptVersion:null},reviewVersion,schemaVersion:null,extractionFailure:null};
}

test('document page merges keep one record and prefer the newest review snapshot',()=>{
  const older=record(0,null),newer=record(1,'Corrected merchant');
  const merged=mergeDocumentPages([older],[newer],workspaceId);
  assert.equal(merged.length,1);
  assert.equal(merged[0]!.reviewVersion,1);
  assert.equal(merged[0]!.document.correctedFields?.counterparty,'Corrected merchant');
});

test('document page merges reject records from another workspace',()=>{
  assert.throws(()=>mergeDocumentPages([],[{...record(0,null),document:{...record(0,null).document,workspaceId:'70000000-0000-4000-8000-000000000099'}}],workspaceId),/another workspace/);
});
