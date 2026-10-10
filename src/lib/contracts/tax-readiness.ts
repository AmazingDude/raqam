import { z } from 'zod';

export const TAXPAYER_TYPES = ['individual', 'association_of_persons', 'company', 'not_sure'] as const;
export const TAX_RESIDENCY = ['resident', 'non_resident', 'not_sure'] as const;
export const TAX_REGIONS = [
  'punjab', 'sindh', 'khyber_pakhtunkhwa', 'balochistan', 'islamabad_capital_territory',
  'gilgit_baltistan', 'azad_jammu_kashmir', 'outside_pakistan', 'not_sure',
] as const;
export const TAX_FILING_HISTORY = ['filed_before', 'first_time', 'not_sure'] as const;
export const TAX_INCOME_SOURCES = [
  'salary', 'business_or_freelance', 'rent', 'bank_profit', 'dividends_or_investments',
  'capital_gains', 'foreign_income', 'other', 'none', 'not_sure',
] as const;
export const TAX_RECORDS_ON_HAND = [
  'salary_certificate', 'business_income_expense_records', 'rental_records', 'bank_profit_certificate',
  'investment_statements', 'foreign_income_tax_records', 'prior_year_return', 'withholding_certificates',
  'other', 'not_collected_yet', 'not_sure',
] as const;
export const TAX_WEALTH_RECORDS = [
  'bank_cash_balances', 'property_vehicle_records', 'investment_balances', 'loans_liabilities',
  'major_personal_expenses', 'asset_transfers_gifts', 'not_applicable', 'not_collected_yet', 'not_sure',
] as const;

const selectionList = <T extends readonly [string, ...string[]]>(values: T, max: number) => z.array(z.enum(values))
  .min(1).max(max).refine(items => new Set(items).size === items.length);

export const taxReadinessAnswersSchema = z.strictObject({
  taxpayerType: z.enum(TAXPAYER_TYPES),
  residency: z.enum(TAX_RESIDENCY),
  provinceOrTerritory: z.enum(TAX_REGIONS),
  filingHistory: z.enum(TAX_FILING_HISTORY),
  incomeSources: selectionList(TAX_INCOME_SOURCES, TAX_INCOME_SOURCES.length)
    .refine(items => items.length === 1 || !items.some(value => value === 'none' || value === 'not_sure')),
  recordsOnHand: selectionList(TAX_RECORDS_ON_HAND, TAX_RECORDS_ON_HAND.length)
    .refine(items => items.length === 1 || !items.some(value => value === 'not_collected_yet' || value === 'not_sure')),
  wealthRecords: selectionList(TAX_WEALTH_RECORDS, TAX_WEALTH_RECORDS.length)
    .refine(items => items.length === 1 || !items.some(value => value === 'not_applicable' || value === 'not_collected_yet' || value === 'not_sure')),
});
export type TaxReadinessAnswers = z.infer<typeof taxReadinessAnswersSchema>;

export const taxReadinessSaveSchema = z.strictObject({
  taxYear: z.number().int().min(2000).max(2200),
  answers: taxReadinessAnswersSchema,
  confirmed: z.literal(true),
  expectedVersion: z.number().int().min(0).max(2147483646),
});

export const taxReadinessProfileSchema = z.strictObject({
  workspaceId: z.uuid(),
  taxYear: z.number().int().min(2000).max(2200),
  answers: taxReadinessAnswersSchema,
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type TaxReadinessProfile = z.infer<typeof taxReadinessProfileSchema>;

const REQUIRED_RECORDS_BY_INCOME: Partial<Record<(typeof TAX_INCOME_SOURCES)[number], (typeof TAX_RECORDS_ON_HAND)[number]>> = {
  salary: 'salary_certificate', business_or_freelance: 'business_income_expense_records', rent: 'rental_records',
  bank_profit: 'bank_profit_certificate', dividends_or_investments: 'investment_statements', capital_gains: 'investment_statements',
  foreign_income: 'foreign_income_tax_records', other: 'other',
};

/** Self-reported completeness only; this never implies verified evidence or tax readiness. */
export function taxReadinessCompletion(profile: TaxReadinessProfile | null): { complete: boolean; missing: string[] } {
  if (!profile) return { complete: false, missing: ['Save a tax readiness profile'] };
  const { answers } = profile;
  const missing: string[] = [];
  if (answers.taxpayerType === 'not_sure') missing.push('Confirm taxpayer type');
  if (answers.residency === 'not_sure') missing.push('Confirm tax residency');
  if (answers.provinceOrTerritory === 'not_sure') missing.push('Confirm region');
  if (answers.filingHistory === 'not_sure') missing.push('Confirm filing history');
  if (answers.incomeSources.includes('not_sure')) missing.push('Confirm income sources');
  if (answers.recordsOnHand.includes('not_sure') || answers.recordsOnHand.includes('not_collected_yet')) missing.push('Confirm records on hand');
  if (answers.wealthRecords.includes('not_sure') || answers.wealthRecords.includes('not_collected_yet')) missing.push('Confirm wealth records');
  const available = new Set(answers.recordsOnHand);
  for (const income of answers.incomeSources) {
    const required = REQUIRED_RECORDS_BY_INCOME[income];
    if (required && !available.has(required)) missing.push(`Identify supporting records for ${income.replaceAll('_', ' ')}`);
  }
  return { complete: missing.length === 0, missing };
}

export const taxReadinessStateSchema = z.strictObject({
  taxYear: z.number().int().min(2000).max(2200),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  profile: taxReadinessProfileSchema.nullable(),
}).refine(state => (state.profile === null || state.profile.taxYear === state.taxYear) &&
  state.periodStart === `${state.taxYear - 1}-07-01` && state.periodEnd === `${state.taxYear}-06-30`);

export function getCurrentPakistanTaxYear(at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi', year: 'numeric', month: 'numeric',
  }).formatToParts(at);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Pakistan tax year could not be determined.');
  return year + (month >= 7 ? 1 : 0);
}

export function pakistanTaxPeriod(taxYear: number): { startDate: string; endDate: string } {
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2200) throw new RangeError('Invalid Pakistan tax year.');
  return { startDate: `${taxYear - 1}-07-01`, endDate: `${taxYear}-06-30` };
}

export function taxReadinessState(taxYear = getCurrentPakistanTaxYear(), profile: TaxReadinessProfile | null = null) {
  const period = pakistanTaxPeriod(taxYear);
  return taxReadinessStateSchema.parse({ taxYear, periodStart: period.startDate, periodEnd: period.endDate, profile });
}
