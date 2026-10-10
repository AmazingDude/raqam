'use client';
// Synthetic component verification only: no sign-in, Supabase or provider calls.
import { useState } from 'react';
import { DocumentsScreen } from '../../src/components/workspace/documents-screen.tsx';
import { InvoicePreview } from '../../src/components/workspace/invoices/invoice-preview.tsx';
import { ReceiptEvidence } from '../../src/components/workspace/receipt-evidence.tsx';
import { documentRecordSchema, type DocumentRecord } from '../../src/lib/contracts/documents.ts';
import { syntheticInvoice } from '../helpers/invoice-fixture.ts';
import s from '../../src/components/ui/theme.module.css';

const sourceId = '10000000-0000-4000-8000-000000000001', documentId = '10000000-0000-4000-8000-000000000002', workspaceId = '10000000-0000-4000-8000-000000000003';
const values = { counterparty:'Synthetic Electric', date:'2026-10-10', totalMinor:'450000', currency:'PKR', reference:'SYN-104' };
function fixture(kind: 'clean' | 'ambiguous' | 'failure'): DocumentRecord {
  const failed = kind === 'failure', ambiguous = kind === 'ambiguous';
  const fields = failed ? { counterparty:null, date:null, totalMinor:null, currency:null, reference:null } : { ...values, totalMinor:ambiguous ? null : values.totalMinor };
  const observed = (name: string, value: string) => ({ rawText:value, observedCandidates:[value], normalizedValue:value, state:'observed', evidenceField:name, issues:[] });
  const hash = 'a'.repeat(64);
  return documentRecordSchema.parse({ document:{ id:documentId,workspaceId,source:{sourceId,rowNumber:null},extractedFields:fields,correctedFields:ambiguous ? values : null,
    extractionStatus:failed ? 'failed' : 'complete', reviewStatus:ambiguous ? 'accepted' : 'needs_review',modelVersion:failed ? null : 'synthetic-model',promptVersion:failed ? null : 'synthetic-prompt-v1' },
    reviewVersion:ambiguous ? 1 : 0,schemaVersion:failed ? null : 'synthetic-schema-v1',extractionFailure:failed ? 'provider_timeout' : null,
    extractionContext:{identity:{ownerId:'synthetic-owner',workspaceId,sourceHash:hash,provider:'gemini',providerVersion:'synthetic-v1',modelId:'synthetic-model',promptVersion:'synthetic-prompt-v1',schemaVersion:'synthetic-schema-v1',preprocessingVersion:'synthetic-v1',cacheKey:hash},
      failure:failed ? {reason:'provider_timeout',retryable:true,retryAfterMs:null} : null,
      evidence:failed ? null : {sourceId,sourceVersion:hash,status:ambiguous ? 'needs_review' : 'proposed',blockers:ambiguous ? ['multiple_totals'] : [],fields:{
        merchant:observed('merchant',values.counterparty),documentDate:observed('document_date',values.date),currency:observed('currency',values.currency),reference:observed('reference',values.reference),
        total:ambiguous ? {rawText:'4,500 / 45,000',observedCandidates:['4,500','45,000'],normalizedValue:null,state:'ambiguous',evidenceField:'total',issues:['multiple_totals']} : observed('total',values.totalMinor),
      }}} });
}

export default function Person2BrowserHarness({ initialCase='ambiguous', initialPreview=false }: { initialCase?:'clean'|'ambiguous'|'failure'; initialPreview?:boolean }) {
  const [kind,setKind] = useState<'clean'|'ambiguous'|'failure'>(initialCase), [record,setRecord] = useState(() => fixture(initialCase)), [preview,setPreview] = useState(initialPreview);
  return <div className={s.root} data-raqam-ui><main className={s.stack} style={{maxWidth:1100,margin:'24px auto',padding:20}}>
    <p className={s.notice}>Synthetic Person 2 component checks. Every source and saved record here is simulated; changes reset on reload. No external service is called.</p>
    <div className={s.actions}>{(['clean','ambiguous','failure'] as const).map(next => <button className={s.secondary} type="button" key={next} onClick={() => {setKind(next);setRecord(fixture(next));}}>{next} receipt fixture</button>)}<button className={s.button} type="button" onClick={() => setPreview(true)}>Open saved invoice preview</button></div>
    <DocumentsScreen key={kind} demo={false} documents={[record.document]} liveRecords={[record]} sources={[]} onExtractDocument={async () => {setRecord(fixture(kind));}} onSave={async (_id,fields,accepted) => {setRecord(current => documentRecordSchema.parse({...current,reviewVersion:current.reviewVersion+1,document:{...current.document,correctedFields:fields,reviewStatus:accepted ? 'accepted' : 'needs_review'}}));}}/>
    <ReceiptEvidence record={record}/>
    {preview && <InvoicePreview invoice={{...syntheticInvoice(),note:'Synthetic note <script>alert(1)</script>',reviewVersion:3}} onClose={() => setPreview(false)}/>}
  </main></div>;
}
