import { z } from 'zod';

export const TAX_WORKPAPER_TAXPAYER_TYPES = ['individual', 'association_of_persons', 'company', 'not_sure'] as const;
export const TAX_WORKPAPER_RESIDENCY = ['resident', 'non_resident', 'not_sure'] as const;
export const TAX_WORKPAPER_INCOME_SOURCES = [
  'salary', 'business_or_freelance', 'rent', 'bank_profit', 'dividends_or_investments',
  'capital_gains', 'foreign_income', 'other', 'none', 'not_sure',
] as const;

const uniqueList = <T extends readonly [string, ...string[]]>(values: T) => z.array(z.enum(values))
  .min(1).max(values.length).refine(items => new Set(items).size === items.length);

export const taxWorkpaperFactsSchema = z.strictObject({
  taxpayerType: z.enum(TAX_WORKPAPER_TAXPAYER_TYPES),
  residency: z.enum(TAX_WORKPAPER_RESIDENCY),
  incomeSources: uniqueList(TAX_WORKPAPER_INCOME_SOURCES)
    .refine(items => items.length === 1 || !items.some(value => value === 'none' || value === 'not_sure')),
});
export type TaxWorkpaperFacts = z.infer<typeof taxWorkpaperFactsSchema>;

export const taxWorkpaperSaveSchema = z.strictObject({
  taxYear: z.number().int().min(2000).max(2200),
  facts: taxWorkpaperFactsSchema,
  confirmed: z.literal(true),
  expectedVersion: z.number().int().min(0).max(2147483646),
  requestId: z.uuid(),
});
export type TaxWorkpaperSave = z.infer<typeof taxWorkpaperSaveSchema>;

export const taxWorkpaperCaseSchema = z.strictObject({
  id: z.uuid(),
  workspaceId: z.uuid(),
  taxYear: z.number().int().min(2000).max(2200),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  facts: taxWorkpaperFactsSchema,
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime({ offset: true }),
}).refine(item => item.periodStart === `${item.taxYear - 1}-07-01` && item.periodEnd === `${item.taxYear}-06-30`);
export type TaxWorkpaperCase = z.infer<typeof taxWorkpaperCaseSchema>;

export const taxWorkpaperStateSchema = z.strictObject({
  case: taxWorkpaperCaseSchema.nullable(),
  scope: z.enum(['proposed', 'unsupported']),
  calculationReady: z.literal(false),
  blockers: z.array(z.enum([
    'tax_year_scope_unreviewed', 'taxpayer_scope_unreviewed', 'income_scope_unreviewed', 'rules_pack_unavailable',
  ])).min(1),
});
export type TaxWorkpaperState = z.infer<typeof taxWorkpaperStateSchema>;

export const taxWorkpaperReadQuerySchema = z.strictObject({ taxYear: z.coerce.number().int().min(2000).max(2200) });

export function taxWorkpaperState(workpaperCase: TaxWorkpaperCase | null): TaxWorkpaperState {
  const facts = workpaperCase?.facts;
  const blockers: TaxWorkpaperState['blockers'] = ['rules_pack_unavailable'];
  const proposedYear = workpaperCase?.taxYear === 2026;
  const proposedTaxpayer = facts?.taxpayerType === 'individual' && facts.residency === 'resident';
  const supportedSources = new Set(['salary', 'business_or_freelance']);
  const proposedIncome = Boolean(facts && facts.incomeSources.every(source => supportedSources.has(source)));
  if (!proposedYear) blockers.unshift('tax_year_scope_unreviewed');
  if (!proposedTaxpayer) blockers.push('taxpayer_scope_unreviewed');
  if (!proposedIncome) blockers.push('income_scope_unreviewed');
  const scope = proposedYear && proposedTaxpayer && proposedIncome ? 'proposed' : 'unsupported';
  return { case: workpaperCase, scope, calculationReady: false, blockers };
}
