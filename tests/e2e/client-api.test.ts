import test from 'node:test';
import assert from 'node:assert/strict';
import { api, cashSummarySchema, ClientError, exportResponse } from '../../src/lib/client/api.ts';

const id = '30000000-0000-4000-8000-000000000001';
const summary = { currency: 'PKR', inflowMinor: '90071992547409930', outflowMinor: '1', netMovementMinor: '90071992547409929', transactionCount: 1, transactionIds: [id], unresolvedImportRowCount: 2, categoryCoverage: { acceptedCount: 0, notAcceptedCount: 1 }, matchCoverage: { matchedCount: 0, notMatchedCount: 1 }, categories: {}, unreviewed: { inflowMinor: '90071992547409930', outflowMinor: '1', netMovementMinor: '90071992547409929' } };
function envelope(data: unknown, status = 200) { return Response.json({ data, error: null }, { status }); }

test('client summary validates exact cash, category reconciliation and complete scope without number rounding', () => {
  assert.equal(cashSummarySchema.parse(summary).inflowMinor, '90071992547409930');
  for (const invalid of [
    { ...summary, inflowMinor: 90071992547409930 }, { ...summary, inflowMinor: 'not-money' },
    { ...summary, netMovementMinor: '9.99' }, { ...summary, netMovementMinor: '0' },
    { ...summary, transactionCount: 2 }, { ...summary, transactionIds: [id, id], transactionCount: 2 },
    { ...summary, unreviewed: { ...summary.unreviewed, inflowMinor: '1' } },
    { ...summary, categoryCoverage: { acceptedCount: 2, notAcceptedCount: 0 } },
    { ...summary, matchCoverage: { matchedCount: 0, notMatchedCount: 0 } },
  ]) assert.equal(cashSummarySchema.safeParse(invalid).success, false);
});

test('client summary requests use validated optional inclusive date filters', async t => {
  const calls: { path: string; init: RequestInit }[] = [], signal = new AbortController().signal;
  t.mock.method(globalThis, 'fetch', async (path: string | URL | Request, init: RequestInit) => {
    calls.push({ path: String(path), init }); return envelope(summary);
  });
  await api.summary(signal, { dateFrom: '2026-10-01', dateTo: '2026-10-31' });
  assert.equal(calls[0]!.path, '/api/summary?dateFrom=2026-10-01&dateTo=2026-10-31');
  assert.equal(calls[0]!.init.signal, signal);
  assert.equal(calls[0]!.init.credentials, 'same-origin');
  assert.throws(() => api.summary(signal, { dateFrom: '2026-10-31', dateTo: '2026-10-01' }), error => error instanceof ClientError && error.code === 'INVALID_INPUT');
  assert.equal(calls.length, 1, 'invalid date ranges must not reach the server');
  t.mock.restoreAll();
});

test('client reads reject malformed successes and preserve actionable auth/conflict errors', async t => {
  const signal = new AbortController().signal;
  for (const response of [new Response('<html>sign in</html>'), envelope({ ...summary, inflowMinor: 0 })]) {
    t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(api.summary(signal), error => error instanceof ClientError && error.code === 'UNAVAILABLE');
    t.mock.restoreAll();
  }
  for (const code of ['UNAUTHENTICATED', 'CONFLICT']) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ data: null, error: { code, message: 'Reload before saving.' } }, { status: 409 }));
    await assert.rejects(api.transaction(id, signal), error => error instanceof ClientError && error.code === code && error.message === 'Reload before saving.');
    t.mock.restoreAll();
  }
});

test('client commands send exact shared-contract decisions, stable request IDs and abort signals', async t => {
  const calls: { path: string; init: RequestInit }[] = [], controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (path: string | URL | Request, init: RequestInit) => {
    calls.push({ path: String(path), init });
    return envelope({ importId: id, requestId: id, correctedCount: 0, rejectedCount: 1, remainingUnresolvedCount: 0, transactionIds: [], duplicate: calls.length > 1 });
  });
  const input = { requestId: id, rows: [{ rowNumber: 2, action: 'reject' as const }] };
  assert.equal((await api.resolveImport(id, input, controller.signal)).duplicate, false);
  assert.equal((await api.resolveImport(id, input, controller.signal)).duplicate, true);
  assert.equal(calls[0]!.init.body, calls[1]!.init.body);
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), input);
  assert.equal(calls[0]!.init.signal, controller.signal);
  assert.equal(calls[0]!.init.cache, 'no-store');
  assert.equal(calls[0]!.init.credentials, 'same-origin');
  assert.equal(calls[0]!.path, `/api/imports/${id}/resolutions`);
  assert.throws(() => api.reviewTransaction(id, { expectedVersion: 0, amountMinor: '0' } as never, controller.signal));
});

test('export only downloads verified CSV successes and surfaces failures without an error file', async () => {
  const csv = 'date,amount\r\n2026-10-10,100.01\r\n';
  const headers = { 'Content-Type': 'text/csv; charset=utf-8', 'X-Raqam-Transaction-Count': '1', 'X-Raqam-Unresolved-Import-Rows': '2' };
  assert.deepEqual(await exportResponse(new Response(csv, { headers })), { csv, transactionCount: 1, unresolved: 2 });
  for (const response of [new Response('<html>sign in</html>'), new Response(csv, { headers: { 'Content-Type': 'text/csv' } }),
    new Response(csv, { headers: { ...headers, 'X-Raqam-Unresolved-Import-Rows': '-1' } }),
    new Response(csv, { headers: { ...headers, 'X-Raqam-Transaction-Count': '50001' } })]) {
    await assert.rejects(exportResponse(response), error => error instanceof ClientError && error.code === 'UNAVAILABLE');
  }
  await assert.rejects(exportResponse(Response.json({ data: null, error: { code: 'UNAUTHENTICATED', message: 'Sign in again.' } }, { status: 401 })), error => error instanceof ClientError && error.code === 'UNAUTHENTICATED');
});

test('receipt client routes register, extract, and persist review with bounded same-origin requests', async t => {
  const workspaceId='30000000-0000-4000-8000-000000000002',sourceId='30000000-0000-4000-8000-000000000003';
  const fields={counterparty:null,date:null,totalMinor:null,currency:null,reference:null};
  const pending={document:{id,workspaceId,source:{sourceId,rowNumber:null},extractedFields:fields,correctedFields:null,extractionStatus:'pending',reviewStatus:'needs_review',modelVersion:null,promptVersion:null},reviewVersion:0,schemaVersion:null,extractionFailure:null};
  const failed={...pending,document:{...pending.document,extractionStatus:'failed' as const},reviewVersion:1,schemaVersion:null,extractionFailure:'provider_timeout' as const};
  const reviewedFields={counterparty:null,date:'2026-10-10',totalMinor:'10005',currency:'PKR',reference:null} as const;
  const reviewed={document:{...pending.document,extractedFields:reviewedFields,correctedFields:reviewedFields,extractionStatus:'complete' as const,reviewStatus:'accepted' as const,modelVersion:'synthetic-model',promptVersion:'receipt-v1'},reviewVersion:2,schemaVersion:'receipt-schema-v1',extractionFailure:null};
  const calls:{path:string;init:RequestInit}[]=[];
  const responses=[
    {record:pending,duplicate:false},
    {requestId:id,cacheHit:false,state:'failed',record:failed,currentRecord:failed},
    {requestId:id,record:reviewed,duplicate:false,currentRecord:reviewed},
  ];
  t.mock.method(globalThis,'fetch',async(path:string|URL|Request,init:RequestInit)=>{
    calls.push({path:String(path),init});return envelope(responses[calls.length-1]);
  });
  const signal=new AbortController().signal;
  assert.equal((await api.registerDocument(sourceId,signal)).record.document.id,id);
  assert.equal((await api.extractDocument(id,{requestId:id,expectedVersion:0},signal)).currentRecord.document.extractionStatus,'failed');
  assert.equal((await api.reviewDocument(id,{requestId:id,expectedVersion:1,action:'accept',fields:reviewedFields},signal)).currentRecord.document.reviewStatus,'accepted');
  assert.deepEqual(calls.map(call=>call.path),['/api/documents',`/api/documents/${id}/extraction`,`/api/documents/${id}`]);
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)),{sourceId});
  assert.deepEqual(JSON.parse(String(calls[1]!.init.body)),{requestId:id,expectedVersion:0});
  assert.equal(JSON.parse(String(calls[2]!.init.body)).fields.counterparty,null,'merchant remains optional for acceptance');
  assert.ok(calls.every(call=>call.init.cache==='no-store'&&call.init.credentials==='same-origin'&&call.init.signal===signal));
  assert.throws(()=>api.reviewDocument(id,{requestId:id,expectedVersion:2,action:'accept',fields} as never,signal));
});

test('category proposal client supports list, empty no-op reruns and versioned review decisions', async t => {
  const proposal={id:'30000000-0000-4000-8000-000000000004',workspaceId:id,transactionId:'30000000-0000-4000-8000-000000000005',transactionVersion:1,reviewVersion:0,rationale:'The row names a software subscription.',status:'accepted',provenance:{modelVersion:'synthetic-model',promptVersion:'categories-v1',schemaVersion:'categories-schema-v1'},suggestion:{kind:'category',category:'software_services'}};
  const calls:{path:string;init:RequestInit}[]=[];
  const responses=[
    {items:[],nextCursor:proposal.id},
    {items:[],nextCursor:null},
    {requestId:id,items:[],duplicate:true},
    {requestId:id,proposal,reviewDecisionId:'30000000-0000-4000-8000-000000000006',affectedTransactionIds:[proposal.transactionId],match:null,duplicate:false},
  ];
  t.mock.method(globalThis,'fetch',async(path:string|URL|Request,init:RequestInit)=>{
    calls.push({path:String(path),init});return envelope(responses[calls.length-1]);
  });
  const signal=new AbortController().signal;
  assert.equal((await api.categoryProposals(signal,'pending')).nextCursor,proposal.id);
  assert.equal((await api.categoryProposals(signal,'pending',proposal.id)).items.length,0);
  assert.equal((await api.generateCategoryProposals({requestId:id,transactionIds:[proposal.transactionId]},signal)).duplicate,true);
  const result=await api.reviewProposal({requestId:id,proposalId:proposal.id,expectedVersion:0,decision:'accept'},signal);
  assert.equal(result.proposal.status,'accepted');
  assert.deepEqual(calls.map(call=>call.path),[
    '/api/category-proposals?limit=50&status=pending',
    `/api/category-proposals?limit=50&status=pending&cursor=${proposal.id}`,
    '/api/category-proposals', '/api/reviews',
  ]);
  assert.deepEqual(JSON.parse(String(calls[2]!.init.body)),{requestId:id,transactionIds:[proposal.transactionId]});
  assert.deepEqual(JSON.parse(String(calls[3]!.init.body)),{requestId:id,proposalId:proposal.id,expectedVersion:0,decision:'accept'});
  assert.ok(calls.every(call=>call.init.cache==='no-store'&&call.init.credentials==='same-origin'&&call.init.signal===signal));
});

test('category pages retain explicit cursors and use same-origin uncached scoped reads',async t=>{
  const signal=new AbortController().signal,cursor='30000000-0000-4000-8000-000000000010';
  const calls:{path:string;init:RequestInit}[]=[];
  t.mock.method(globalThis,'fetch',async(path:string|URL|Request,init:RequestInit)=>{calls.push({path:String(path),init});return envelope({items:[],nextCursor:cursor});});
  assert.equal((await api.categoryProposals(signal)).nextCursor,cursor);
  await api.categoryProposals(signal,'all',cursor);
  assert.deepEqual(calls.map(call=>call.path),['/api/category-proposals?limit=50&status=all',`/api/category-proposals?limit=50&status=all&cursor=${cursor}`]);
  assert.ok(calls.every(call=>call.init.signal===signal&&call.init.credentials==='same-origin'&&call.init.cache==='no-store'));
});

test('proposal review history is scoped to its proposal and validates versions and cursors',async t=>{
  const workspaceId='30000000-0000-4000-8000-000000000002',proposalId='30000000-0000-4000-8000-000000000004';
  const proposal={id:proposalId,workspaceId,transactionId:'30000000-0000-4000-8000-000000000005',transactionVersion:1,reviewVersion:1,rationale:'The row names a software subscription.',status:'accepted',provenance:{modelVersion:'synthetic-model',promptVersion:'categories-v1',schemaVersion:'categories-schema-v1'},suggestion:{kind:'category',category:'software_services'}};
  const previous={...proposal,reviewVersion:0,status:'proposed'};
  const item={id:'30000000-0000-4000-8000-000000000006',workspaceId,targetId:proposalId,actorSubject:'synthetic-owner',decision:{decision:'accept'},previous,current:proposal,reviewVersion:1,createdAt:'2026-10-10T00:00:00Z'};
  const signal=new AbortController().signal,calls:{path:string;init:RequestInit}[]=[];
  let response:unknown={items:[item],nextCursor:'1'};
  t.mock.method(globalThis,'fetch',async(path:string|URL|Request,init:RequestInit)=>{calls.push({path:String(path),init});return envelope(response);});
  const page=await api.proposalReviews(proposalId,workspaceId,signal);
  assert.equal(page.items[0]!.current.status,'accepted');
  response={items:[],nextCursor:null};await api.proposalReviews(proposalId,workspaceId,signal,'1');
  assert.ok(calls[0]!.path.endsWith(`/api/reviews?proposalId=${proposalId}&limit=20&cursor=0`));
  assert.ok(calls[1]!.path.endsWith('&cursor=1'));
  assert.ok(calls.every(call=>call.init.signal===signal&&call.init.credentials==='same-origin'&&call.init.cache==='no-store'));
  for(const invalid of [
    {items:[{...item,targetId:workspaceId}],nextCursor:null},
    {items:[{...item,workspaceId:'30000000-0000-4000-8000-000000000007'}],nextCursor:null},
    {items:[item,item],nextCursor:null},
    {items:[item],nextCursor:'2'},
  ]){response=invalid;await assert.rejects(api.proposalReviews(proposalId,workspaceId,signal),error=>error instanceof ClientError&&error.code==='UNAVAILABLE');}
  const count=calls.length;await assert.rejects(api.proposalReviews(proposalId,workspaceId,signal,'bad'),error=>error instanceof ClientError&&error.code==='INVALID_INPUT');assert.equal(calls.length,count);
});

test('document history preserves unknown fields and fences source, owner scope, ordering and cursors',async t=>{
  const workspaceId='30000000-0000-4000-8000-000000000002',sourceId='30000000-0000-4000-8000-000000000003';
  const fields={counterparty:null,date:null,totalMinor:null,currency:null,reference:null};
  const previous={document:{id,workspaceId,source:{sourceId,rowNumber:null},extractedFields:fields,correctedFields:null,extractionStatus:'pending',reviewStatus:'needs_review',modelVersion:null,promptVersion:null},reviewVersion:0,schemaVersion:null,extractionFailure:null};
  const item={id:'30000000-0000-4000-8000-000000000004',workspaceId,targetId:id,actorSubject:'synthetic-owner',operation:'review',previous,current:{...previous,reviewVersion:1},reviewVersion:1,createdAt:'2026-10-10T00:00:00Z'};
  const signal=new AbortController().signal,calls:{path:string;init:RequestInit}[]=[];
  let response:unknown={items:[item],nextCursor:'1'};
  t.mock.method(globalThis,'fetch',async(path:string|URL|Request,init:RequestInit)=>{calls.push({path:String(path),init});return envelope(response);});
  assert.equal((await api.documentHistory(id,workspaceId,signal)).items[0]!.current.document.extractedFields.totalMinor,null);
  response={items:[],nextCursor:null};await api.documentHistory(id,workspaceId,signal,'1');
  assert.ok(calls[1]!.path.endsWith('?limit=20&cursor=1'));
  assert.ok(calls.every(call=>call.init.signal===signal&&call.init.credentials==='same-origin'&&call.init.cache==='no-store'));
  for(const invalid of [
    {items:[{...item,targetId:sourceId}],nextCursor:null},
    {items:[{...item,workspaceId:sourceId}],nextCursor:null},
    {items:[item,item],nextCursor:null},
    {items:[item],nextCursor:'2'},
  ]){response=invalid;await assert.rejects(api.documentHistory(id,workspaceId,signal),error=>error instanceof ClientError&&error.code==='UNAVAILABLE');}
  const callCount=calls.length;await assert.rejects(api.documentHistory(id,workspaceId,signal,'bad'),error=>error instanceof ClientError&&error.code==='INVALID_INPUT');assert.equal(calls.length,callCount,'invalid cursors make no request');
});
