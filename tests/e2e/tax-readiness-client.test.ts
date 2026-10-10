import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../../src/lib/client/api.ts';
import { getCurrentPakistanTaxYear, taxReadinessState, type TaxReadinessAnswers } from '../../src/lib/contracts/tax-readiness.ts';
const workspace = '10000000-0000-4000-8000-000000000001';
const taxYear = getCurrentPakistanTaxYear();
const answers: TaxReadinessAnswers = {
  taxpayerType: 'individual', residency: 'not_sure', provinceOrTerritory: 'punjab', filingHistory: 'first_time',
  incomeSources: ['salary'], recordsOnHand: ['not_collected_yet'], wealthRecords: ['not_sure'],
};
const profile = { workspaceId: workspace, taxYear, answers, version: 1, updatedAt: '2026-10-10T12:00:00Z' };
const state = taxReadinessState(taxYear, profile);
const command = { taxYear, answers, confirmed: true as const, expectedVersion: 0 };
const signal = new AbortController().signal;

test('tax client sends only explicit, versioned confirmation and validates returned scope', async t => {
  t.mock.method(globalThis, 'fetch', async (path: string | URL | Request, init: RequestInit) => {
    assert.equal(path, '/api/tax-readiness'); assert.equal(init.signal, signal); assert.equal(init.cache, 'no-store');
    assert.equal(init.credentials, 'same-origin'); assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(String(init.body)), command);
    return Response.json({ data: state, error: null });
  });
  assert.equal((await api.saveTaxReadiness(workspace, command, signal)).profile?.version, 1);
});

test('tax client rejects foreign profiles, wrong periods, missing profiles and stale save responses', async t => {
  for (const bad of [
    { ...state, profile: { ...profile, workspaceId: '10000000-0000-4000-8000-000000000002' } },
    { ...state, periodStart: '2026-01-01' },
  ]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ data: bad, error: null }));
    await assert.rejects(api.taxReadiness(workspace, signal));
  }
  for (const bad of [{ ...state, profile: null }, { ...state, profile: { ...profile, version: 2 } }, { ...state, profile: { ...profile, answers: { ...answers, filingHistory: 'filed_before' } } }]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ data: bad, error: null }));
    await assert.rejects(api.saveTaxReadiness(workspace, command, signal));
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: null, error: { code: 'CONFLICT', message: 'Reload the changed profile.' } }, { status: 409 }));
  await assert.rejects(api.saveTaxReadiness(workspace, command, signal), /Reload the changed profile/);
});
