import test from 'node:test';
import assert from 'node:assert/strict';
import { exactMatchCandidateSnapshot } from '../../src/lib/server/matches.ts';
import { transaction } from './fixtures.ts';

const fields = { counterparty: 'Corner shop', date: '2026-10-10', totalMinor: '1050', currency: 'PKR', reference: null };
const id = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, '0')}`;

test('matching snapshot scans every transaction and returns only exact PKR outflow candidates in date order', () => {
  const records = [
    transaction({ id: id('3'), direction: 'out', amountMinor: '1050', date: '2026-10-12' }),
    transaction({ id: id('2'), direction: 'out', amountMinor: '1050', date: '2026-10-10', matchStatus: 'proposed' }),
    transaction({ id: id('1'), direction: 'in', amountMinor: '1050' }),
    transaction({ id: id('4'), direction: 'out', amountMinor: '1051' }),
    transaction({ id: id('5'), direction: 'out', amountMinor: '1050', matchStatus: 'accepted' }),
  ];
  const snapshot = exactMatchCandidateSnapshot(records, fields);
  assert.equal(snapshot.eligible.length, 3);
  assert.deepEqual(snapshot.candidates.map(record => record.id), [id('2'), id('3')]);
  assert.equal(snapshot.candidates.length, 2, 'complete snapshot preserves all matching candidates instead of selecting one');
});

test('unknown receipt date, total or currency yields no candidate rather than inferred compatibility', () => {
  const record = transaction({ id: id('7'), direction: 'out', amountMinor: '1050' });
  for (const patch of [{ date: null }, { totalMinor: null }, { currency: null }, { currency: 'USD' }]) {
    const snapshot = exactMatchCandidateSnapshot([record], { ...fields, ...patch });
    assert.deepEqual(snapshot.candidates, []);
  }
});
