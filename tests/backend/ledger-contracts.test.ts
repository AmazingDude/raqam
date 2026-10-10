import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ledgerAccountCommandSchema, ledgerAccountSchema, ledgerCashFlowMovementSchema, ledgerCashFlowStatementSchema, ledgerHistoryCoverageSchema,
  ledgerExceptionSchema, ledgerJournalBatchSchema, ledgerJournalDraftSchema, ledgerJournalSchema,
  ledgerReviewTransitionSchema,
  ledgerReportRequestSchema, ledgerTrialBalanceSchema, validateLedgerJournalCommand,
} from '../../src/lib/contracts/ledger.ts';

const workspace = '10000000-0000-4000-8000-000000000001';
const otherWorkspace = '10000000-0000-4000-8000-000000000002';
const cashId = '20000000-0000-4000-8000-000000000001';
const expenseId = '20000000-0000-4000-8000-000000000002';
const payableId = '20000000-0000-4000-8000-000000000003';
const journalId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const sourceId = '50000000-0000-4000-8000-000000000001';
const evidenceId = '50000000-0000-4000-8000-000000000002';
const recognitionDecisionId = '50000000-0000-4000-8000-000000000003';
const billId = '50000000-0000-4000-8000-000000000004';
const account = (id: string, workspaceId = workspace, role: 'cash' | 'expense' | 'payable' = 'cash') => ledgerAccountSchema.parse({
  id, workspaceId, code: role === 'cash' ? '1000' : role === 'expense' ? '6000' : '2000', name: role,
  type: role === 'cash' ? 'asset' : role === 'expense' ? 'expense' : 'liability', cashFlowClass: null, role, isCashAccount: role === 'cash', active: true, version: 0,
});
const draft = (overrides: Record<string, unknown> = {}) => ({
  requestId, expectedVersion: null, id: journalId, entryDate: '2026-10-10', description: 'Reviewed example', currency: 'PKR',
  sources: [
    { kind: 'supplier_bill', billId },
    { kind: 'document', documentId: evidenceId, locator: { kind: 'document_field', field: 'goods_received_date', pageNumber: 1 } },
  ],
  recognitionEvidence: { basis: 'goods_received', date: '2026-10-10', source: { kind: 'document', documentId: evidenceId,
    locator: { kind: 'document_field', field: 'goods_received_date', pageNumber: 1 } }, reviewDecisionId: recognitionDecisionId },
  cashMovement: null,
  reversalOfId: null, reversalReason: null,
  lines: [
    { id: '60000000-0000-4000-8000-000000000001', accountId: expenseId, debitMinor: '1250', creditMinor: '0', memo: null },
    { id: '60000000-0000-4000-8000-000000000002', accountId: payableId, debitMinor: '0', creditMinor: '1250', memo: null },
  ], ...overrides,
});
const cashPaymentDraft = (id: string, request: string) => draft({
  id, requestId: request, sources: [{ kind: 'bank_transaction', transactionId: sourceId }], recognitionEvidence: null,
  cashMovement: { kind: 'bank_transaction', transactionId: sourceId },
  lines: [
    { id: '60000000-0000-4000-8000-000000000011', accountId: payableId, debitMinor: '1250', creditMinor: '0', memo: null },
    { id: '60000000-0000-4000-8000-000000000012', accountId: cashId, debitMinor: '0', creditMinor: '1250', memo: null },
  ],
});
const coverage = { workspaceId: workspace, selectedFrom: '2026-01-01', selectedThrough: '2026-10-10', availableFrom: '2026-01-01',
  availableThrough: '2026-10-10', isComplete: true, missingSourceKinds: [], unsupportedOpeningBalanceAccountIds: [] };

test('ledger journal contract accepts exact integer-paisa balanced PKR entries', () => {
  assert.equal(ledgerJournalDraftSchema.safeParse(draft()).success, true);
  assert.equal(ledgerJournalDraftSchema.safeParse(draft({ reversalOfId: journalId })).success, false);
  assert.equal(ledgerReportRequestSchema.safeParse({ kind: 'cash_flow', from: '2026-01-01', to: '2026-10-10', method: 'direct' }).success, true);
  assert.equal(ledgerReportRequestSchema.safeParse({ kind: 'cash_flow', from: '2026-10-10', to: '2026-01-01', method: 'direct' }).success, false);
});

test('account commands omit trusted workspace and reject incompatible chart roles', () => {
  const command = { requestId, id: null, expectedVersion: null, code: '1000', name: 'Bank', type: 'asset',
    cashFlowClass: null, role: 'cash', isCashAccount: true, active: true };
  assert.equal(ledgerAccountCommandSchema.safeParse(command).success, true);
  assert.equal(ledgerAccountCommandSchema.safeParse({ ...command, type: 'expense' }).success, false);
  assert.equal(ledgerAccountCommandSchema.safeParse({ ...command, id: journalId }).success, false);
  assert.equal(ledgerAccountCommandSchema.safeParse({ ...command, role: 'unclassified_cash_clearing', cashFlowClass: 'unclassified' }).success, false);
});

test('ledger journal rejects unbalanced, malformed, duplicate-line, and invalid-state entries', () => {
  assert.equal(ledgerJournalDraftSchema.safeParse(draft({ lines: [
    { id: '60000000-0000-4000-8000-000000000001', accountId: expenseId, debitMinor: '1250', creditMinor: '0', memo: null },
    { id: '60000000-0000-4000-8000-000000000002', accountId: cashId, debitMinor: '0', creditMinor: '1249', memo: null },
  ] })).success, false);
  assert.equal(ledgerJournalDraftSchema.safeParse(draft({ lines: [
    { id: '60000000-0000-4000-8000-000000000001', accountId: expenseId, debitMinor: '1250', creditMinor: '1', memo: null },
    { id: '60000000-0000-4000-8000-000000000002', accountId: cashId, debitMinor: '0', creditMinor: '1249', memo: null },
  ] })).success, false);
  const duplicateIdLines = draft().lines.map((line: { id: string }, index: number) => ({ ...line, id: index ? '60000000-0000-4000-8000-000000000001' : line.id }));
  assert.equal(ledgerJournalDraftSchema.safeParse(draft({ lines: duplicateIdLines })).success, false);
  const { requestId: _requestId, expectedVersion: _expectedVersion, ...persistedDraft } = draft();
  const persisted = { ...persistedDraft, workspaceId: workspace, status: 'posted' as const, version: 1,
    postedAt: '2026-10-10T12:00:00Z', postedBy: 'user_test' };
  assert.equal(ledgerJournalSchema.safeParse(persisted).success, true);
  assert.equal(ledgerJournalSchema.safeParse({ ...persisted, postedAt: null }).success, false);
  assert.equal(ledgerJournalSchema.safeParse({ ...persisted, postedBy: null }).success, false);
});

test('trusted validation rejects unsupported, foreign, inactive accounts and foreign sources', () => {
  const accounts = new Map([[cashId, account(cashId)], [expenseId, account(expenseId, otherWorkspace, 'expense')], [payableId, account(payableId, workspace, 'payable')]]);
  const trusted = { workspaceId: workspace, accounts, sourceKeys: new Set([`supplier_bill:${billId}`, `document:${evidenceId}`]),
    reviewedRecognitionDecisionIds: new Set([recognitionDecisionId]) };
  assert.throws(() => validateLedgerJournalCommand(ledgerJournalDraftSchema.parse(draft()), trusted), /UNSUPPORTED_OR_FOREIGN_ACCOUNT/);
  assert.throws(() => validateLedgerJournalCommand(ledgerJournalDraftSchema.parse(draft({
    lines: draft().lines.map((line: { accountId: string }, index: number) => ({ ...line, accountId: index ? cashId : '70000000-0000-4000-8000-000000000001' })),
  })), { ...trusted, accounts: new Map([[cashId, account(cashId)]]) }), /UNSUPPORTED_OR_FOREIGN_ACCOUNT/);
  assert.equal(ledgerJournalDraftSchema.safeParse(draft({ sources: [{ kind: 'document', documentId: sourceId }], cashMovement: null })).success, false,
    'recognition evidence must be linked to the same source list');
  assert.equal(ledgerJournalDraftSchema.safeParse(draft({ recognitionEvidence: { basis: 'service_delivery', date: '2026-10-10',
    source: { kind: 'document', documentId: evidenceId } } })).success, false, 'recognition evidence requires a field locator');
});

test('optimistic versions and duplicate IDs are enforced using trusted persisted state', () => {
  const { requestId: _existingRequest, expectedVersion: _existingVersion, ...existingFields } = draft();
  const existingDraft = ledgerJournalSchema.parse({ ...existingFields, workspaceId: workspace, status: 'draft', version: 2, postedAt: null, postedBy: null });
  const context = { workspaceId: workspace, accounts: new Map([[cashId, account(cashId)], [expenseId, account(expenseId, workspace, 'expense')], [payableId, account(payableId, workspace, 'payable')]]),
    currentVersions: new Map([[journalId, 2]]), sourceKeys: new Set([`supplier_bill:${billId}`, `document:${evidenceId}`]),
    currentJournals: new Map([[journalId, existingDraft]]), reviewedRecognitionDecisionIds: new Set([recognitionDecisionId]) };
  assert.throws(() => validateLedgerJournalCommand(ledgerJournalDraftSchema.parse(draft({ expectedVersion: 1 })), context), /STALE_VERSION/);
  assert.throws(() => validateLedgerJournalCommand(ledgerJournalDraftSchema.parse(draft()), context), /DUPLICATE_JOURNAL_ID/);
  assert.doesNotThrow(() => validateLedgerJournalCommand(ledgerJournalDraftSchema.parse(draft({ expectedVersion: 2 })), context));
  assert.throws(() => validateLedgerJournalCommand(ledgerJournalDraftSchema.parse(draft({ recognitionEvidence: null })),
    { ...context, currentVersions: new Map(), currentJournals: new Map() }), /RECOGNITION_EVIDENCE_REQUIRED/);
  assert.throws(() => validateLedgerJournalCommand(ledgerJournalDraftSchema.parse(draft()),
    { ...context, currentVersions: new Map(), currentJournals: new Map(), reviewedRecognitionDecisionIds: new Set() }), /RECOGNITION_DATE_NOT_REVIEWED/);
});

test('posted journals are immutable through the public command validator', () => {
  const { requestId: _requestId, expectedVersion: _expectedVersion, ...fields } = draft();
  const posted = ledgerJournalSchema.parse({ ...fields, workspaceId: workspace, status: 'posted', version: 2,
    postedAt: '2026-10-10T12:00:00Z', postedBy: 'user_test' });
  const updated = ledgerJournalDraftSchema.parse(draft({ expectedVersion: 2, lines: draft().lines.map((line: { debitMinor: string; creditMinor: string }, index: number) =>
    index === 0 ? { ...line, debitMinor: '1300' } : { ...line, creditMinor: '1300' }) }));
  assert.throws(() => validateLedgerJournalCommand(updated, { workspaceId: workspace,
    accounts: new Map([[cashId, account(cashId)], [expenseId, account(expenseId, workspace, 'expense')], [payableId, account(payableId, workspace, 'payable')]]),
    currentVersions: new Map([[journalId, 2]]), currentJournals: new Map([[journalId, posted]]) }), /POSTED_JOURNAL_IMMUTABLE/);
});

test('cash-account postings require a canonical payment identity, except reviewed openings and exact reversals', () => {
  const paymentWithoutIdentity = ledgerJournalDraftSchema.parse(cashPaymentDraft(journalId, requestId));
  const accounts = new Map([[cashId, account(cashId)], [expenseId, account(expenseId, workspace, 'expense')], [payableId, account(payableId, workspace, 'payable')]]);
  assert.throws(() => validateLedgerJournalCommand({ ...paymentWithoutIdentity, cashMovement: null }, { workspaceId: workspace, accounts,
    sourceKeys: new Set([`bank_transaction:${sourceId}`]) }), /CASH_MOVEMENT_REQUIRED/);
  assert.doesNotThrow(() => validateLedgerJournalCommand(paymentWithoutIdentity, { workspaceId: workspace, accounts,
    sourceKeys: new Set([`bank_transaction:${sourceId}`]) }));

  const equityId = '20000000-0000-4000-8000-000000000004';
  const openingSource = { kind: 'opening_balance' as const, cutoverDate: '2026-10-10', evidenceId };
  const opening = ledgerJournalDraftSchema.parse(draft({ id: '30000000-0000-4000-8000-000000000010',
    sources: [{ ...openingSource, locator: { kind: 'owner_decision', decisionId: recognitionDecisionId, field: 'opening_balance' } }],
    recognitionEvidence: { basis: 'opening_balance', date: '2026-10-10', source: { ...openingSource,
      locator: { kind: 'owner_decision', decisionId: recognitionDecisionId, field: 'opening_balance' } }, reviewDecisionId: recognitionDecisionId },
    lines: [
      { id: '60000000-0000-4000-8000-000000000021', accountId: cashId, debitMinor: '1250', creditMinor: '0', memo: null },
      { id: '60000000-0000-4000-8000-000000000022', accountId: equityId, debitMinor: '0', creditMinor: '1250', memo: null },
    ] }));
  assert.doesNotThrow(() => validateLedgerJournalCommand(opening, { workspaceId: workspace,
    accounts: new Map([...accounts, [equityId, ledgerAccountSchema.parse({ id: equityId, workspaceId: workspace, code: '3000', name: 'Equity',
      type: 'equity', role: 'opening_balance', cashFlowClass: null, isCashAccount: false, active: true, version: 0 })]]),
    sourceKeys: new Set([`opening_balance:${evidenceId}`]), reviewedRecognitionDecisionIds: new Set([recognitionDecisionId]) }));

  const originalDraft = ledgerJournalDraftSchema.parse(cashPaymentDraft(journalId, requestId));
  const { requestId: _originalRequest, expectedVersion: _originalVersion, ...originalFields } = originalDraft;
  const original = ledgerJournalSchema.parse({ ...originalFields, workspaceId: workspace, status: 'posted', version: 1,
    postedAt: '2026-10-10T12:00:00Z', postedBy: 'user_test' });
  const cashReversal = ledgerJournalDraftSchema.parse(cashPaymentDraft('30000000-0000-4000-8000-000000000011',
    '40000000-0000-4000-8000-000000000011'));
  const reversal = ledgerJournalDraftSchema.parse({ ...cashReversal, cashMovement: null, reversalOfId: journalId,
    reversalReason: 'Reverse settlement', lines: [
      { id: '60000000-0000-4000-8000-000000000023', accountId: cashId, debitMinor: '1250', creditMinor: '0', memo: null },
      { id: '60000000-0000-4000-8000-000000000024', accountId: payableId, debitMinor: '0', creditMinor: '1250', memo: null },
    ] });
  assert.doesNotThrow(() => validateLedgerJournalCommand(reversal, { workspaceId: workspace, accounts,
    sourceKeys: new Set([`bank_transaction:${sourceId}`]), currentJournals: new Map([[journalId, original]]) }));
});

test('posted corrections require an exact, one-time reversal of a same-workspace posted journal', () => {
  const { requestId: _requestId, expectedVersion: _expectedVersion, ...persistedDraft } = draft();
  const original = ledgerJournalSchema.parse({ ...persistedDraft, workspaceId: workspace, status: 'posted', version: 2,
    postedAt: '2026-10-10T12:00:00Z', postedBy: 'user_test' });
  const reversal = draft({ id: '30000000-0000-4000-8000-000000000009', requestId: '40000000-0000-4000-8000-000000000009',
    sources: [...draft().sources], cashMovement: null, reversalOfId: journalId, reversalReason: 'Correct account classification',
    recognitionEvidence: { ...draft().recognitionEvidence, basis: 'correction' },
    lines: [
      { id: '60000000-0000-4000-8000-000000000019', accountId: expenseId, debitMinor: '0', creditMinor: '1250', memo: null },
      { id: '60000000-0000-4000-8000-000000000020', accountId: payableId, debitMinor: '1250', creditMinor: '0', memo: null },
    ] });
  const context = { workspaceId: workspace, accounts: new Map([[cashId, account(cashId)], [expenseId, account(expenseId, workspace, 'expense')], [payableId, account(payableId, workspace, 'payable')]]),
    sourceKeys: new Set([`supplier_bill:${billId}`, `document:${evidenceId}`]),
    reviewedRecognitionDecisionIds: new Set([recognitionDecisionId]), currentJournals: new Map([[journalId, original]]) };
  assert.doesNotThrow(() => validateLedgerJournalCommand(ledgerJournalDraftSchema.parse(reversal), context));
  assert.throws(() => validateLedgerJournalCommand(ledgerJournalDraftSchema.parse({ ...reversal,
    lines: reversal.lines.map((entry: { creditMinor: string; debitMinor: string }, index: number) => index === 0
      ? { ...entry, creditMinor: '1249' } : { ...entry, debitMinor: '1249' }) }), context), /REVERSAL_MUST_EXACTLY_REVERSE_ORIGINAL/);
  assert.throws(() => validateLedgerJournalCommand(ledgerJournalDraftSchema.parse(reversal),
    { ...context, reversedJournalIds: new Set([journalId]) }), /JOURNAL_ALREADY_REVERSED/);
});

test('journal batch rejects incomplete and duplicate batches', () => {
  assert.equal(ledgerJournalBatchSchema.safeParse({ requestId, expectedCount: 2, journals: [draft()] }).success, false);
  assert.equal(ledgerJournalBatchSchema.safeParse({ requestId, expectedCount: 2, journals: [draft(), draft({ requestId: '40000000-0000-4000-8000-000000000002' })] }).success, false);
  assert.equal(ledgerJournalBatchSchema.safeParse({ requestId, expectedCount: 2, journals: [cashPaymentDraft(journalId, requestId), cashPaymentDraft(
    '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002')]
  }).success, false, 'same cash movement cannot produce two journals in a batch');
});

test('review states are one-way and exception closure requires a timestamp', () => {
  assert.equal(ledgerReviewTransitionSchema.safeParse({ from: 'draft', to: 'needs_review' }).success, true);
  assert.equal(ledgerReviewTransitionSchema.safeParse({ from: 'posted', to: 'draft' }).success, false);
  const openException = { id: journalId, workspaceId: workspace, kind: 'unclassified_cash', state: 'open',
    source: { kind: 'bank_transaction', transactionId: sourceId }, targetId: null, reason: 'Needs classification',
    openedAt: '2026-10-10T00:00:00Z', resolvedAt: null };
  assert.equal(ledgerExceptionSchema.safeParse(openException).success, true);
  assert.equal(ledgerExceptionSchema.safeParse({ ...openException, state: 'resolved' }).success, false);
});

test('history coverage cannot label missing sources or unsupported opening positions complete', () => {
  assert.equal(ledgerHistoryCoverageSchema.safeParse({ ...coverage, missingSourceKinds: ['bank'] }).success, false);
  assert.equal(ledgerHistoryCoverageSchema.safeParse({ ...coverage, unsupportedOpeningBalanceAccountIds: [cashId] }).success, false);
  assert.equal(ledgerHistoryCoverageSchema.safeParse({ ...coverage, selectedFrom: '2026-11-01' }).success, false);
  assert.equal(ledgerHistoryCoverageSchema.safeParse({ ...coverage, availableThrough: '2026-09-30' }).success, false);
  assert.equal(ledgerHistoryCoverageSchema.safeParse({ ...coverage, availableFrom: null }).success, false);
});

test('review-only unclassified cash movements are excluded from classified cash flow', () => {
  const unclassified = { transactionId: sourceId, date: '2026-10-10', amountMinor: '1250', direction: 'out', classification: null, reviewRequired: true };
  assert.equal(ledgerCashFlowMovementSchema.safeParse(unclassified).success, true);
  assert.equal(ledgerCashFlowMovementSchema.safeParse({ ...unclassified, reviewRequired: false }).success, false);
});

test('trial balance requires matching exact row totals and report coverage', () => {
  const report = { workspaceId: workspace, asOf: '2026-10-10', currency: 'PKR', rows: [
    { accountId: cashId, code: '1000', name: 'Bank', debitMinor: '0', creditMinor: '1250' },
    { accountId: expenseId, code: '6000', name: 'Expense', debitMinor: '1250', creditMinor: '0' },
  ], debitTotalMinor: '1250', creditTotalMinor: '1250', coverage };
  assert.equal(ledgerTrialBalanceSchema.safeParse(report).success, true);
  assert.equal(ledgerTrialBalanceSchema.safeParse({ ...report, debitTotalMinor: '1251' }).success, false);
  assert.equal(ledgerTrialBalanceSchema.safeParse({ ...report, creditTotalMinor: '1251' }).success, false);
  assert.equal(ledgerTrialBalanceSchema.safeParse({ ...report, rows: [report.rows[0], report.rows[0]], debitTotalMinor: '0', creditTotalMinor: '2500' }).success, false);
});

test('derived report amounts may exceed the persisted bigint ceiling', () => {
  const aggregate = '18446744073709551614';
  const trialBalance = { workspaceId: workspace, asOf: '2026-10-10', currency: 'PKR', rows: [
    { accountId: cashId, code: '1000', name: 'Bank', debitMinor: aggregate, creditMinor: '0' },
    { accountId: payableId, code: '2000', name: 'Payable', debitMinor: '0', creditMinor: aggregate },
  ], debitTotalMinor: aggregate, creditTotalMinor: aggregate, coverage };
  assert.equal(ledgerTrialBalanceSchema.safeParse(trialBalance).success, true);
  const cashFlow = { workspaceId: workspace, from: '2026-10-10', to: '2026-10-10', currency: 'PKR', method: 'direct',
    operatingInflowMinor: aggregate, operatingOutflowMinor: aggregate, operatingNetMinor: '0',
    investingInflowMinor: '0', investingOutflowMinor: '0', investingNetMinor: '0', financingInflowMinor: '0',
    financingOutflowMinor: '0', financingNetMinor: '0', unclassifiedInflowMinor: '0', unclassifiedOutflowMinor: '0',
    unclassifiedNetMinor: '0', netCashMovementMinor: '0', ledgerCashMovementMinor: '0', reconcilesToLedger: true, unclassifiedCount: 0, coverage };
  assert.equal(ledgerCashFlowStatementSchema.safeParse(cashFlow).success, true);
});
