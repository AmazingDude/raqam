import test from 'node:test';
import assert from 'node:assert/strict';
import { taxWorkpaperCaseSchema, taxWorkpaperFactsSchema, taxWorkpaperSaveSchema, taxWorkpaperState } from '../../src/lib/contracts/tax-workpaper.ts';

const facts = { taxpayerType: 'individual', residency: 'resident', incomeSources: ['salary', 'business_or_freelance'] } as const;
const workpaperCase = {
  id: '10000000-0000-4000-8000-000000000001', workspaceId: '10000000-0000-4000-8000-000000000002',
  taxYear: 2026, periodStart: '2025-07-01', periodEnd: '2026-06-30', facts, version: 1, updatedAt: '2026-10-21T08:00:00Z',
};

test('tax workpaper facts are strict, distinguish unknown from zero and require explicit confirmation to save', () => {
  assert.equal(taxWorkpaperFactsSchema.safeParse(facts).success, true);
  for (const invalid of [
    { ...facts, cnic: 'not collected' }, { ...facts, salaryMinor: '0' },
    { ...facts, incomeSources: ['salary', 'salary'] }, { ...facts, incomeSources: ['none', 'salary'] },
    { ...facts, residency: 'unknown' },
  ]) assert.equal(taxWorkpaperFactsSchema.safeParse(invalid).success, false);
  assert.equal(taxWorkpaperSaveSchema.safeParse({ taxYear: 2026, facts, confirmed: false, expectedVersion: 0, requestId: workpaperCase.id }).success, false);
  assert.equal(taxWorkpaperSaveSchema.safeParse({ taxYear: 2026, facts, confirmed: true, expectedVersion: 0, requestId: workpaperCase.id }).success, true);
});

test('workpaper state labels the initial individual scope as proposed but blocks all calculations pending law review', () => {
  const parsed = taxWorkpaperCaseSchema.parse(workpaperCase);
  assert.deepEqual(taxWorkpaperState(parsed), {
    case: parsed, scope: 'proposed', calculationReady: false, blockers: ['rules_pack_unavailable'],
  });
});

test('prior years remain draft-only and unsupported legal scopes cannot use the proposed path', () => {
  const otherYear = taxWorkpaperCaseSchema.parse({ ...workpaperCase, taxYear: 2027, periodStart: '2026-07-01', periodEnd: '2027-06-30' });
  assert.equal(taxWorkpaperState(otherYear).scope, 'unsupported');
  assert.ok(taxWorkpaperState(otherYear).blockers.includes('tax_year_scope_unreviewed'));
  const otherIncome = taxWorkpaperCaseSchema.parse({ ...workpaperCase, facts: { ...facts, incomeSources: ['foreign_income'] } });
  assert.equal(taxWorkpaperState(otherIncome).scope, 'unsupported');
  assert.equal(taxWorkpaperState(otherIncome).calculationReady, false);
});
