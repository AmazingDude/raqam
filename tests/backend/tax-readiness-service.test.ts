import test from 'node:test';
import assert from 'node:assert/strict';
import type { RequestSession } from '../../src/lib/server/auth.ts';
import type { Workspace } from '../../src/lib/contracts/index.ts';
import { getCurrentPakistanTaxYear, type TaxReadinessAnswers } from '../../src/lib/contracts/tax-readiness.ts';
import { readTaxReadinessProfile, saveTaxReadinessProfile } from '../../src/lib/server/tax-readiness.ts';

const workspace: Workspace = { id: '10000000-0000-4000-8000-000000000001', ownerSubject: 'owner-a', businessName: 'Synthetic readiness test', currency: 'PKR' };
const answers: TaxReadinessAnswers = {
  taxpayerType: 'individual', residency: 'not_sure', provinceOrTerritory: 'punjab', filingHistory: 'first_time',
  incomeSources: ['salary'], recordsOnHand: ['not_collected_yet'], wealthRecords: ['not_sure'],
};
const taxYear = getCurrentPakistanTaxYear();
const row = { workspace_id: workspace.id, tax_year: taxYear, answers, version: 1, updated_at: '2026-10-10T12:00:00Z' };
function fixture(data: unknown, error: { code: string } | null = null) {
  const calls: unknown[] = [];
  const query = {
    select(columns: string) { calls.push(['select', columns]); return query; },
    eq(name: string, value: unknown) { calls.push(['eq', name, value]); return query; },
    maybeSingle: async () => ({ data, error }),
  };
  const session = { subject: 'owner-a', database: {
    from(name: string) { calls.push(['from', name]); return query; },
    rpc: async (name: string, input: unknown) => { calls.push(['rpc', name, input]); return { data, error }; },
  } } as unknown as RequestSession;
  return { session, calls };
}

test('profile reads require the authenticated workspace and validate stored scope and snapshots', async () => {
  const { session, calls } = fixture(row);
  const result = await readTaxReadinessProfile(session, workspace);
  assert.deepEqual(result.profile?.answers, answers);
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['eq', 'workspace_id', workspace.id])));
  const absent = fixture(null); assert.equal((await readTaxReadinessProfile(absent.session, workspace)).profile, null);
  for (const invalid of [{ ...row, workspace_id: '10000000-0000-4000-8000-000000000002' }, { ...row, tax_year: taxYear-1 }, { ...row, answers: {} }, { ...row, version: 0 }]) {
    await assert.rejects(readTaxReadinessProfile(fixture(invalid).session, workspace), /could not be verified|incomplete or invalid/);
  }
  const foreign = fixture(row);
  await assert.rejects(readTaxReadinessProfile(foreign.session, { ...workspace, ownerSubject: 'owner-b' }), /Workspace not found/);
  assert.equal(foreign.calls.length, 0);
});

test('profile saves reject unconfirmed/foreign arguments before access and verify persisted answers/version', async () => {
  const command = { taxYear, answers, confirmed: true, expectedVersion: 0 };
  for (const invalid of [{ ...command, confirmed: false }, { ...command, workspaceId: workspace.id }, { ...command, taxYear: taxYear-1 }, { ...command, expectedVersion: -1 }]) {
    const check = fixture({ profile: row });
    await assert.rejects(saveTaxReadinessProfile(check.session, workspace, invalid), /confirm|current Pakistan tax year/);
    assert.equal(check.calls.length, 0);
  }
  const valid = fixture({ profile: row });
  assert.equal((await saveTaxReadinessProfile(valid.session, workspace, command)).profile?.version, 1);
  assert.deepEqual(valid.calls[0], ['rpc', 'save_tax_readiness_profile', { p_tax_year: taxYear, p_answers: answers, p_confirmed: true, p_expected_version: 0 }]);
  for (const invalid of [{}, { profile: { ...row, version: 2 } }, { profile: { ...row, answers: { ...answers, filingHistory: 'filed_before' } } }]) {
    await assert.rejects(saveTaxReadinessProfile(fixture(invalid).session, workspace, command), /could not be verified/);
  }
  await assert.rejects(saveTaxReadinessProfile(fixture(null, { code: 'PT409' }).session, workspace, command), /changed in another tab/);
  await assert.rejects(saveTaxReadinessProfile(fixture(null, { code: '42P01' }).session, workspace, command), /could not be saved/);
});
