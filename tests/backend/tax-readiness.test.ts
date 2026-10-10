import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCurrentPakistanTaxYear, pakistanTaxPeriod, taxReadinessAnswersSchema,
  taxReadinessSaveSchema, taxReadinessStateSchema, taxReadinessCompletion,
} from '../../src/lib/contracts/tax-readiness.ts';

const answers = {
  taxpayerType: 'individual', residency: 'not_sure', provinceOrTerritory: 'punjab', filingHistory: 'first_time',
  incomeSources: ['salary', 'business_or_freelance'],
  recordsOnHand: ['salary_certificate'], wealthRecords: ['bank_cash_balances'],
} as const;

test('Pakistan normal tax year follows Asia/Karachi and the FBR ending-year label', () => {
  assert.equal(getCurrentPakistanTaxYear(new Date('2026-06-30T18:59:59.000Z')), 2026);
  assert.equal(getCurrentPakistanTaxYear(new Date('2026-06-30T19:00:00.000Z')), 2027);
  assert.equal(getCurrentPakistanTaxYear(new Date('2026-12-31T20:00:00.000Z')), 2027);
  assert.equal(getCurrentPakistanTaxYear(new Date('2027-06-30T19:00:00.000Z')), 2028);
  assert.deepEqual(pakistanTaxPeriod(2027), { startDate: '2026-07-01', endDate: '2027-06-30' });
  assert.throws(() => pakistanTaxPeriod(1999), RangeError);
});

test('readiness answers accept closed choices and reject identifiers, amounts, duplicates and unknown keys', () => {
  assert.equal(taxReadinessAnswersSchema.safeParse(answers).success, true);
  assert.equal(taxReadinessAnswersSchema.safeParse({ ...answers, cnic: 'not accepted' }).success, false);
  assert.equal(taxReadinessAnswersSchema.safeParse({ ...answers, monthlyIncome: '100000' }).success, false);
  assert.equal(taxReadinessAnswersSchema.safeParse({ ...answers, filingHistory: 'eligible' }).success, false);
  assert.equal(taxReadinessAnswersSchema.safeParse({ ...answers, incomeSources: ['salary', 'salary'] }).success, false);
  assert.equal(taxReadinessAnswersSchema.safeParse({ ...answers, incomeSources: ['none', 'salary'] }).success, false);
  assert.equal(taxReadinessAnswersSchema.safeParse({ ...answers, wealthRecords: ['not_applicable', 'bank_cash_balances'] }).success, false);
});

test('profile writes require every answer and explicit confirmation; responses cannot mix tax years', () => {
  assert.equal(taxReadinessSaveSchema.safeParse({ taxYear: 2027, answers, confirmed: true, expectedVersion: 0 }).success, true);
  assert.equal(taxReadinessSaveSchema.safeParse({ taxYear: 2027, answers, confirmed: false, expectedVersion: 0 }).success, false);
  assert.equal(taxReadinessSaveSchema.safeParse({ taxYear: 2027, answers, confirmed: true, expectedVersion: 0, workspaceId: '10000000-0000-4000-8000-000000000001' }).success, false);
  const profile = { workspaceId: '10000000-0000-4000-8000-000000000001', taxYear: 2027, answers, version: 1, updatedAt: '2026-10-10T12:00:00Z' };
  assert.equal(taxReadinessStateSchema.safeParse({ taxYear: 2027, periodStart: '2026-07-01', periodEnd: '2027-06-30', profile }).success, true);
  assert.equal(taxReadinessStateSchema.safeParse({ taxYear: 2026, periodStart: '2025-07-01', periodEnd: '2026-06-30', profile }).success, false);
});

test('profile completion requires confirmed choices and a declared matching record for each income source', () => {
  const profile = (nextAnswers: unknown) => ({ workspaceId: '10000000-0000-4000-8000-000000000001', taxYear: 2027, answers: nextAnswers, version: 1, updatedAt: '2026-10-10T12:00:00Z' });
  assert.deepEqual(taxReadinessCompletion(null), { complete: false, missing: ['Save a tax readiness profile'] });
  const uncertain = taxReadinessCompletion(profile({ ...answers, taxpayerType: 'not_sure' }) as never);
  assert.equal(uncertain.complete, false);
  assert.ok(uncertain.missing.includes('Confirm taxpayer type'));
  const noBusinessRecord = taxReadinessCompletion(profile({ ...answers, residency: 'resident' }) as never);
  assert.equal(noBusinessRecord.complete, false);
  assert.ok(noBusinessRecord.missing.some(item => item.includes('business or freelance')));
  const complete = taxReadinessCompletion(profile({ ...answers, residency: 'resident', recordsOnHand: ['salary_certificate', 'business_income_expense_records'] }) as never);
  assert.equal(complete.complete, true);
});
