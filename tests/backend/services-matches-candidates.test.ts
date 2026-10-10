import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticMatchCandidateSnapshot } from '../../src/lib/server/matches.ts';
import { transaction } from './fixtures.ts';

const fields = { counterparty: 'Corner shop', date: '2026-10-10', totalMinor: '1050', currency: 'PKR', reference: null };
const id = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, '0')}`;

test('matching snapshot scans the full ledger and ranks only compatible exact PKR outflows', () => {
  const records = [
    transaction({ id: id('3'), direction: 'out', amountMinor: '1050', date: '2026-10-12', description: 'Other supplier' }),
    transaction({ id: id('2'), direction: 'out', amountMinor: '1050', date: '2026-10-10', description: 'Corner shop purchase', matchStatus: 'proposed' }),
    transaction({ id: id('1'), direction: 'in', amountMinor: '1050' }),
    transaction({ id: id('4'), direction: 'out', amountMinor: '1051' }),
    transaction({ id: id('5'), direction: 'out', amountMinor: '1050', matchStatus: 'accepted' }),
  ];
  const snapshot = semanticMatchCandidateSnapshot(records, fields);
  assert.equal(snapshot.eligible.length, 3);
  assert.deepEqual(snapshot.candidates.map(candidate => candidate.record.id), [id('2'), id('3')]);
  assert.equal(snapshot.candidates.length, 2, 'complete snapshot preserves all matching candidates instead of selecting one');
  assert.equal(snapshot.recommendedId, id('2'), 'a close date and counterparty overlap can distinguish a supported candidate');
});

test('unknown receipt date, total or currency yields no candidate rather than inferred compatibility', () => {
  const record = transaction({ id: id('7'), direction: 'out', amountMinor: '1050' });
  for (const patch of [{ date: null }, { totalMinor: null }, { currency: null }, { currency: 'USD' }]) {
    const snapshot = semanticMatchCandidateSnapshot([record], { ...fields, ...patch });
    assert.deepEqual(snapshot.candidates, []);
  }
});

test('an exact reference outweighs an otherwise closer competing candidate', () => {
  const snapshot = semanticMatchCandidateSnapshot([
    transaction({ id: id('8'), direction: 'out', amountMinor: '1050', date: '2026-10-10', description: 'Other supplier', reference: 'OTHER' }),
    transaction({ id: id('9'), direction: 'out', amountMinor: '1050', date: '2026-10-12', description: 'Bright Desk', reference: 'bd-104' }),
  ], { ...fields, reference: 'BD 104' });
  assert.deepEqual(snapshot.candidates.map(candidate => candidate.record.id), [id('9'), id('8')]);
  assert.equal(snapshot.recommendedId, id('9'));
  const best = snapshot.candidates[0];
  const alternative = snapshot.candidates[1];
  assert.ok(best);
  assert.ok(alternative);
  assert.match(best.rationale, /reference agrees/);
  assert.match(alternative.rationale, /reference conflicts/);
});

test('amount-only matches remain ambiguous and do not get a recommendation', () => {
  const snapshot = semanticMatchCandidateSnapshot([
    transaction({ id: id('10'), direction: 'out', amountMinor: '1050', date: '2026-10-10', description: 'Corner shop' }),
    transaction({ id: id('11'), direction: 'out', amountMinor: '1050', date: '2026-10-10', description: 'Corner shop' }),
  ], { ...fields, reference: null, counterparty: null });
  assert.equal(snapshot.recommendedId, null);
  assert.ok(snapshot.candidates.every(candidate => !candidate.recommended && /insufficient/.test(candidate.rationale)));
});

test('competing equally supported candidates stay unresolved', () => {
  const records = [
    transaction({ id: id('12'), direction: 'out', amountMinor: '1050', date: '2026-10-10', description: 'Corner shop payment' }),
    transaction({ id: id('13'), direction: 'out', amountMinor: '1050', date: '2026-10-10', description: 'Corner shop payment' }),
  ];
  const snapshot = semanticMatchCandidateSnapshot(records, { ...fields, reference: null });
  assert.equal(snapshot.recommendedId, null);
  assert.ok(snapshot.candidates.every(candidate => /equally or better supported/.test(candidate.rationale)));
});

test('contradictory references block recommendation even when description and date fit', () => {
  const snapshot = semanticMatchCandidateSnapshot([
    transaction({ id: id('14'), direction: 'out', amountMinor: '1050', date: '2026-10-10', description: 'Corner shop', reference: 'different-ref' }),
  ], { ...fields, reference: 'BD-104' });
  assert.equal(snapshot.recommendedId, null);
  const candidate = snapshot.candidates[0];
  assert.ok(candidate);
  assert.match(candidate.rationale, /reference conflicts/);
});
