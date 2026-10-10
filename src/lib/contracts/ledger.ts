// Proposed shared ledger contract v0.1. This remains a proposal until Person 2
// reviews the lifecycle and synthetic examples; server code must supply trusted scope.
import { z } from 'zod';
import type { MinorUnits } from './index.ts';
import { dateSchema, minorUnitsSchema } from './schemas.ts';

export const ledgerAccountTypeSchema = z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']);
export const ledgerCashFlowClassSchema = z.enum(['operating', 'investing', 'financing', 'non_cash', 'unclassified']);
export const ledgerAccountRoleSchema = z.enum(['cash', 'receivable', 'payable', 'revenue', 'expense', 'unclassified_cash_clearing', 'opening_balance', 'other']);
export const ledgerReviewStateSchema = z.enum(['draft', 'needs_review', 'accepted', 'rejected', 'posted']);
export const ledgerReviewTransitionSchema = z.strictObject({ from: ledgerReviewStateSchema, to: ledgerReviewStateSchema })
  .refine(value => isLedgerReviewTransitionAllowed(value.from, value.to), 'Invalid ledger review state transition');
const allowedReviewTransitions: Readonly<Record<z.infer<typeof ledgerReviewStateSchema>, ReadonlySet<z.infer<typeof ledgerReviewStateSchema>>>> = {
  draft: new Set(['needs_review']), needs_review: new Set(['accepted', 'rejected']),
  accepted: new Set(['posted']), rejected: new Set(), posted: new Set(),
};
export function isLedgerReviewTransitionAllowed(from: z.infer<typeof ledgerReviewStateSchema>, to: z.infer<typeof ledgerReviewStateSchema>): boolean {
  return allowedReviewTransitions[from].has(to);
}
export const ledgerReviewDecisionSchema = z.strictObject({
  id: z.uuid(), workspaceId: z.uuid(), targetId: z.uuid(), targetKind: z.enum(['account', 'journal', 'cash_movement']),
  action: z.enum(['accept', 'reject', 'correct', 'post', 'reverse']), expectedVersion: z.number().int().min(0).max(2147483647),
  actorSubject: z.string().trim().min(1).max(255), reason: z.string().trim().min(1).max(1000).nullable(),
  previous: z.unknown(), current: z.unknown(), createdAt: z.iso.datetime({ offset: true }),
});
export const ledgerEvidenceLocatorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('statement_row'), rowNumber: z.number().int().min(2) }),
  z.strictObject({ kind: z.literal('document_field'), field: z.enum(['document_date', 'service_date', 'goods_received_date', 'total', 'currency', 'reference']),
    pageNumber: z.number().int().min(1).nullable(), occurrence: z.number().int().min(0).max(100).default(0) }),
  z.strictObject({ kind: z.literal('owner_decision'), decisionId: z.uuid(), field: z.enum(['service_date', 'goods_received_date', 'opening_balance']) }),
]);
const sourceLocatorField = { locator: ledgerEvidenceLocatorSchema.nullable().optional() };
export const ledgerSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...sourceLocatorField, kind: z.literal('bank_transaction'), transactionId: z.uuid() }),
  z.strictObject({ ...sourceLocatorField, kind: z.literal('document'), documentId: z.uuid() }),
  z.strictObject({ ...sourceLocatorField, kind: z.literal('supplier_bill'), billId: z.uuid() }),
  z.strictObject({ ...sourceLocatorField, kind: z.literal('invoice'), invoiceId: z.uuid() }), // Customer invoice.
  z.strictObject({ ...sourceLocatorField, kind: z.literal('manual_payment'), paymentId: z.uuid() }),
  z.strictObject({ ...sourceLocatorField, kind: z.literal('manual_note'), noteId: z.uuid() }),
  z.strictObject({ ...sourceLocatorField, kind: z.literal('opening_balance'), cutoverDate: dateSchema, evidenceId: z.uuid() }),
]);
export const ledgerRecognitionEvidenceSchema = z.strictObject({
  basis: z.enum(['service_delivery', 'goods_received', 'opening_balance', 'correction']),
  date: dateSchema, source: ledgerSourceSchema, reviewDecisionId: z.uuid(),
}).superRefine((evidence, ctx) => {
  if (!evidence.source.locator) ctx.addIssue({ code: 'custom', path: ['source', 'locator'], message: 'Recognition date evidence requires a source locator' });
  if (evidence.basis === 'service_delivery' && evidence.source.kind !== 'invoice' && evidence.source.kind !== 'document' && evidence.source.kind !== 'manual_note') {
    ctx.addIssue({ code: 'custom', path: ['source'], message: 'Service delivery needs invoice, document, or written-note evidence' });
  }
  if (evidence.basis === 'goods_received' && evidence.source.kind !== 'supplier_bill' && evidence.source.kind !== 'document' && evidence.source.kind !== 'manual_note') {
    ctx.addIssue({ code: 'custom', path: ['source'], message: 'Goods receipt needs bill, document, or written-note evidence' });
  }
  if (evidence.basis === 'opening_balance' && (evidence.source.kind !== 'opening_balance' || evidence.date !== evidence.source.cutoverDate))
    ctx.addIssue({ code: 'custom', path: ['source'], message: 'Opening balance evidence must match its cutover source and date' });
});
export const ledgerExceptionSchema = z.strictObject({
  id: z.uuid(), workspaceId: z.uuid(), kind: z.enum(['unclassified_cash', 'missing_service_date', 'source_conflict', 'unsupported_opening_balance', 'duplicate_cash_link', 'unbalanced_journal']),
  state: z.enum(['open', 'resolved', 'dismissed']), source: ledgerSourceSchema.nullable(), targetId: z.uuid().nullable(),
  reason: z.string().trim().min(1).max(1000), openedAt: z.iso.datetime({ offset: true }), resolvedAt: z.iso.datetime({ offset: true }).nullable(),
}).superRefine((exception, ctx) => {
  if ((exception.state === 'open') !== (exception.resolvedAt === null)) ctx.addIssue({ code: 'custom', path: ['resolvedAt'], message: 'Open exceptions have no resolution timestamp; closed exceptions require one' });
});

export const ledgerAccountSchema = z.strictObject({
  id: z.uuid(), workspaceId: z.uuid(), code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(120), type: ledgerAccountTypeSchema,
  cashFlowClass: ledgerCashFlowClassSchema.nullable(), role: ledgerAccountRoleSchema,
  isCashAccount: z.boolean(), active: z.boolean(), version: z.number().int().min(0).max(2147483647),
}).superRefine((account, ctx) => {
  if (account.isCashAccount && account.type !== 'asset') ctx.addIssue({ code: 'custom', path: ['type'], message: 'Cash accounts must be assets' });
  if ((account.role === 'cash') !== account.isCashAccount) ctx.addIssue({ code: 'custom', path: ['isCashAccount'], message: 'Cash role and cash-account flag must agree' });
  if (account.role === 'receivable' && account.type !== 'asset') ctx.addIssue({ code: 'custom', path: ['type'], message: 'Receivables must be assets' });
  if (account.role === 'payable' && account.type !== 'liability') ctx.addIssue({ code: 'custom', path: ['type'], message: 'Payables must be liabilities' });
  if (account.role === 'revenue' && account.type !== 'revenue') ctx.addIssue({ code: 'custom', path: ['type'], message: 'Revenue role requires revenue account type' });
  if (account.role === 'expense' && account.type !== 'expense') ctx.addIssue({ code: 'custom', path: ['type'], message: 'Expense role requires expense account type' });
  if (account.isCashAccount && account.cashFlowClass !== null) ctx.addIssue({ code: 'custom', path: ['cashFlowClass'], message: 'Cash-account classification is derived from its reviewed movements' });
  if (account.role === 'unclassified_cash_clearing' && (account.type !== 'asset' || account.isCashAccount || account.cashFlowClass !== 'unclassified'))
    ctx.addIssue({ code: 'custom', path: ['role'], message: 'Review-only cash clearing is an unclassified, non-cash asset' });
});
export const ledgerAccountCommandSchema = z.strictObject({
  requestId: z.uuid(), id: z.uuid().nullable(), expectedVersion: z.number().int().min(0).max(2147483647).nullable(),
  code: z.string().trim().min(1).max(32), name: z.string().trim().min(1).max(120),
  type: ledgerAccountTypeSchema, cashFlowClass: ledgerCashFlowClassSchema.nullable(), role: ledgerAccountRoleSchema,
  isCashAccount: z.boolean(), active: z.boolean(),
}).superRefine((account, ctx) => {
  if ((account.role === 'cash') !== account.isCashAccount || (account.isCashAccount && account.type !== 'asset'))
    ctx.addIssue({ code: 'custom', path: ['isCashAccount'], message: 'Cash role must be an asset cash account' });
  if (account.isCashAccount && account.cashFlowClass !== null)
    ctx.addIssue({ code: 'custom', path: ['cashFlowClass'], message: 'Cash-flow grouping is assigned from reviewed movements' });
  if (account.role === 'receivable' && account.type !== 'asset') ctx.addIssue({ code: 'custom', path: ['type'], message: 'Receivables must be assets' });
  if (account.role === 'payable' && account.type !== 'liability') ctx.addIssue({ code: 'custom', path: ['type'], message: 'Payables must be liabilities' });
  if (account.role === 'revenue' && account.type !== 'revenue') ctx.addIssue({ code: 'custom', path: ['type'], message: 'Revenue role requires revenue account type' });
  if (account.role === 'expense' && account.type !== 'expense') ctx.addIssue({ code: 'custom', path: ['type'], message: 'Expense role requires expense account type' });
  if (account.role === 'unclassified_cash_clearing' && (account.type !== 'asset' || account.isCashAccount || account.cashFlowClass !== 'unclassified'))
    ctx.addIssue({ code: 'custom', path: ['role'], message: 'Review-only cash clearing is an unclassified, non-cash asset' });
  if ((account.id === null) !== (account.expectedVersion === null))
    ctx.addIssue({ code: 'custom', path: ['expectedVersion'], message: 'Create has no ID/version; update requires both ID and expected version' });
});

export const ledgerLineSchema = z.strictObject({
  id: z.uuid(), accountId: z.uuid(), debitMinor: minorUnitsSchema, creditMinor: minorUnitsSchema,
  memo: z.string().trim().max(500).nullable(),
}).superRefine((line, ctx) => {
  const debit = BigInt(line.debitMinor); const credit = BigInt(line.creditMinor);
  if ((debit > 0n) === (credit > 0n)) ctx.addIssue({ code: 'custom', message: 'A line must contain exactly one positive debit or credit' });
});

const journalFields = {
  id: z.uuid(), entryDate: dateSchema, description: z.string().trim().min(1).max(500),
  currency: z.literal('PKR'), sources: z.array(ledgerSourceSchema).max(10),
  recognitionEvidence: ledgerRecognitionEvidenceSchema.nullable(),
  cashMovement: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('bank_transaction'), transactionId: z.uuid() }),
    z.strictObject({ kind: z.literal('manual_payment'), paymentId: z.uuid() }),
  ]).nullable(),
  reversalOfId: z.uuid().nullable(), reversalReason: z.string().trim().min(1).max(1000).nullable(),
  lines: z.array(ledgerLineSchema).min(2).max(500),
};
export const ledgerJournalDraftSchema = z.strictObject({
  requestId: z.uuid(), expectedVersion: z.number().int().min(0).max(2147483647).nullable(),
  ...journalFields,
}).superRefine((journal, ctx) => {
  validateBalancedAndUniqueLines(journal, ctx);
  validateJournalSourceLinks(journal, ctx);
});

export const ledgerJournalSchema = z.strictObject({
  ...journalFields, workspaceId: z.uuid(), status: z.enum(['draft', 'posted']),
  version: z.number().int().min(0).max(2147483647), postedAt: z.iso.datetime({ offset: true }).nullable(),
  postedBy: z.string().min(1).max(255).nullable(),
}).superRefine((journal, ctx) => {
  validateBalancedAndUniqueLines(journal, ctx);
  validateJournalSourceLinks(journal, ctx);
  if (journal.status === 'draft' && (journal.postedAt !== null || journal.postedBy !== null))
    ctx.addIssue({ code: 'custom', path: ['status'], message: 'Draft journals cannot have posting metadata' });
  if (journal.status === 'posted' && (journal.postedAt === null || journal.postedBy === null))
    ctx.addIssue({ code: 'custom', path: ['status'], message: 'Posted state requires posting metadata; draft cannot have it' });
  if ((journal.reversalOfId === null) !== (journal.reversalReason === null))
    ctx.addIssue({ code: 'custom', path: ['reversalReason'], message: 'A reversal entry and its reason must be linked together' });
});

function validateBalancedAndUniqueLines(value: { lines: Array<{ id: string; accountId: string; debitMinor: string; creditMinor: string }> }, ctx: z.RefinementCtx) {
  const ids = new Set<string>(); let debits = 0n; let credits = 0n;
  for (const [index, line] of value.lines.entries()) {
    if (ids.has(line.id)) ctx.addIssue({ code: 'custom', path: ['lines', index, 'id'], message: 'Duplicate journal line ID' });
    ids.add(line.id);
    debits += BigInt(line.debitMinor); credits += BigInt(line.creditMinor);
  }
  if (debits !== credits) ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Journal debits must equal credits exactly' });
  if (debits === 0n) ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Journal total must be positive' });
}

function validateJournalSourceLinks(value: { sources: Array<z.infer<typeof ledgerSourceSchema>>; cashMovement: { kind: string; transactionId?: string; paymentId?: string } | null; recognitionEvidence?: z.infer<typeof ledgerRecognitionEvidenceSchema> | null }, ctx: z.RefinementCtx) {
  const keys = new Set<string>();
  for (const [index, source] of value.sources.entries()) {
    const key = `${source.kind}:${sourceRecordId(source)}`;
    if (keys.has(key)) ctx.addIssue({ code: 'custom', path: ['sources', index], message: 'Duplicate source link' });
    keys.add(key);
  }
  if (value.cashMovement) {
    const cashKey = `${value.cashMovement.kind}:${value.cashMovement.transactionId ?? value.cashMovement.paymentId}`;
    if (!keys.has(cashKey)) ctx.addIssue({ code: 'custom', path: ['cashMovement'], message: 'Cash movement must be one of the linked source records' });
  }
  if (value.recognitionEvidence) {
    const evidenceKey = `${value.recognitionEvidence.source.kind}:${sourceRecordId(value.recognitionEvidence.source)}`;
    if (!keys.has(evidenceKey)) ctx.addIssue({ code: 'custom', path: ['recognitionEvidence', 'source'], message: 'Recognition evidence must be one of the linked source records' });
  }
  const journal = value as typeof value & { reversalOfId?: string | null; reversalReason?: string | null };
  if ((journal.reversalOfId === null) !== (journal.reversalReason === null))
    ctx.addIssue({ code: 'custom', path: ['reversalReason'], message: 'A reversal entry and its reason must be linked together' });
}

export type TrustedLedgerContext = {
  workspaceId: string;
  accounts: ReadonlyMap<string, z.infer<typeof ledgerAccountSchema>>;
  currentVersions?: ReadonlyMap<string, number>;
  sourceKeys?: ReadonlySet<string>;
  currentJournals?: ReadonlyMap<string, z.infer<typeof ledgerJournalSchema>>;
  reversedJournalIds?: ReadonlySet<string>;
  // Only IDs of owner-approved decisions whose date/value/source match the loaded record.
  reviewedRecognitionDecisionIds?: ReadonlySet<string>;
};

// Run after schema parsing, using accounts loaded by the authenticated server.
// Never accept this context or workspace scope from the browser/model.
export function validateLedgerJournalCommand(command: z.infer<typeof ledgerJournalDraftSchema>, trusted: TrustedLedgerContext): void {
  const currentVersion = trusted.currentVersions?.get(command.id);
  const currentJournal = trusted.currentJournals?.get(command.id);
  if (command.expectedVersion !== null) {
    if (currentVersion !== undefined && currentVersion !== command.expectedVersion) throw new Error('STALE_VERSION');
    if (!currentJournal) throw new Error('JOURNAL_STATE_UNAVAILABLE');
    if (currentJournal.version !== command.expectedVersion) throw new Error('STALE_VERSION');
    if (currentJournal.workspaceId !== trusted.workspaceId) throw new Error('FOREIGN_JOURNAL');
    if (currentJournal.status === 'posted') throw new Error('POSTED_JOURNAL_IMMUTABLE');
  }
  if (command.expectedVersion === null && (currentVersion !== undefined || currentJournal !== undefined))
    throw new Error('DUPLICATE_JOURNAL_ID');
  for (const source of command.sources) if (!trusted.sourceKeys?.has(`${source.kind}:${sourceRecordId(source)}`))
    throw new Error('UNSUPPORTED_OR_FOREIGN_SOURCE');
  if (command.cashMovement && !trusted.sourceKeys?.has(cashMovementKey(command.cashMovement)))
    throw new Error('UNSUPPORTED_OR_FOREIGN_CASH_MOVEMENT');
  for (const line of command.lines) {
    const account = trusted.accounts.get(line.accountId);
    if (!account || account.workspaceId !== trusted.workspaceId) throw new Error('UNSUPPORTED_OR_FOREIGN_ACCOUNT');
    if (!account.active) throw new Error('INACTIVE_ACCOUNT');
  }
  const touchesCash = command.lines.some(line => trusted.accounts.get(line.accountId)?.isCashAccount);
  if (touchesCash && !command.cashMovement) {
    const evidence = command.recognitionEvidence;
    const openingEvidenceSource = evidence?.source.kind === 'opening_balance' ? evidence.source : null;
    const hasReviewedOpeningBalance = evidence?.basis === 'opening_balance' && openingEvidenceSource !== null &&
      command.sources.some(source => source.kind === 'opening_balance' && source.evidenceId === openingEvidenceSource.evidenceId &&
        source.cutoverDate === command.entryDate) && trusted.reviewedRecognitionDecisionIds?.has(evidence.reviewDecisionId);
    const reversesCashJournal = command.reversalOfId !== null &&
      trusted.currentJournals?.get(command.reversalOfId)?.cashMovement !== null &&
      trusted.currentJournals?.get(command.reversalOfId)?.cashMovement !== undefined;
    if (!hasReviewedOpeningBalance && !reversesCashJournal) throw new Error('CASH_MOVEMENT_REQUIRED');
  }
  if (command.cashMovement && !touchesCash) throw new Error('CASH_MOVEMENT_WITHOUT_CASH_ACCOUNT');
  if (command.reversalOfId) {
    const original = trusted.currentJournals?.get(command.reversalOfId);
    if (!original || original.workspaceId !== trusted.workspaceId || original.status !== 'posted') throw new Error('REVERSAL_TARGET_UNAVAILABLE');
    if (trusted.reversedJournalIds?.has(command.reversalOfId)) throw new Error('JOURNAL_ALREADY_REVERSED');
    const originalAmounts = new Map<string, { debit: bigint; credit: bigint }>();
    const reversalAmounts = new Map<string, { debit: bigint; credit: bigint }>();
    for (const line of original.lines) {
      const current = originalAmounts.get(line.accountId) ?? { debit: 0n, credit: 0n };
      current.debit += BigInt(line.debitMinor); current.credit += BigInt(line.creditMinor);
      originalAmounts.set(line.accountId, current);
    }
    for (const line of command.lines) {
      const current = reversalAmounts.get(line.accountId) ?? { debit: 0n, credit: 0n };
      current.debit += BigInt(line.debitMinor); current.credit += BigInt(line.creditMinor);
      reversalAmounts.set(line.accountId, current);
    }
    const accountIds = new Set([...originalAmounts.keys(), ...reversalAmounts.keys()]);
    for (const accountId of accountIds) {
      const originalLine = originalAmounts.get(accountId) ?? { debit: 0n, credit: 0n };
      const reversedLine = reversalAmounts.get(accountId) ?? { debit: 0n, credit: 0n };
      if (originalLine.debit !== reversedLine.credit || originalLine.credit !== reversedLine.debit)
        throw new Error('REVERSAL_MUST_EXACTLY_REVERSE_ORIGINAL');
    }
  }
  const requiresRecognitionEvidence = command.lines.some(line => {
    const type = trusted.accounts.get(line.accountId)?.type;
    return type === 'revenue' || type === 'expense';
  });
  if (requiresRecognitionEvidence) {
    const evidence = command.recognitionEvidence;
    if (!evidence || evidence.date !== command.entryDate) throw new Error('RECOGNITION_EVIDENCE_REQUIRED');
    if (command.reversalOfId && evidence.basis !== 'correction') throw new Error('REVERSAL_REQUIRES_CORRECTION_EVIDENCE');
    const evidenceKey = `${evidence.source.kind}:${sourceRecordId(evidence.source)}`;
    if (!keysForSources(command.sources).has(evidenceKey)) throw new Error('UNLINKED_RECOGNITION_EVIDENCE');
    if (!trusted.reviewedRecognitionDecisionIds?.has(evidence.reviewDecisionId)) throw new Error('RECOGNITION_DATE_NOT_REVIEWED');
  }
}

function keysForSources(sources: readonly z.infer<typeof ledgerSourceSchema>[]): Set<string> {
  return new Set(sources.map(source => `${source.kind}:${sourceRecordId(source)}`));
}

function sourceRecordId(source: z.infer<typeof ledgerSourceSchema>): string {
  if ('transactionId' in source) return source.transactionId;
  if ('documentId' in source) return source.documentId;
  if ('billId' in source) return source.billId;
  if ('invoiceId' in source) return source.invoiceId;
  if ('paymentId' in source) return source.paymentId;
  if ('noteId' in source) return source.noteId;
  return source.evidenceId;
}

function cashMovementKey(movement: { kind: 'bank_transaction'; transactionId: string } | { kind: 'manual_payment'; paymentId: string }): string {
  return movement.kind === 'bank_transaction' ? `bank_transaction:${movement.transactionId}` : `manual_payment:${movement.paymentId}`;
}

export const ledgerJournalBatchSchema = z.strictObject({
  requestId: z.uuid(), expectedCount: z.number().int().min(1).max(100),
  journals: z.array(ledgerJournalDraftSchema).min(1).max(100),
}).superRefine((batch, ctx) => {
  if (batch.journals.length !== batch.expectedCount) ctx.addIssue({ code: 'custom', path: ['journals'], message: 'Batch is incomplete' });
  const journalIds = new Set<string>(); const requests = new Set<string>();
  const cashMovements = new Set<string>();
  for (const [index, journal] of batch.journals.entries()) {
    if (journalIds.has(journal.id)) ctx.addIssue({ code: 'custom', path: ['journals', index, 'id'], message: 'Duplicate journal ID in batch' });
    if (requests.has(journal.requestId)) ctx.addIssue({ code: 'custom', path: ['journals', index, 'requestId'], message: 'Duplicate journal request ID in batch' });
    if (journal.cashMovement) {
      const cashKey = cashMovementKey(journal.cashMovement);
      if (cashMovements.has(cashKey)) ctx.addIssue({ code: 'custom', path: ['journals', index, 'cashMovement'], message: 'A cash movement may be posted only once per batch' });
      cashMovements.add(cashKey);
    }
    journalIds.add(journal.id); requests.add(journal.requestId);
  }
});

export const ledgerReportRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('trial_balance'), asOf: dateSchema }),
  z.strictObject({ kind: z.literal('balance_sheet'), asOf: dateSchema }),
  z.strictObject({ kind: z.literal('income_statement'), from: dateSchema, to: dateSchema }),
  z.strictObject({ kind: z.literal('cash_flow'), from: dateSchema, to: dateSchema, method: z.literal('direct') }),
]).superRefine((report, ctx) => {
  if ('from' in report && report.from > report.to) ctx.addIssue({ code: 'custom', path: ['from'], message: 'Report range is reversed' });
});
export const ledgerHistoryRangeInputSchema=z.strictObject({selectedFrom:dateSchema,selectedThrough:dateSchema})
 .refine(value=>value.selectedFrom<=value.selectedThrough,{path:['selectedThrough'],message:'Selected history range is reversed'});

export const ledgerHistoryCoverageSchema = z.strictObject({
  workspaceId: z.uuid(), selectedFrom: dateSchema, selectedThrough: dateSchema,
  availableFrom: dateSchema.nullable(), availableThrough: dateSchema.nullable(),
  isComplete: z.boolean(), missingSourceKinds: z.array(z.enum(['bank', 'customer_invoice', 'supplier_bill', 'manual_payment'])).max(4),
  unsupportedOpeningBalanceAccountIds: z.array(z.uuid()).max(500),
}).superRefine((coverage, ctx) => {
  if (coverage.selectedFrom > coverage.selectedThrough) ctx.addIssue({ code: 'custom', path: ['selectedFrom'], message: 'Selected history range is reversed' });
  if (coverage.availableFrom && coverage.availableThrough && coverage.availableFrom > coverage.availableThrough)
    ctx.addIssue({ code: 'custom', path: ['availableFrom'], message: 'Available history range is reversed' });
  if (coverage.isComplete && (!coverage.availableFrom || !coverage.availableThrough || coverage.availableFrom > coverage.selectedFrom || coverage.availableThrough < coverage.selectedThrough))
    ctx.addIssue({ code: 'custom', path: ['isComplete'], message: 'Complete history must cover the full user-selected range' });
  if (coverage.isComplete && (coverage.missingSourceKinds.length || coverage.unsupportedOpeningBalanceAccountIds.length))
    ctx.addIssue({ code: 'custom', path: ['isComplete'], message: 'Incomplete evidence cannot be marked complete' });
});

export const ledgerTrialBalanceSchema = z.strictObject({
  workspaceId: z.uuid(), asOf: dateSchema, currency: z.literal('PKR'),
  rows: z.array(z.strictObject({ accountId: z.uuid(), code: z.string().min(1).max(32), name: z.string().min(1).max(120),
    debitMinor: z.string().regex(/^(0|[1-9]\d*)$/), creditMinor: z.string().regex(/^(0|[1-9]\d*)$/) } )).max(1000),
  debitTotalMinor: z.string().regex(/^(0|[1-9]\d*)$/), creditTotalMinor: z.string().regex(/^(0|[1-9]\d*)$/),
  coverage: ledgerHistoryCoverageSchema,
}).superRefine((report, ctx) => {
  const rowIds = new Set<string>();
  for (const [index, row] of report.rows.entries()) {
    if (rowIds.has(row.accountId)) ctx.addIssue({ code: 'custom', path: ['rows', index, 'accountId'], message: 'Each account appears once in a trial balance' });
    rowIds.add(row.accountId);
    if ((BigInt(row.debitMinor) > 0n) === (BigInt(row.creditMinor) > 0n))
      ctx.addIssue({ code: 'custom', path: ['rows', index], message: 'Each trial-balance row has exactly one positive side' });
  }
  const debitRows = report.rows.reduce((sum, row) => sum + BigInt(row.debitMinor), 0n);
  const creditRows = report.rows.reduce((sum, row) => sum + BigInt(row.creditMinor), 0n);
  if (debitRows !== BigInt(report.debitTotalMinor) || creditRows !== BigInt(report.creditTotalMinor) || debitRows !== creditRows)
    ctx.addIssue({ code: 'custom', path: ['debitTotalMinor'], message: 'Trial balance rows and totals must balance exactly' });
  if (report.workspaceId !== report.coverage.workspaceId ||
      report.asOf < report.coverage.selectedFrom || report.asOf > report.coverage.selectedThrough)
    ctx.addIssue({ code: 'custom', path: ['coverage'], message: 'Report scope and history coverage must agree' });
});

// Report totals may be signed and may exceed bigint because they are derived
// sums; individual journal lines remain bounded by the persisted bigint type.
export const ledgerSignedMinorSchema = z.string().regex(/^(0|[1-9]\d*|-[1-9]\d*)$/);
const ledgerBalanceRowSchema = z.strictObject({
  accountId: z.uuid(), code: z.string().min(1).max(32), name: z.string().min(1).max(120),
  balanceMinor: ledgerSignedMinorSchema,
});
const ledgerPeriodFields = { workspaceId: z.uuid(), from: dateSchema, to: dateSchema, currency: z.literal('PKR') };
const ledgerAsOfFields = { workspaceId: z.uuid(), asOf: dateSchema, currency: z.literal('PKR') };

export const ledgerIncomeStatementSchema = z.strictObject({
  ...ledgerPeriodFields, revenueRows: z.array(ledgerBalanceRowSchema).max(1000),
  expenseRows: z.array(ledgerBalanceRowSchema).max(1000), totalRevenueMinor: ledgerSignedMinorSchema,
  totalExpenseMinor: ledgerSignedMinorSchema, netIncomeMinor: ledgerSignedMinorSchema,
  coverage: ledgerHistoryCoverageSchema,
}).superRefine((report, ctx) => {
  const revenue = report.revenueRows.reduce((sum, row) => sum + BigInt(row.balanceMinor), 0n);
  const expenses = report.expenseRows.reduce((sum, row) => sum + BigInt(row.balanceMinor), 0n);
  const rowIds = [...report.revenueRows, ...report.expenseRows].map(row => row.accountId);
  if (report.from > report.to || report.workspaceId !== report.coverage.workspaceId ||
      revenue !== BigInt(report.totalRevenueMinor) || expenses !== BigInt(report.totalExpenseMinor) ||
      revenue - expenses !== BigInt(report.netIncomeMinor) || new Set(rowIds).size !== rowIds.length ||
      report.from < report.coverage.selectedFrom || report.to > report.coverage.selectedThrough) {
    ctx.addIssue({ code: 'custom', path: ['netIncomeMinor'], message: 'Income statement totals, range, and coverage must reconcile' });
  }
});

export const ledgerBalanceSheetSchema = z.strictObject({
  ...ledgerAsOfFields, assetRows: z.array(ledgerBalanceRowSchema).max(1000),
  liabilityRows: z.array(ledgerBalanceRowSchema).max(1000), equityRows: z.array(ledgerBalanceRowSchema).max(1000),
  totalAssetsMinor: ledgerSignedMinorSchema, totalLiabilitiesMinor: ledgerSignedMinorSchema,
  totalEquityMinor: ledgerSignedMinorSchema, currentEarningsMinor: ledgerSignedMinorSchema,
  totalLiabilitiesAndEquityMinor: ledgerSignedMinorSchema, unclassifiedCashBalanceMinor: ledgerSignedMinorSchema,
  isBalanced: z.boolean(), coverage: ledgerHistoryCoverageSchema,
}).superRefine((report, ctx) => {
  const assets = report.assetRows.reduce((sum, row) => sum + BigInt(row.balanceMinor), 0n);
  const liabilities = report.liabilityRows.reduce((sum, row) => sum + BigInt(row.balanceMinor), 0n);
  const equityAccounts = report.equityRows.reduce((sum, row) => sum + BigInt(row.balanceMinor), 0n);
  const equity = equityAccounts + BigInt(report.currentEarningsMinor);
  const equation = liabilities + equity;
  const balanced = assets === equation;
  const rowIds = [...report.assetRows, ...report.liabilityRows, ...report.equityRows].map(row => row.accountId);
  if (report.workspaceId !== report.coverage.workspaceId || assets !== BigInt(report.totalAssetsMinor) ||
      liabilities !== BigInt(report.totalLiabilitiesMinor) || equity !== BigInt(report.totalEquityMinor) ||
      equation !== BigInt(report.totalLiabilitiesAndEquityMinor) || balanced !== report.isBalanced || new Set(rowIds).size !== rowIds.length ||
      report.asOf < report.coverage.selectedFrom || report.asOf > report.coverage.selectedThrough) {
    ctx.addIssue({ code: 'custom', path: ['isBalanced'], message: 'Balance sheet rows, totals, earnings, and accounting equation must reconcile' });
  }
});

export const ledgerCashFlowMovementSchema = z.strictObject({
  transactionId: z.uuid(), date: dateSchema, amountMinor: minorUnitsSchema.refine(value => BigInt(value) > 0n, 'Cash movement must be positive'), direction: z.enum(['in', 'out']),
  classification: z.enum(['operating', 'investing', 'financing']).nullable(), reviewRequired: z.boolean(),
}).superRefine((movement, ctx) => {
  if ((movement.classification === null) !== movement.reviewRequired)
    ctx.addIssue({ code: 'custom', path: ['reviewRequired'], message: 'Unclassified cash movement remains in review and is excluded from classified totals' });
});

const ledgerAggregateMinorSchema = z.string().regex(/^(0|[1-9]\d*)$/);

export const ledgerCashFlowStatementSchema = z.strictObject({
  ...ledgerPeriodFields, method: z.literal('direct'),
  operatingInflowMinor: ledgerAggregateMinorSchema, operatingOutflowMinor: ledgerAggregateMinorSchema, operatingNetMinor: ledgerSignedMinorSchema,
  investingInflowMinor: ledgerAggregateMinorSchema, investingOutflowMinor: ledgerAggregateMinorSchema, investingNetMinor: ledgerSignedMinorSchema,
  financingInflowMinor: ledgerAggregateMinorSchema, financingOutflowMinor: ledgerAggregateMinorSchema, financingNetMinor: ledgerSignedMinorSchema,
  unclassifiedInflowMinor: ledgerAggregateMinorSchema, unclassifiedOutflowMinor: ledgerAggregateMinorSchema, unclassifiedNetMinor: ledgerSignedMinorSchema,
  netCashMovementMinor: ledgerSignedMinorSchema, ledgerCashMovementMinor: ledgerSignedMinorSchema,
  reconcilesToLedger: z.boolean(), unclassifiedCount: z.number().int().min(0), coverage: ledgerHistoryCoverageSchema,
}).superRefine((report, ctx) => {
  const operating = BigInt(report.operatingInflowMinor) - BigInt(report.operatingOutflowMinor);
  const investing = BigInt(report.investingInflowMinor) - BigInt(report.investingOutflowMinor);
  const financing = BigInt(report.financingInflowMinor) - BigInt(report.financingOutflowMinor);
  const unclassified = BigInt(report.unclassifiedInflowMinor) - BigInt(report.unclassifiedOutflowMinor);
  if (report.from > report.to || report.workspaceId !== report.coverage.workspaceId ||
      operating !== BigInt(report.operatingNetMinor) || investing !== BigInt(report.investingNetMinor) ||
      financing !== BigInt(report.financingNetMinor) || unclassified !== BigInt(report.unclassifiedNetMinor) ||
      operating + investing + financing + unclassified !== BigInt(report.netCashMovementMinor) ||
      (BigInt(report.netCashMovementMinor) === BigInt(report.ledgerCashMovementMinor)) !== report.reconcilesToLedger) {
    ctx.addIssue({ code: 'custom', path: ['netCashMovementMinor'], message: 'Cash-flow sections, range, and coverage must reconcile' });
  }
  const hasUnclassifiedAmount = BigInt(report.unclassifiedInflowMinor) !== 0n || BigInt(report.unclassifiedOutflowMinor) !== 0n;
  if ((report.unclassifiedCount === 0) !== !hasUnclassifiedAmount || report.workspaceId !== report.coverage.workspaceId ||
      report.from < report.coverage.selectedFrom || report.to > report.coverage.selectedThrough) {
    ctx.addIssue({ code: 'custom', path: ['unclassifiedCount'], message: 'Cash-flow exception count and coverage must agree' });
  }
});

export type LedgerAccount = z.infer<typeof ledgerAccountSchema>;
export type LedgerJournalDraft = z.infer<typeof ledgerJournalDraftSchema>;
export type LedgerJournal = z.infer<typeof ledgerJournalSchema>;
export type LedgerReportRequest = z.infer<typeof ledgerReportRequestSchema>;
export type LedgerHistoryCoverage = z.infer<typeof ledgerHistoryCoverageSchema>;
export type LedgerCashFlowMovement = z.infer<typeof ledgerCashFlowMovementSchema>;
export type LedgerIncomeStatement = z.infer<typeof ledgerIncomeStatementSchema>;
export type LedgerBalanceSheet = z.infer<typeof ledgerBalanceSheetSchema>;
export type LedgerCashFlowStatement = z.infer<typeof ledgerCashFlowStatementSchema>;
export type LedgerMinorUnits = MinorUnits;
