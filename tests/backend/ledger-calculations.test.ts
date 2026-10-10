import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateLedgerBalanceSheet,
  calculateLedgerCashFlow,
  calculateLedgerIncomeStatement,
  calculateLedgerTrialBalance,
} from '../../src/lib/server/ledger/calculations.ts';
import type { LedgerAccount, LedgerJournal } from '../../src/lib/contracts/ledger.ts';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const accountIds = {
  bank: '20000000-0000-4000-8000-000000000001',
  receivable: '20000000-0000-4000-8000-000000000002',
  payable: '20000000-0000-4000-8000-000000000003',
  equity: '20000000-0000-4000-8000-000000000004',
  revenue: '20000000-0000-4000-8000-000000000005',
  expense: '20000000-0000-4000-8000-000000000006',
  clearing: '20000000-0000-4000-8000-000000000007',
};

const account = (id: string, code: string, type: LedgerAccount['type'], role: LedgerAccount['role'], isCashAccount = false): LedgerAccount => ({
  id, workspaceId, code, name: code, type, role, isCashAccount, active: true, version: 0,
  cashFlowClass: role === 'unclassified_cash_clearing' ? 'unclassified' : null,
});
const accounts: LedgerAccount[] = [
  account(accountIds.bank, '1000', 'asset', 'cash', true),
  account(accountIds.receivable, '1100', 'asset', 'receivable'),
  account(accountIds.payable, '2000', 'liability', 'payable'),
  account(accountIds.equity, '3000', 'equity', 'opening_balance'),
  account(accountIds.revenue, '4000', 'revenue', 'revenue'),
  account(accountIds.expense, '6000', 'expense', 'expense'),
  account(accountIds.clearing, '1090', 'asset', 'unclassified_cash_clearing'),
];

const journal = (id: string, entryDate: string, lines: LedgerJournal['lines'], cashMovement: LedgerJournal['cashMovement'] = null): LedgerJournal => {
  const revenue = lines.some(item => item.accountId === accountIds.revenue);
  const expense = lines.some(item => item.accountId === accountIds.expense);
  const evidenceSource = revenue
    ? { kind: 'invoice' as const, invoiceId: '50000000-0000-4000-8000-000000000011', locator: { kind: 'document_field' as const, field: 'service_date' as const, pageNumber: 1, occurrence: 0 } }
    : expense ? { kind: 'supplier_bill' as const, billId: '50000000-0000-4000-8000-000000000012', locator: { kind: 'document_field' as const, field: 'goods_received_date' as const, pageNumber: 1, occurrence: 0 } }
      : null;
  const cashSource = cashMovement?.kind === 'bank_transaction'
    ? { kind: 'bank_transaction' as const, transactionId: cashMovement.transactionId }
    : cashMovement?.kind === 'manual_payment'
      ? { kind: 'manual_payment' as const, paymentId: cashMovement.paymentId }
      : null;
  return {
    id, workspaceId, entryDate, description: 'Synthetic reviewed posting', currency: 'PKR',
    sources: [...(evidenceSource ? [evidenceSource] : []), ...(cashSource ? [cashSource] : [])],
    recognitionEvidence: evidenceSource ? { basis: revenue ? 'service_delivery' : 'goods_received', date: entryDate,
      source: evidenceSource, reviewDecisionId: '50000000-0000-4000-8000-000000000013' } : null,
    cashMovement, reversalOfId: null, reversalReason: null, lines, status: 'posted', version: 1,
    postedAt: `${entryDate}T12:00:00Z`, postedBy: 'user_test',
  };
};
const line = (id: string, accountId: string, debitMinor: string, creditMinor: string): LedgerJournal['lines'][number] => ({
  id, accountId, debitMinor, creditMinor, memo: null,
});
const journals: LedgerJournal[] = [
  journal('30000000-0000-4000-8000-000000000001', '2026-01-03', [
    line('60000000-0000-4000-8000-000000000001', accountIds.receivable, '10000', '0'),
    line('60000000-0000-4000-8000-000000000002', accountIds.revenue, '0', '10000'),
  ]),
  journal('30000000-0000-4000-8000-000000000002', '2026-01-05', [
    line('60000000-0000-4000-8000-000000000003', accountIds.bank, '10000', '0'),
    line('60000000-0000-4000-8000-000000000004', accountIds.receivable, '0', '10000'),
  ], { kind: 'bank_transaction', transactionId: '70000000-0000-4000-8000-000000000001' }),
  journal('30000000-0000-4000-8000-000000000003', '2026-01-05', [
    line('60000000-0000-4000-8000-000000000005', accountIds.expense, '2000', '0'),
    line('60000000-0000-4000-8000-000000000006', accountIds.payable, '0', '2000'),
  ]),
  journal('30000000-0000-4000-8000-000000000004', '2026-01-06', [
    line('60000000-0000-4000-8000-000000000007', accountIds.payable, '2000', '0'),
    line('60000000-0000-4000-8000-000000000008', accountIds.bank, '0', '2000'),
  ], { kind: 'bank_transaction', transactionId: '70000000-0000-4000-8000-000000000002' }),
  journal('30000000-0000-4000-8000-000000000005', '2026-01-07', [
    line('60000000-0000-4000-8000-000000000009', accountIds.clearing, '500', '0'),
    line('60000000-0000-4000-8000-000000000010', accountIds.bank, '0', '500'),
  ], { kind: 'bank_transaction', transactionId: '70000000-0000-4000-8000-000000000003' }),
  journal('30000000-0000-4000-8000-000000000006', '2026-02-01', [
    line('60000000-0000-4000-8000-000000000011', accountIds.receivable, '700', '0'),
    line('60000000-0000-4000-8000-000000000012', accountIds.revenue, '0', '700'),
  ]),
];
const completeCoverage = {
  workspaceId, selectedFrom: '2026-01-01', selectedThrough: '2026-01-31',
  availableFrom: '2026-01-01', availableThrough: '2026-01-31', isComplete: true,
  missingSourceKinds: [] as [], unsupportedOpeningBalanceAccountIds: [] as [],
};

test('trial balance includes only posted journals through the inclusive as-of date and balances exactly', () => {
  const report = calculateLedgerTrialBalance({ workspaceId, asOf: '2026-01-31', accounts, journals, coverage: completeCoverage });
  assert.equal(report.debitTotalMinor, '10000');
  assert.equal(report.creditTotalMinor, '10000');
  assert.deepEqual(report.rows.find(row => row.accountId === accountIds.bank), {
    accountId: accountIds.bank, code: '1000', name: '1000', debitMinor: '7500', creditMinor: '0',
  });
  assert.equal(report.rows.some(row => row.accountId === accountIds.revenue && row.creditMinor === '10700'), false,
    'future posting must not enter an earlier report');
});

test('income statement recognizes activity only inside the inclusive reporting period', () => {
  const report = calculateLedgerIncomeStatement({ workspaceId, from: '2026-01-01', to: '2026-01-31', accounts, journals, coverage: completeCoverage });
  assert.equal(report.totalRevenueMinor, '10000');
  assert.equal(report.totalExpenseMinor, '2000');
  assert.equal(report.netIncomeMinor, '8000');
  assert.throws(() => calculateLedgerIncomeStatement({ workspaceId, from: '2026-01-01', to: '2026-01-31', accounts, journals,
    coverage: { ...completeCoverage, selectedFrom: '2026-01-02' } }), /Income statement totals, range, and coverage must reconcile/);
});

test('balance sheet includes current earnings so assets equal liabilities and equity before closing', () => {
  const report = calculateLedgerBalanceSheet({ workspaceId, asOf: '2026-01-31', accounts, journals, coverage: completeCoverage });
  assert.equal(report.totalAssetsMinor, '8000');
  assert.equal(report.totalLiabilitiesMinor, '0');
  assert.equal(report.totalEquityMinor, '8000');
  assert.equal(report.currentEarningsMinor, '8000');
  assert.equal(report.totalLiabilitiesAndEquityMinor, '8000');
  assert.equal(report.isBalanced, true, 'review-only clearing remains an asset until classification');
  assert.equal(report.unclassifiedCashBalanceMinor, '500');
});

test('direct cash flow separates classified movements from review-only clearing and reconciles the net', () => {
  const report = calculateLedgerCashFlow({ workspaceId, from: '2026-01-01', to: '2026-01-31', movements: [
    { transactionId: '70000000-0000-4000-8000-000000000001', date: '2026-01-05', amountMinor: '10000', direction: 'in', classification: 'operating', reviewRequired: false },
    { transactionId: '70000000-0000-4000-8000-000000000002', date: '2026-01-06', amountMinor: '2000', direction: 'out', classification: 'operating', reviewRequired: false },
    { transactionId: '70000000-0000-4000-8000-000000000003', date: '2026-01-07', amountMinor: '500', direction: 'out', classification: null, reviewRequired: true },
    { transactionId: '70000000-0000-4000-8000-000000000004', date: '2026-02-01', amountMinor: '700', direction: 'in', classification: 'operating', reviewRequired: false },
  ], accounts, journals, coverage: completeCoverage });
  assert.equal(report.operatingNetMinor, '8000');
  assert.equal(report.unclassifiedNetMinor, '-500');
  assert.equal(report.netCashMovementMinor, '7500');
  assert.equal(report.reconcilesToLedger, true);
  assert.equal(report.unclassifiedCount, 1);
});

test('reports reject foreign, duplicate, unbalanced or unsupported records instead of calculating partial totals', () => {
  assert.throws(() => calculateLedgerTrialBalance({ workspaceId, asOf: '2026-01-31', accounts,
    journals: [journals[0]!, { ...journals[1]!, workspaceId: '10000000-0000-4000-8000-000000000002' }], coverage: completeCoverage }), /FOREIGN_JOURNAL/);
  assert.throws(() => calculateLedgerTrialBalance({ workspaceId, asOf: '2026-01-31', accounts,
    journals: [journals[0]!, journals[0]!], coverage: completeCoverage }), /DUPLICATE_JOURNAL/);
  assert.throws(() => calculateLedgerTrialBalance({ workspaceId, asOf: '2026-01-31', accounts: accounts.filter(item => item.id !== accountIds.receivable), journals: [journals[0]!], coverage: completeCoverage }), /UNKNOWN_ACCOUNT/);
  assert.throws(() => calculateLedgerTrialBalance({ workspaceId, asOf: '2026-01-31', accounts,
    journals: [{ ...journals[0]!, lines: [journals[0]!.lines[0]!] }], coverage: completeCoverage }), /INVALID_JOURNAL/);
});

test('a canonical cash movement cannot be posted by two journals in persisted report input', () => {
  const movementLink = journals[1]!;
  assert.throws(() => calculateLedgerTrialBalance({ workspaceId, asOf: '2026-01-31', accounts,
    journals: [movementLink, { ...movementLink, id: '30000000-0000-4000-8000-000000000006' }], coverage: completeCoverage }), /DUPLICATE_CASH_MOVEMENT/);
});

test('cash flow rejects duplicate movements and rejects complete reports with incomplete source coverage', () => {
  const movement = { transactionId: '70000000-0000-4000-8000-000000000001', date: '2026-01-03', amountMinor: '1', direction: 'in' as const, classification: 'operating' as const, reviewRequired: false };
  assert.throws(() => calculateLedgerCashFlow({ workspaceId, from: '2026-01-01', to: '2026-01-31', movements: [movement, movement], accounts, journals, coverage: completeCoverage }), /DUPLICATE_CASH_MOVEMENT/);
  const incomplete = { ...completeCoverage, isComplete: false, missingSourceKinds: ['bank' as const] };
  const report = calculateLedgerCashFlow({ workspaceId, from: '2026-01-01', to: '2026-01-31', movements: [movement], accounts, journals: [], coverage: incomplete });
  assert.equal(report.coverage.isComplete, false);
  assert.equal(report.reconcilesToLedger, false, 'cash-flow and ledger totals remain distinguishable when evidence disagrees');
});

test('financial report sums use exact integer arithmetic above JavaScript safe integer precision', () => {
  const large = '9007199254740993';
  const entry = journal('30000000-0000-4000-8000-000000000005', '2026-01-10', [
    line('60000000-0000-4000-8000-000000000009', accountIds.bank, large, '0'),
    line('60000000-0000-4000-8000-000000000010', accountIds.equity, '0', large),
  ]);
  const report = calculateLedgerTrialBalance({ workspaceId, asOf: '2026-01-31', accounts, journals: [entry], coverage: completeCoverage });
  assert.equal(report.debitTotalMinor, large);
  assert.equal(report.creditTotalMinor, large);
});
