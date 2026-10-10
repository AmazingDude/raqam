import 'server-only';

import {
  ledgerAccountSchema,
  ledgerBalanceSheetSchema,
  ledgerCashFlowMovementSchema,
  ledgerCashFlowStatementSchema,
  ledgerHistoryCoverageSchema,
  ledgerIncomeStatementSchema,
  ledgerJournalSchema,
  ledgerTrialBalanceSchema,
  type LedgerAccount,
  type LedgerBalanceSheet,
  type LedgerCashFlowMovement,
  type LedgerCashFlowStatement,
  type LedgerHistoryCoverage,
  type LedgerIncomeStatement,
  type LedgerJournal,
} from '../../contracts/ledger.ts';
import { dateSchema } from '../../contracts/schemas.ts';

type LedgerInputs = {
  workspaceId: string;
  accounts: readonly LedgerAccount[];
  journals: readonly LedgerJournal[];
  coverage: LedgerHistoryCoverage;
};

type LedgerPeriodInputs = LedgerInputs & { from: string; to: string };
type LedgerAsOfInputs = LedgerInputs & { asOf: string };
type AccountBalance = { account: LedgerAccount; debitMinusCredit: bigint };

function requireDate(value: string): void {
  if (!dateSchema.safeParse(value).success) throw new Error('INVALID_REPORT_DATE');
}

function validateAccounts(inputs: LedgerInputs): Map<string, LedgerAccount> {
  const accounts = new Map<string, LedgerAccount>();
  const codes = new Set<string>();
  for (const raw of inputs.accounts) {
    const account = ledgerAccountSchema.parse(raw);
    if (account.workspaceId !== inputs.workspaceId) throw new Error('FOREIGN_ACCOUNT');
    if (accounts.has(account.id)) throw new Error('DUPLICATE_ACCOUNT');
    if (codes.has(account.code)) throw new Error('DUPLICATE_ACCOUNT_CODE');
    accounts.set(account.id, account);
    codes.add(account.code);
  }
  const coverage = ledgerHistoryCoverageSchema.parse(inputs.coverage);
  if (coverage.workspaceId !== inputs.workspaceId) throw new Error('FOREIGN_COVERAGE');
  return accounts;
}

function validatedPostedJournals(inputs: LedgerInputs, accounts: ReadonlyMap<string, LedgerAccount>): LedgerJournal[] {
  const seen = new Set<string>();
  const seenCashMovements = new Set<string>();
  const result: LedgerJournal[] = [];
  for (const raw of inputs.journals) {
    const parsed = ledgerJournalSchema.safeParse(raw);
    if (!parsed.success) throw new Error('INVALID_JOURNAL');
    const journal = parsed.data;
    if (seen.has(journal.id)) throw new Error('DUPLICATE_JOURNAL');
    seen.add(journal.id);
    if (journal.workspaceId !== inputs.workspaceId) throw new Error('FOREIGN_JOURNAL');
    if (journal.status !== 'posted') continue;
    if (journal.cashMovement) {
      const key = journal.cashMovement.kind === 'bank_transaction'
        ? `bank_transaction:${journal.cashMovement.transactionId}`
        : `manual_payment:${journal.cashMovement.paymentId}`;
      if (seenCashMovements.has(key)) throw new Error('DUPLICATE_CASH_MOVEMENT');
      seenCashMovements.add(key);
    }
    for (const line of journal.lines) {
      const account = accounts.get(line.accountId);
      if (!account) throw new Error('UNKNOWN_ACCOUNT');
      if (account.workspaceId !== journal.workspaceId) throw new Error('FOREIGN_ACCOUNT');
    }
    const hasRecognizedActivity = journal.lines.some(line => {
      const type = accounts.get(line.accountId)?.type;
      return type === 'revenue' || type === 'expense';
    });
    if (hasRecognizedActivity && (!journal.recognitionEvidence || journal.recognitionEvidence.date !== journal.entryDate))
      throw new Error('MISSING_RECOGNITION_EVIDENCE');
    result.push(journal);
  }
  return result;
}

function accountBalances(
  journals: readonly LedgerJournal[],
  accounts: ReadonlyMap<string, LedgerAccount>,
  include: (journal: LedgerJournal) => boolean,
): Map<string, AccountBalance> {
  const balances = new Map<string, bigint>();
  for (const journal of journals) {
    if (!include(journal)) continue;
    for (const line of journal.lines) {
      balances.set(line.accountId, (balances.get(line.accountId) ?? 0n) + BigInt(line.debitMinor) - BigInt(line.creditMinor));
    }
  }
  return new Map([...balances].map(([id, debitMinusCredit]) => [id, { account: accounts.get(id)!, debitMinusCredit }]));
}

function reportRows(balances: ReadonlyMap<string, AccountBalance>, select: (account: LedgerAccount) => boolean,
  normalize: (debitMinusCredit: bigint) => bigint) {
  return [...balances.values()]
    .filter(({ account, debitMinusCredit }) => select(account) && debitMinusCredit !== 0n)
    .sort((left, right) => left.account.code < right.account.code ? -1 : left.account.code > right.account.code ? 1 : 0)
    .map(({ account, debitMinusCredit }) => ({
      accountId: account.id, code: account.code, name: account.name, balanceMinor: normalize(debitMinusCredit).toString(),
    }));
}

function sumRows(rows: readonly { balanceMinor: string }[]): bigint {
  return rows.reduce((sum, row) => sum + BigInt(row.balanceMinor), 0n);
}

export function calculateLedgerTrialBalance(inputs: LedgerAsOfInputs) {
  requireDate(inputs.asOf);
  const accounts = validateAccounts(inputs);
  const journals = validatedPostedJournals(inputs, accounts);
  const balances = accountBalances(journals, accounts, journal => journal.entryDate <= inputs.asOf);
  const rows = [...balances.values()]
    .filter(({ debitMinusCredit }) => debitMinusCredit !== 0n)
    .sort((left, right) => left.account.code < right.account.code ? -1 : left.account.code > right.account.code ? 1 : 0)
    .map(({ account, debitMinusCredit }) => ({
      accountId: account.id, code: account.code, name: account.name,
      debitMinor: (debitMinusCredit > 0n ? debitMinusCredit : 0n).toString(),
      creditMinor: (debitMinusCredit < 0n ? -debitMinusCredit : 0n).toString(),
    }));
  const debitTotalMinor = rows.reduce((sum, row) => sum + BigInt(row.debitMinor), 0n).toString();
  const creditTotalMinor = rows.reduce((sum, row) => sum + BigInt(row.creditMinor), 0n).toString();
  return ledgerTrialBalanceSchema.parse({
    workspaceId: inputs.workspaceId, asOf: inputs.asOf, currency: 'PKR', rows,
    debitTotalMinor, creditTotalMinor, coverage: inputs.coverage,
  });
}

export function calculateLedgerIncomeStatement(inputs: LedgerPeriodInputs): LedgerIncomeStatement {
  requireDate(inputs.from); requireDate(inputs.to);
  if (inputs.from > inputs.to) throw new Error('INVALID_REPORT_RANGE');
  const accounts = validateAccounts(inputs);
  const journals = validatedPostedJournals(inputs, accounts);
  const balances = accountBalances(journals, accounts, journal => journal.entryDate >= inputs.from && journal.entryDate <= inputs.to);
  const revenueRows = reportRows(balances, account => account.type === 'revenue', balance => -balance);
  const expenseRows = reportRows(balances, account => account.type === 'expense', balance => balance);
  const totalRevenueMinor = sumRows(revenueRows);
  const totalExpenseMinor = sumRows(expenseRows);
  return ledgerIncomeStatementSchema.parse({
    workspaceId: inputs.workspaceId, from: inputs.from, to: inputs.to, currency: 'PKR', revenueRows, expenseRows,
    totalRevenueMinor: totalRevenueMinor.toString(), totalExpenseMinor: totalExpenseMinor.toString(),
    netIncomeMinor: (totalRevenueMinor - totalExpenseMinor).toString(), coverage: inputs.coverage,
  });
}

export function calculateLedgerBalanceSheet(inputs: LedgerAsOfInputs): LedgerBalanceSheet {
  requireDate(inputs.asOf);
  const accounts = validateAccounts(inputs);
  const journals = validatedPostedJournals(inputs, accounts);
  const balances = accountBalances(journals, accounts, journal => journal.entryDate <= inputs.asOf);
  const assetRows = reportRows(balances, account => account.type === 'asset', balance => balance);
  const liabilityRows = reportRows(balances, account => account.type === 'liability', balance => -balance);
  const equityRows = reportRows(balances, account => account.type === 'equity', balance => -balance);
  // Calculate current earnings from all P&L account balances, regardless of journal
  // line order, using the same normal-balance convention as the income statement.
  const currentEarnings = [...balances.values()].reduce((total, { account, debitMinusCredit }) =>
    total + (account.type === 'revenue' ? -debitMinusCredit : account.type === 'expense' ? -debitMinusCredit : 0n), 0n);
  const totalAssets = sumRows(assetRows);
  const totalLiabilities = sumRows(liabilityRows);
  const totalEquity = sumRows(equityRows) + currentEarnings;
  const liabilitiesAndEquity = totalLiabilities + totalEquity;
  const unclassifiedCash = [...balances.values()].reduce((sum, { account, debitMinusCredit }) =>
    sum + (account.role === 'unclassified_cash_clearing' ? debitMinusCredit : 0n), 0n);
  return ledgerBalanceSheetSchema.parse({
    workspaceId: inputs.workspaceId, asOf: inputs.asOf, currency: 'PKR', assetRows, liabilityRows, equityRows,
    totalAssetsMinor: totalAssets.toString(), totalLiabilitiesMinor: totalLiabilities.toString(), totalEquityMinor: totalEquity.toString(),
    currentEarningsMinor: currentEarnings.toString(), totalLiabilitiesAndEquityMinor: liabilitiesAndEquity.toString(),
    unclassifiedCashBalanceMinor: unclassifiedCash.toString(), isBalanced: totalAssets === liabilitiesAndEquity,
    coverage: inputs.coverage,
  });
}

export function calculateLedgerCashFlow(inputs: {
  workspaceId: string; from: string; to: string; accounts: readonly LedgerAccount[];
  journals: readonly LedgerJournal[]; movements: readonly LedgerCashFlowMovement[]; coverage: LedgerHistoryCoverage;
}): LedgerCashFlowStatement {
  requireDate(inputs.from); requireDate(inputs.to);
  if (inputs.from > inputs.to) throw new Error('INVALID_REPORT_RANGE');
  const accounts = validateAccounts(inputs);
  const coverage = ledgerHistoryCoverageSchema.parse(inputs.coverage);
  if (coverage.workspaceId !== inputs.workspaceId) throw new Error('FOREIGN_COVERAGE');
  const journals = validatedPostedJournals(inputs, accounts);
  const seen = new Set<string>();
  const totals = {
    operatingIn: 0n, operatingOut: 0n, investingIn: 0n, investingOut: 0n, financingIn: 0n, financingOut: 0n,
    unclassifiedIn: 0n, unclassifiedOut: 0n, unclassifiedCount: 0,
  };
  for (const raw of inputs.movements) {
    const movement = ledgerCashFlowMovementSchema.parse(raw);
    if (seen.has(movement.transactionId)) throw new Error('DUPLICATE_CASH_MOVEMENT');
    seen.add(movement.transactionId);
    if (movement.date < inputs.from || movement.date > inputs.to) continue;
    const inflow = movement.direction === 'in';
    if (movement.classification === null) {
      totals.unclassifiedCount++;
      if (inflow) totals.unclassifiedIn += BigInt(movement.amountMinor);
      else totals.unclassifiedOut += BigInt(movement.amountMinor);
      continue;
    }
    const key = movement.classification;
    if (inflow) totals[`${key}In` as 'operatingIn' | 'investingIn' | 'financingIn'] += BigInt(movement.amountMinor);
    else totals[`${key}Out` as 'operatingOut' | 'investingOut' | 'financingOut'] += BigInt(movement.amountMinor);
  }
  const operatingNet = totals.operatingIn - totals.operatingOut;
  const investingNet = totals.investingIn - totals.investingOut;
  const financingNet = totals.financingIn - totals.financingOut;
  const unclassifiedNet = totals.unclassifiedIn - totals.unclassifiedOut;
  const netCashMovement = operatingNet + investingNet + financingNet + unclassifiedNet;
  const cashAccountBalances = accountBalances(journals, accounts,
    journal => journal.entryDate >= inputs.from && journal.entryDate <= inputs.to);
  const ledgerCashMovement = [...cashAccountBalances.values()].reduce((sum, { account, debitMinusCredit }) =>
    sum + (account.isCashAccount ? debitMinusCredit : 0n), 0n);
  return ledgerCashFlowStatementSchema.parse({
    workspaceId: inputs.workspaceId, from: inputs.from, to: inputs.to, currency: 'PKR', method: 'direct',
    operatingInflowMinor: totals.operatingIn.toString(), operatingOutflowMinor: totals.operatingOut.toString(), operatingNetMinor: operatingNet.toString(),
    investingInflowMinor: totals.investingIn.toString(), investingOutflowMinor: totals.investingOut.toString(), investingNetMinor: investingNet.toString(),
    financingInflowMinor: totals.financingIn.toString(), financingOutflowMinor: totals.financingOut.toString(), financingNetMinor: financingNet.toString(),
    unclassifiedInflowMinor: totals.unclassifiedIn.toString(), unclassifiedOutflowMinor: totals.unclassifiedOut.toString(), unclassifiedNetMinor: unclassifiedNet.toString(),
    netCashMovementMinor: netCashMovement.toString(), ledgerCashMovementMinor: ledgerCashMovement.toString(),
    reconcilesToLedger: netCashMovement === ledgerCashMovement,
    unclassifiedCount: totals.unclassifiedCount, coverage,
  });
}
