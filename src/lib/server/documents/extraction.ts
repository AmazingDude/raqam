import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { RequestSession } from '../auth.ts';
import type { Workspace } from '../../contracts/index.ts';
import { documentExtractionRequestSchema, documentRecordSchema, receiptExtractionResponseSchema } from '../../contracts/documents.ts';
import { receiptIdentitySchema } from '../../contracts/receipt-extraction.ts';
import { createGroqProvider } from '../../ai/provider.ts';
import { readProviderConfiguration, PROVIDER_VERSION } from '../../ai/config.ts';
import { extractReceipt, createExtractionCacheIdentity } from '../../ai/extraction.ts';
import { RECEIPT_EXTRACTION_PROMPT_VERSION, RECEIPT_EXTRACTION_SCHEMA_VERSION } from '../../ai/prompts/extraction.ts';
import { readScopedReceiptInput } from './source.ts';
import { readDocument, documentDatabaseError } from './persistence.ts';
import { mapReceiptExtraction } from '../receipt-extraction-mapping.ts';
import { BackendError } from '../errors.ts';

const reservationSchema = z.discriminatedUnion('state',[
  z.object({state:z.literal('reserved'),requestId:z.uuid(),expiresAt:z.iso.datetime({offset:true}),currentRecord:documentRecordSchema}),
  z.object({state:z.literal('busy'),requestId:z.uuid(),expiresAt:z.iso.datetime({offset:true}),currentRecord:documentRecordSchema}),
  z.object({state:z.literal('cached'),requestId:z.uuid(),record:documentRecordSchema,currentRecord:documentRecordSchema}),
]);
type RuntimeDependencies={environment?:()=>Record<string,string|undefined>;fetch?:typeof globalThis.fetch};
export async function extractDocument(session: RequestSession, workspace: Workspace, id: string, request: Request, body: unknown,
  operation: { deadlineAtMs?: number } = {}, runtime:RuntimeDependencies={}) {
  const deadlineAtMs=operation.deadlineAtMs ?? Date.now()+50_000;
  if(!Number.isFinite(deadlineAtMs) || deadlineAtMs>Date.now()+50_000 || Date.now()>=deadlineAtMs || request.signal.aborted)
    throw new BackendError('UNAVAILABLE','Receipt extraction was cancelled or its deadline expired.');
  const input=documentExtractionRequestSchema.safeParse(body);
  if (!input.success) throw new BackendError('INVALID_INPUT','Provide the extraction request ID and current document version.');
  if (workspace.ownerSubject!==session.subject) throw new BackendError('NOT_FOUND','Workspace not found.');
  const current=await readDocument(session,workspace,id);
  const environment=runtime.environment?.() ?? process.env;
  const liveConfiguration=readProviderConfiguration(environment);
  // Cache lookup needs versions, not credentials. A cache miss still requires
  // verified runtime configuration before allowance/source reads or inference.
  const configuration=liveConfiguration ?? readProviderConfiguration({...environment,GROQ_API_KEY:'cache-only'});
  if (!configuration || (environment.AI_PROVIDER && environment.AI_PROVIDER!=='groq'))
    throw new BackendError('UNAVAILABLE','Receipt extraction is not configured. Ask the team to configure the verified Groq runtime.');
  const { requestId,expectedVersion }=input.data;
  if(Date.now()>=deadlineAtMs)throw new BackendError('UNAVAILABLE','Receipt extraction deadline expired.');
  const controller=new AbortController();
  const onAbort=()=>controller.abort();
  if(request.signal.aborted) controller.abort(); else request.signal.addEventListener('abort',onAbort,{once:true});
  const timer=setTimeout(()=>controller.abort(),Math.max(0,deadlineAtMs-Date.now()));
  async function rpc(name:string,args:Record<string,unknown>,signal:AbortSignal=controller.signal) {
    const result=await session.database.rpc(name,args).abortSignal(signal);
    if(result.error) throw documentDatabaseError(result.error); return result.data;
  }
  try {
    const sourceId=current.document.source.sourceId;
    const metadata=await session.database.from('sources').select('content_hash').eq('workspace_id',workspace.id).eq('id',sourceId)
      .eq('source_type','receipt_image').eq('status','complete').abortSignal(controller.signal).maybeSingle();
    if(metadata.error) throw documentDatabaseError(metadata.error);
    const sourceHash=z.string().regex(/^[a-f0-9]{64}$/).safeParse(metadata.data?.content_hash);
    if(!sourceHash.success) throw new BackendError('NOT_FOUND','Receipt source not found.');
    const provenance={modelVersion:configuration.visionModel,promptVersion:RECEIPT_EXTRACTION_PROMPT_VERSION,schemaVersion:RECEIPT_EXTRACTION_SCHEMA_VERSION};
    const processing={ownerId:session.subject,workspaceId:workspace.id,sourceHash:sourceHash.data,provider:'groq' as const,
      providerVersion:PROVIDER_VERSION,modelId:configuration.visionModel,promptVersion:provenance.promptVersion,schemaVersion:provenance.schemaVersion,
      preprocessingVersion:'receipt-image-bytes-v1'};
    const identity=receiptIdentitySchema.parse({...processing,cacheKey:createExtractionCacheIdentity(processing)});
    const reservation=reservationSchema.parse(await rpc('reserve_receipt_extraction',{
      p_document_id:id,p_request_id:requestId,p_expected_version:expectedVersion,p_provenance:provenance,p_identity:identity,
    }));
    if(reservation.currentRecord.document.id!==id || reservation.currentRecord.document.workspaceId!==workspace.id)
      throw new BackendError('UNAVAILABLE','Receipt reservation could not be verified.');
    if(reservation.state==='busy') throw new BackendError('CONFLICT','Receipt extraction is already running. Reload before retrying.');
    if(reservation.state==='cached') return receiptExtractionResponseSchema.parse({
      state:reservation.record.document.extractionStatus==='failed'?'failed':'cached',cacheHit:true,requestId,record:reservation.record,currentRecord:reservation.currentRecord,
    });
    let outcome; let stage:'allowance'|'source'|'provider'='allowance';
    try {
      if(!liveConfiguration)outcome={status:'failed',reason:'provider_unavailable',failure:{reason:'configuration_missing',retryable:false,retryAfterMs:null}};
      else {
      const allowance=await rpc('reserve_receipt_provider_allowance',{p_document_id:id,p_request_id:requestId,
        p_account_fingerprint:createHash('sha256').update(configuration.apiKey).digest('hex')});
      if(typeof allowance!=='boolean') throw new BackendError('UNAVAILABLE','Extraction request allowance could not be verified.');
      if(!allowance) outcome={status:'failed',reason:'provider_rate_limited',failure:{reason:'budget_exhausted',retryable:true,retryAfterMs:null}};
      else {
        stage='source';
        const image=await readScopedReceiptInput(session,workspace,sourceId,{deadlineAt:deadlineAtMs,signal:controller.signal});
        stage='provider';
        let remaining=2;
        const result=await extractReceipt({source:{sourceId,rowNumber:null},sourceVersion:sourceHash.data,mime:image.mime,bytes:image.bytes},
          createGroqProvider({environment:()=>({GROQ_API_KEY:configuration.apiKey,GROQ_VISION_MODEL:configuration.visionModel,GROQ_TEXT_MODEL:configuration.textModel}),
            ...(runtime.fetch?{fetch:runtime.fetch}:{})}),
          {requestId,deadlineAtMs,signal:controller.signal,budget:{take:()=>remaining-- > 0}});
        outcome=mapReceiptExtraction(result,sourceId,sourceHash.data,provenance);
      }
      }
    } catch(error) {
      if(error instanceof BackendError && error.code==='CONFLICT') throw error;
      const reason=request.signal.aborted?'cancelled':Date.now()>=deadlineAtMs?'deadline_exceeded':stage==='allowance'?'budget_unavailable':'provider_unavailable';
      outcome={status:'failed',reason:reason==='deadline_exceeded'?'provider_timeout':'provider_unavailable',
        failure:{reason,retryable:reason!=='cancelled',retryAfterMs:null}};
    }
    // Persist the terminal result even if the client cancels; detached, bounded
    // cleanup retains the existing lease/version fence and never retries inference.
    const saved=await rpc('save_receipt_extraction',{p_document_id:id,p_request_id:requestId,p_expected_version:expectedVersion,p_outcome:outcome},AbortSignal.timeout(5000));
    return receiptExtractionResponseSchema.parse({requestId,cacheHit:false,state:outcome.status==='complete'?'live':'failed',record:saved.record,currentRecord:saved.currentRecord});
  } finally {clearTimeout(timer); request.signal.removeEventListener('abort',onAbort); controller.abort();}
}
