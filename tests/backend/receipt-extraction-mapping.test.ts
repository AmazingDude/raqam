import test from 'node:test';
import assert from 'node:assert/strict';
import { mapReceiptExtraction } from '../../src/lib/server/receipt-extraction-mapping.ts';
import { receiptFailureSchema } from '../../src/lib/contracts/receipt-extraction.ts';
import { extractReceipt } from '../../src/lib/ai/extraction.ts';
import { RECEIPT_EXTRACTION_PROMPT_VERSION,RECEIPT_EXTRACTION_SCHEMA_VERSION } from '../../src/lib/ai/prompts/extraction.ts';
import type { ProviderFailureReason,ProviderMetadata } from '../../src/lib/ai/provider.ts';
const sourceId='30000000-0000-4000-8000-000000000001',hash='a'.repeat(64);
const image=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWQAAAABJRU5ErkJggg==','base64'));
const expected={modelVersion:'synthetic-model',promptVersion:RECEIPT_EXTRACTION_PROMPT_VERSION,schemaVersion:RECEIPT_EXTRACTION_SCHEMA_VERSION};
const metadata:ProviderMetadata={requestId:'30000000-0000-4000-8000-000000000002',mode:'image',model:expected.modelVersion,
 providerVersion:'groq-provider-v1',promptVersion:expected.promptVersion,schemaVersion:expected.schemaVersion,attempts:1,durationMs:1,providerRequestIds:[],usage:null};
test('C extraction maps to canonical persisted raw observations without guessing ambiguous required fields',async()=>{
 const result=await extractReceipt({source:{sourceId,rowNumber:null},sourceVersion:hash,mime:'image/png',bytes:image},
 {requestImageExtraction:async()=>({ok:true,output:{counterpartyText:' Merchant ',dateText:'10/11/2026',totalText:'100.05',totalCandidates:['100.05','200.05'],
 currencyText:'PKR',referenceText:null,unreadableFields:[]},metadata})},{requestId:metadata.requestId!,deadlineAtMs:Date.now()+1000});
 const mapped=mapReceiptExtraction(result,sourceId,hash,expected); assert.equal(mapped.status,'complete');
 if(mapped.status!=='complete')return;
 assert.equal(mapped.fields.date,null); assert.equal(mapped.fields.totalMinor,null); assert.equal(mapped.evidence.fields.merchant.rawText,' Merchant ');
 assert.deepEqual(mapped.evidence.fields.total.observedCandidates,['100.05','200.05']);
 assert.equal(mapped.evidence.sourceId,sourceId);
 assert.throws(()=>mapReceiptExtraction(result,'30000000-0000-4000-8000-000000000099',hash,expected));
});
test('every C provider failure has an explicit durable safe mapping with cancellation and budget reasons retained',()=>{
 for(const reason of receiptFailureSchema.shape.reason.options) {
  const mapped=mapReceiptExtraction({ok:false,error:{reason:reason as ProviderFailureReason,retryable:false,retryAfterMs:null},metadata},sourceId,hash,expected);
  assert.equal(mapped.status,'failed'); if(mapped.status!=='failed')continue;
  assert.equal(mapped.failure.reason,reason);
  if(['provider_timeout','deadline_exceeded'].includes(reason))assert.equal(mapped.reason,'provider_timeout');
  else if(['provider_rate_limited','budget_exhausted'].includes(reason))assert.equal(mapped.reason,'provider_rate_limited');
  else if(reason==='invalid_model_output')assert.equal(mapped.reason,'invalid_model_output');
  else assert.equal(mapped.reason,'provider_unavailable');
 }
});
