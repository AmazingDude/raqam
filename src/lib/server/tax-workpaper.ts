import 'server-only';
import { z } from 'zod';
import type { Workspace } from '../contracts/index.ts';
import {
  taxWorkpaperCaseSchema, taxWorkpaperFactsSchema, taxWorkpaperReadQuerySchema,
  taxWorkpaperSaveSchema, taxWorkpaperState, type TaxWorkpaperCase,
} from '../contracts/tax-workpaper.ts';
import type { RequestSession } from './auth.ts';
import { BackendError } from './errors.ts';

const caseRowSchema = z.strictObject({
  id: z.uuid(), workspace_id: z.uuid(), tax_year: z.number().int().min(2000).max(2200),
  facts: z.unknown(), version: z.number().int().positive(), updated_at: z.iso.datetime({ offset: true }),
});

function mapCase(row: unknown, workspaceId: string, taxYear: number): TaxWorkpaperCase {
  const parsed = caseRowSchema.safeParse(row);
  if (!parsed.success || parsed.data.workspace_id !== workspaceId || parsed.data.tax_year !== taxYear) {
    throw new BackendError('UNAVAILABLE', 'The saved tax workpaper could not be verified. Reload and try again.');
  }
  const facts = taxWorkpaperFactsSchema.safeParse(parsed.data.facts);
  if (!facts.success) throw new BackendError('UNAVAILABLE', 'The saved taxpayer facts are invalid. Contact support before using this case.');
  return taxWorkpaperCaseSchema.parse({
    id: parsed.data.id, workspaceId: parsed.data.workspace_id, taxYear: parsed.data.tax_year,
    periodStart: `${taxYear - 1}-07-01`, periodEnd: `${taxYear}-06-30`, facts: facts.data,
    version: parsed.data.version, updatedAt: parsed.data.updated_at,
  });
}

function parseTaxYear(input: unknown): number {
  const parsed = taxWorkpaperReadQuerySchema.safeParse(input);
  if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Select a valid Pakistan tax year.');
  return parsed.data.taxYear;
}

export async function readTaxWorkpaperCase(session: RequestSession, workspace: Workspace, input: unknown) {
  if (workspace.ownerSubject !== session.subject) throw new BackendError('NOT_FOUND', 'Workspace not found.');
  const taxYear = parseTaxYear(input);
  const { data, error } = await session.database.from('tax_workpaper_cases')
    .select('id,workspace_id,tax_year,facts,version,updated_at')
    .eq('workspace_id', workspace.id).eq('tax_year', taxYear).maybeSingle();
  if (error) throw new BackendError('UNAVAILABLE', 'Tax workpaper could not be loaded. Please retry.');
  return taxWorkpaperState(data ? mapCase(data, workspace.id, taxYear) : null);
}

export async function saveTaxWorkpaperCase(session: RequestSession, workspace: Workspace, input: unknown) {
  if (workspace.ownerSubject !== session.subject) throw new BackendError('NOT_FOUND', 'Workspace not found.');
  const parsed = taxWorkpaperSaveSchema.safeParse(input);
  if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Confirm the taxpayer facts and reload this workpaper before saving.');
  const { data, error } = await session.database.rpc('save_tax_workpaper_case', {
    p_tax_year: parsed.data.taxYear,
    p_facts: parsed.data.facts,
    p_confirmed: parsed.data.confirmed,
    p_expected_version: parsed.data.expectedVersion,
    p_request_id: parsed.data.requestId,
  });
  if (error) {
    if (error.code === 'PT409') throw new BackendError('CONFLICT', 'This workpaper changed in another tab. Reload it before saving.');
    if (['22023', '23514', '22P02'].includes(error.code ?? '')) throw new BackendError('INVALID_INPUT', 'The taxpayer facts could not be verified. Review them and try again.');
    if (error.code === 'P0002') throw new BackendError('NOT_FOUND', 'Your workspace could not be found. Reload it and try again.');
    throw new BackendError('UNAVAILABLE', 'Tax workpaper could not be saved. Please retry.');
  }
  const envelope = z.strictObject({ case: z.unknown(), duplicate: z.boolean() }).safeParse(data);
  if (!envelope.success) throw new BackendError('UNAVAILABLE', 'The saved workpaper response could not be verified. Reload and try again.');
  const saved = mapCase(envelope.data.case, workspace.id, parsed.data.taxYear);
  if (saved.version !== parsed.data.expectedVersion + 1 || JSON.stringify(saved.facts) !== JSON.stringify(parsed.data.facts)) {
    throw new BackendError('UNAVAILABLE', 'The saved workpaper version could not be verified. Reload it before continuing.');
  }
  return taxWorkpaperState(saved);
}
