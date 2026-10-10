import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareMatchCandidates, proposeMatches } from '../../src/lib/ai/matching.ts';
import { document, input, transaction } from './fixtures/matching/records.ts';
import type { MatchingRequest } from '../../src/lib/ai/matching.ts';
import type { SemanticMatchResponse } from '../../src/lib/ai/prompts/matching.ts';
import { calculateCashSummary } from '../../src/lib/server/summary.ts';

// Scripted external model responses test validation, not semantic accuracy.
function semantic(request: MatchingRequest, relation: 'alias' | 'uncertain' = 'alias'): SemanticMatchResponse {
  return {
    candidates: request.data.candidates.map(candidate => ({
      transactionId: candidate.transactionId, relation,
      supportingEvidence: relation === 'alias' ? [{ kind: 'merchant_relation', refs: ['document.counterparty', candidate.refs.description] }] : [],
      conflictingEvidence: [],
    })),
    recommendedTransactionId: request.data.candidates.length === 1 && relation === 'alias' ? request.data.candidates[0]!.transactionId : null,
  };
}

function run(raw: ReturnType<typeof input>, rank: (request: MatchingRequest) => Promise<unknown>) {
  return proposeMatches(raw, { rank, readCurrentInput: async () => raw, deadline: Date.now() + 5000, signal: new AbortController().signal });
}

test('exact preparation preserves distinct equal-value IDs, direction and delayed dates', () => {
  const result = prepareMatchCandidates(input([
    transaction('tx-1'),
    transaction('original-id-2', { source: { sourceId: 'csv-1', rowNumber: 3 }, direction: 'in', date: '2027-01-08' }),
    transaction('off-by-one', { source: { sourceId: 'csv-1', rowNumber: 4 }, amountMinor: '450001' }),
  ]));
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.candidates.map(candidate => candidate.transaction.id), ['tx-1', 'original-id-2']);
  assert.equal(result.candidates[1]?.transaction.direction, 'in');
  assert.equal(result.candidates[1]?.features.dateGapDays, 92);
  assert.deepEqual(result.excluded, [{ transactionId: 'off-by-one', reason: 'amount_mismatch' }]);
});

test('reviewed corrections replace extraction without filling missing corrected fields', () => {
  const raw = input();
  raw.document.record.correctedFields = { ...raw.document.record.extractedFields, totalMinor: '450001' };
  assert.equal(prepareMatchCandidates(raw).reason, 'no_compatible_candidates');
  raw.document.record.correctedFields.totalMinor = null;
  assert.equal(prepareMatchCandidates(raw).reason, 'missing_financial_fields');
});

test('missing or unreviewed financial fields block; no defaults or currency conversion', () => {
  for (const field of ['date', 'totalMinor', 'currency'] as const) {
    const raw = input(); raw.document.record.extractedFields[field] = null;
    assert.equal(prepareMatchCandidates(raw).reason, 'missing_financial_fields', field);
  }
  assert.equal(prepareMatchCandidates(input([], document({ reviewStatus: 'proposed' }))).reason, 'unreviewed_document');
  const usd = input(); usd.document.record.extractedFields.currency = 'USD';
  const result = prepareMatchCandidates(usd);
  assert.equal(result.reason, 'no_compatible_candidates');
  assert.deepEqual(result.excluded, [{ transactionId: 'tx-1', reason: 'currency_mismatch' }]);
});

test('exact large integer comparison, zero and unsupported split amounts are preserved', () => {
  const raw = input([transaction('large', { amountMinor: '9223372036854775807' })]);
  raw.document.record.extractedFields.totalMinor = '9223372036854775806';
  assert.equal(prepareMatchCandidates(raw).candidates.length, 0);
  raw.document.record.extractedFields.totalMinor = '9223372036854775807';
  assert.equal(prepareMatchCandidates(raw).candidates.length, 1);
  raw.document.record.extractedFields.totalMinor = '0'; raw.transactions[0]!.record.amountMinor = '0';
  assert.equal(prepareMatchCandidates(raw).candidates.length, 1);
  const split = input([transaction('half-1', { amountMinor: '225000' }), transaction('half-2', { amountMinor: '225000', source: { sourceId: 'csv-1', rowNumber: 3 } })]);
  assert.equal(prepareMatchCandidates(split).reason, 'no_compatible_candidates');
  assert.equal(prepareMatchCandidates(input([])).reason, 'empty_pool');
});

test('active allocations exclude candidates and block an already allocated document', () => {
  const match = { id: 'match-1', workspaceId: 'workspace-1', transactionId: 'tx-1', documentId: 'other-doc', reviewDecisionId: 'decision-1' };
  const raw = input([transaction('tx-1', { matchStatus: 'accepted' })], document(), [match]);
  assert.equal(prepareMatchCandidates(raw).reason, 'all_allocated');
  raw.allocations.items[0]!.documentId = 'doc-1';
  assert.equal(prepareMatchCandidates(raw).reason, 'document_allocated');
});

test('incomplete, invalid, foreign, duplicated or inconsistent snapshots fail closed', () => {
  const invalid: unknown[] = [
    { ...input(), pool: { complete: false, revision: 'pool-1' } },
    { ...input(), allocations: { complete: false, version: 1, items: [] } },
    input([transaction('foreign', { workspaceId: 'elsewhere' })]),
    input([transaction(), transaction()]),
    input([transaction('tx-1', { matchStatus: 'accepted' })]),
    input([transaction('bad', { amountMinor: '450000.0' })]),
    input([transaction('bad', { date: '2026-02-30' })]),
    { ...input(), document: { record: document(), version: -1 } },
    input(Array.from({ length: 51 }, (_, i) => transaction(`tx-${i}`, { source: { sourceId: 'csv-1', rowNumber: i + 2 } }))),
  ];
  for (const raw of invalid) assert.equal(prepareMatchCandidates(raw).reason, 'invalid_input');
});

test('A initial review version zero is valid and preserved', () => {
  const raw = input(); raw.document.version = 0; raw.transactions[0]!.version = 0; raw.allocations.version = 0;
  const result = prepareMatchCandidates(raw);
  assert.equal(result.status, 'ready'); assert.equal(result.snapshot?.documentVersion, 0);
  assert.equal(result.snapshot?.transactionVersions[0]?.version, 0);
});

test('reference comparison is exact and missing counterparty is never invented', () => {
  const raw = input([transaction('different-case', { reference: 'bd-104' })], document());
  assert.equal(prepareMatchCandidates(raw).candidates[0]?.features.reference, 'conflict');
  raw.document.record.extractedFields.counterparty = null;
  raw.document.record.extractedFields.reference = ' ';
  const result = prepareMatchCandidates(raw);
  assert.equal(result.candidates[0]?.features.reference, 'missing');
  assert.equal(result.evidence.find(ref => ref.id === 'document.counterparty')?.value, null);
});

test('semantic merchant alias plus verified reference yields a reviewable proposal', async () => {
  const raw = input();
  const result = await proposeMatches(raw, {
    deadline: Date.now() + 5000, signal: new AbortController().signal,
    readCurrentInput: async () => raw,
    rank: async request => {
      assert.equal(request.data.candidates.length, 1);
      const candidate = request.data.candidates[0]!;
      return { candidates: [{ transactionId: candidate.transactionId, relation: 'alias', supportingEvidence: [
        { kind: 'merchant_relation', refs: ['document.counterparty', candidate.refs.description] },
        { kind: 'reference_agreement', refs: ['document.reference', candidate.refs.reference] },
      ], conflictingEvidence: [] }], recommendedTransactionId: candidate.transactionId };
    },
  });
  assert.equal(result.status, 'proposed');
  assert.equal(result.recommendedTransactionId, 'tx-1');
  assert.equal(result.candidates[0]?.strength, 'corroborated');
  assert.equal(raw.transactions[0]?.record.matchStatus, 'unmatched');
});

test('blocked, allocated, mismatched and empty inputs never invoke the model', async () => {
  const missing = input(); missing.document.record.extractedFields.currency = null;
  const mismatched = input([transaction('different', { amountMinor: '449999' })]);
  for (const raw of [missing, mismatched, input([]), input([], document({ reviewStatus: 'needs_review' }))]) {
    let calls = 0;
    const result = await run(raw, async () => { calls++; throw new Error('must not execute'); });
    assert.equal(calls, 0); assert.equal(result.recommendedTransactionId, null);
  }
});

test('model sees only financially compatible unallocated candidates with original IDs', async () => {
  const raw = input([
    transaction('wrong-amount', { amountMinor: '449999' }),
    transaction('allocated', { matchStatus: 'accepted', source: { sourceId: 'csv-1', rowNumber: 3 } }),
    transaction('untouched-id', { source: { sourceId: 'csv-1', rowNumber: 4 } }),
  ], document(), [{ id: 'match', workspaceId: 'workspace-1', transactionId: 'allocated', documentId: 'other', reviewDecisionId: 'decision' }]);
  const result = await run(raw, async request => {
    assert.deepEqual(request.data.candidates.map(candidate => candidate.transactionId), ['untouched-id']);
    assert.equal(request.data.evidence.some(ref => ref.recordId === 'allocated' || ref.recordId === 'wrong-amount'), false);
    return semantic(request);
  });
  assert.equal(result.recommendedTransactionId, 'untouched-id');
  assert.equal(result.counts.supplied, 3); assert.equal(result.counts.compatible, 1);
});

test('amount-only and merchant-only evidence remain unresolved', async () => {
  const amountOnly = input(); amountOnly.document.record.extractedFields.reference = null;
  const weak = await run(amountOnly, async request => {
    const response = semantic(request, 'uncertain');
    response.candidates[0]!.supportingEvidence.push({ kind: 'amount_agreement', refs: ['document.totalMinor', request.data.candidates[0]!.refs.amountMinor] });
    return response;
  });
  assert.equal(weak.status, 'needs_review'); assert.equal(weak.reason, 'insufficient_evidence');
  const merchantOnly = await run(amountOnly, async request => ({ ...semantic(request), recommendedTransactionId: null }));
  assert.equal(merchantOnly.status, 'needs_review'); assert.equal(merchantOnly.recommendedTransactionId, null);
  assert.equal(merchantOnly.candidates[0]?.strength, 'plausible');
});

test('all equal plausible competitors survive display truncation and dates cannot break a tie', async () => {
  const raw = input(Array.from({ length: 4 }, (_, i) => transaction(`equal-${i}`, { source: { sourceId: 'csv-1', rowNumber: i + 2 }, date: `2026-10-${10 + i}` })));
  const result = await run(raw, async request => semantic(request));
  assert.equal(result.status, 'needs_review'); assert.equal(result.reason, 'multiple_candidates');
  assert.equal(result.recommendedTransactionId, null);
  assert.equal(result.candidates.length, 4); assert.equal(result.displayCandidates.length, 3);
  assert.deepEqual(result.counts, { supplied: 4, compatible: 4, excluded: 0, evaluated: 4, displayed: 3, omitted: 1 });
  assert.deepEqual(new Set(result.candidates.map(candidate => candidate.transaction.id)), new Set(['equal-0', 'equal-1', 'equal-2', 'equal-3']));
});

test('unique exact-reference corroboration distinguishes a proposal while retaining weaker alternatives', async () => {
  const raw = input([transaction('strong'), transaction('other', { reference: null, source: { sourceId: 'csv-1', rowNumber: 3 } })]);
  const result = await run(raw, async request => ({ ...semantic(request), recommendedTransactionId: 'strong' }));
  assert.equal(result.status, 'proposed'); assert.equal(result.recommendedTransactionId, 'strong');
  assert.equal(result.candidates.length, 2); assert.equal(result.candidates[1]?.strength, 'plausible');
  raw.document.record.extractedFields.reference = null;
  const ambiguous = await run(raw, async request => semantic(request));
  assert.equal(ambiguous.reason, 'multiple_candidates'); assert.equal(ambiguous.recommendedTransactionId, null);
});

test('conflicting references cannot be erased by merchant semantics or model omission', async () => {
  const raw = input([transaction('tx-1', { reference: 'DIFFERENT' })]);
  const result = await run(raw, async request => ({ ...semantic(request), recommendedTransactionId: null }));
  assert.equal(result.status, 'needs_review'); assert.equal(result.reason, 'conflicting_evidence');
  assert.equal(result.candidates[0]?.strength, 'conflicting');
  assert.deepEqual(result.candidates[0]?.conflictingEvidence, [{ kind: 'reference_conflict', refs: ['document.reference', 'transaction.0.reference'] }]);
  const falseAgreement = await run(raw, async request => {
    const response = semantic(request); response.recommendedTransactionId = null;
    response.candidates[0]!.supportingEvidence.push({ kind: 'reference_agreement', refs: ['document.reference', 'transaction.0.reference'] });
    return response;
  });
  assert.equal(falseAgreement.reason, 'invalid_model_output');
});

test('explicit merchant conflict defeats matching reference; no fabricated prose is returned', async () => {
  const result = await run(input(), async request => ({
    candidates: [{ transactionId: request.data.candidates[0]!.transactionId, relation: 'unrelated', supportingEvidence: [],
      conflictingEvidence: [{ kind: 'merchant_conflict', refs: ['document.counterparty', 'transaction.0.description'] }] }],
    recommendedTransactionId: null,
  }));
  assert.equal(result.reason, 'conflicting_evidence');
  assert.equal(result.candidates[0]?.strength, 'conflicting');
});

test('foreign, duplicate, omitted, unsupported and invented model output fails membership/schema checks', async t => {
  const mutations: Record<string, (response: SemanticMatchResponse) => unknown> = {
    'foreign candidate': response => { response.candidates[0]!.transactionId = 'foreign'; return response; },
    'foreign recommendation': response => ({ ...response, recommendedTransactionId: 'foreign' }),
    'foreign evidence': response => { response.candidates[0]!.supportingEvidence[0]!.refs[1] = 'https://invented.test/source'; return response; },
    'wrong field of existing source': response => { response.candidates[0]!.supportingEvidence[0]!.refs[1] = 'transaction.0.amountMinor'; return response; },
    'omitted candidate': response => ({ ...response, candidates: [] }),
    'duplicate candidate': response => ({ ...response, candidates: [...response.candidates, ...response.candidates] }),
    'accepted status': response => ({ ...response, status: 'accepted' }),
    'invented narrative': response => ({ ...response, rationale: 'Payment settled; fraud detected.' }),
    'unsupported recommendation': response => ({ ...response, candidates: response.candidates.map(candidate => ({ ...candidate, relation: 'uncertain', supportingEvidence: [] })) }),
    'duplicate evidence': response => { response.candidates[0]!.supportingEvidence.push(response.candidates[0]!.supportingEvidence[0]!); return response; },
  };
  for (const [name, mutate] of Object.entries(mutations)) await t.test(name, async () => {
    const result = await run(input(), async request => mutate(semantic(request)));
    assert.equal(result.reason, 'invalid_model_output'); assert.equal(result.recommendedTransactionId, null);
    assert.deepEqual(result.candidates.map(candidate => candidate.transaction.id), ['tx-1']);
  });
});

test('another compatible candidate cannot lend its source evidence or disappear from model output', async () => {
  const raw = input([transaction('a'), transaction('b', { source: { sourceId: 'csv-1', rowNumber: 3 } })]);
  const result = await run(raw, async request => {
    const response = semantic(request); response.candidates[0]!.supportingEvidence[0]!.refs[1] = 'transaction.1.description'; return response;
  });
  assert.equal(result.reason, 'invalid_model_output');
  const duplicate = await run(raw, async request => {
    const response = semantic(request); response.candidates[1]!.transactionId = 'a'; return response;
  });
  assert.equal(duplicate.reason, 'invalid_model_output');
});

test('tied candidates cannot acquire a recommendation from model ordering', async () => {
  const raw = input([transaction('a'), transaction('b', { source: { sourceId: 'csv-1', rowNumber: 3 } })]);
  const result = await run(raw, async request => ({ ...semantic(request), recommendedTransactionId: 'a' }));
  assert.equal(result.status, 'needs_review'); assert.equal(result.recommendedTransactionId, null);
});

test('missing counterparty cannot acquire fabricated merchant evidence', async () => {
  const raw = input(); raw.document.record.extractedFields.counterparty = null;
  const result = await run(raw, async request => semantic(request));
  assert.equal(result.reason, 'invalid_model_output');
});

test('stale initial version is nonactionable before calling the model', async () => {
  const raw = input(), current = structuredClone(raw); current.document.version++;
  let calls = 0;
  const result = await proposeMatches(raw, {
    deadline: Date.now() + 5000, signal: new AbortController().signal, readCurrentInput: async () => current,
    rank: async () => { calls++; return null; },
  });
  assert.equal(calls, 0); assert.equal(result.status, 'stale'); assert.equal(result.recommendedTransactionId, null);
});

test('document, transaction, pool and allocation changes during inference invalidate the result', async t => {
  const mutations: Record<string, (raw: ReturnType<typeof input>) => void> = {
    'document version': raw => { raw.document.version++; },
    'document correction even without version bump': raw => { raw.document.record.correctedFields = { ...raw.document.record.extractedFields, totalMinor: '450001' }; },
    'transaction version': raw => { raw.transactions[0]!.version++; },
    'transaction value': raw => { raw.transactions[0]!.record.amountMinor = '450001'; },
    'pool revision': raw => { raw.pool.revision = 'pool-2'; },
    'new competing row': raw => { raw.transactions.push({ record: transaction('new', { source: { sourceId: 'csv-1', rowNumber: 3 } }), version: 1 }); },
    'allocation version': raw => { raw.allocations.version++; },
    'new active allocation': raw => {
      raw.transactions[0]!.record.matchStatus = 'accepted';
      raw.allocations.items.push({ id: 'new-match', workspaceId: 'workspace-1', transactionId: 'tx-1', documentId: 'doc-1', reviewDecisionId: 'decision' });
    },
  };
  for (const [name, mutate] of Object.entries(mutations)) await t.test(name, async () => {
    const raw = input(); let reads = 0;
    const result = await proposeMatches(raw, {
      deadline: Date.now() + 5000, signal: new AbortController().signal,
      readCurrentInput: async () => { reads++; return raw; },
      rank: async request => { mutate(raw); return semantic(request); },
    });
    assert.equal(reads, 2); assert.equal(result.status, 'stale'); assert.equal(result.recommendedTransactionId, null);
    assert.equal(result.counts.evaluated, 0);
  });
});

test('proposal leaves original records, decisions and deterministic cash totals unchanged', async () => {
  const raw = input(), before = structuredClone(raw);
  const summary = calculateCashSummary(raw.transactions.map(item => item.record), raw.workspaceId, 0);
  const result = await run(raw, async request => semantic(request));
  assert.equal(result.status, 'proposed'); assert.deepEqual(raw, before);
  assert.deepEqual(calculateCashSummary(raw.transactions.map(item => item.record), raw.workspaceId, 0), summary);
  assert.equal(raw.allocations.items.length, 0);
  // This is C purity evidence, not evidence of a persisted UI approval.
});

test('provider/snapshot failures and cancellation are explicit, bounded and redacted', async () => {
  const raw = input();
  const failure = await run(raw, async () => { throw new Error('PRIVATE provider details'); });
  assert.equal(failure.reason, 'provider_unavailable'); assert.equal(JSON.stringify(failure).includes('PRIVATE'), false);
  const snapshot = await proposeMatches(raw, {
    deadline: Date.now() + 5000, signal: new AbortController().signal, rank: async () => null,
    readCurrentInput: async () => { throw new Error('PRIVATE database details'); },
  });
  assert.equal(snapshot.reason, 'snapshot_unavailable');
  const controller = new AbortController();
  const cancelled = await proposeMatches(raw, {
    deadline: Date.now() + 5000, signal: controller.signal, readCurrentInput: async () => raw,
    rank: async () => { controller.abort(); return new Promise(() => {}); },
  });
  assert.equal(cancelled.reason, 'cancelled'); assert.equal(cancelled.recommendedTransactionId, null);
});

test('hung external provider or authoritative read cannot exceed the outer deadline', async () => {
  for (const hangRead of [false, true]) {
    const raw = input();
    const result = await proposeMatches(raw, {
      deadline: Date.now() + 30, signal: new AbortController().signal,
      readCurrentInput: async () => hangRead ? new Promise(() => {}) : raw,
      rank: async () => new Promise(() => {}),
    });
    assert.equal(result.reason, 'deadline_exceeded'); assert.equal(result.recommendedTransactionId, null);
  }
});

test('a read returning after the deadline cannot start inference even before the timer fires', async () => {
  const raw = input(); let calls = 0;
  const result = await proposeMatches(raw, {
    deadline: Date.now() + 25, signal: new AbortController().signal,
    readCurrentInput: async () => {
      // Simulate a synchronous external read blocking timer delivery.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
      return raw;
    },
    rank: async request => { calls++; return semantic(request); },
  });
  assert.equal(calls, 0); assert.equal(result.reason, 'deadline_exceeded');
});
