import 'server-only';
import { z } from 'zod';
import type { Workspace } from '../contracts/index.ts';
import { getCurrentPakistanTaxYear, taxReadinessProfileSchema, taxReadinessSaveSchema, taxReadinessState, type TaxReadinessProfile } from '../contracts/tax-readiness.ts';
import type { RequestSession } from './auth.ts';
import { BackendError } from './errors.ts';

const profileRowSchema = z.strictObject({
  workspace_id: z.uuid(), tax_year: z.number().int().min(2000).max(2200), answers: z.unknown(),
  version: z.number().int().positive(), updated_at: z.iso.datetime({ offset: true }),
});

function mapProfile(row: unknown, workspaceId: string, taxYear: number): TaxReadinessProfile {
  const parsed = profileRowSchema.safeParse(row);
  if (!parsed.success || parsed.data.workspace_id !== workspaceId || parsed.data.tax_year !== taxYear) {
    throw new BackendError('UNAVAILABLE', 'The saved tax profile could not be verified. Reload and try again.');
  }
  const profile = taxReadinessProfileSchema.safeParse({
    workspaceId: parsed.data.workspace_id, taxYear: parsed.data.tax_year,
    answers: parsed.data.answers, version: parsed.data.version, updatedAt: parsed.data.updated_at,
  });
  if (!profile.success) throw new BackendError('UNAVAILABLE', 'The saved tax profile is incomplete or invalid. Contact support before using it.');
  return profile.data;
}

export async function readTaxReadinessProfile(session: RequestSession, workspace: Workspace) {
  if (workspace.ownerSubject !== session.subject) throw new BackendError('NOT_FOUND', 'Workspace not found.');
  const taxYear = getCurrentPakistanTaxYear();
  const { data, error } = await session.database.from('tax_readiness_profiles')
    .select('workspace_id,tax_year,answers,version,updated_at')
    .eq('workspace_id', workspace.id).eq('tax_year', taxYear).maybeSingle();
  if (error) throw new BackendError('UNAVAILABLE', 'Tax readiness profile could not be loaded. Please retry.');
  const profile = data ? mapProfile(data, workspace.id, taxYear) : null;
  return taxReadinessState(taxYear, profile);
}

export async function saveTaxReadinessProfile(session: RequestSession, workspace: Workspace, input: unknown) {
  if (workspace.ownerSubject !== session.subject) throw new BackendError('NOT_FOUND', 'Workspace not found.');
  const parsed = taxReadinessSaveSchema.safeParse(input);
  if (!parsed.success) throw new BackendError('INVALID_INPUT', 'Complete the listed profile choices and explicitly confirm before saving.');
  const currentTaxYear = getCurrentPakistanTaxYear();
  if (parsed.data.taxYear !== currentTaxYear) throw new BackendError('INVALID_INPUT', 'Reload the current Pakistan tax year before saving.');
  const { data, error } = await session.database.rpc('save_tax_readiness_profile', {
    p_tax_year: parsed.data.taxYear, p_answers: parsed.data.answers, p_confirmed: parsed.data.confirmed, p_expected_version: parsed.data.expectedVersion,
  });
  if (error) {
    if (error.code === 'PT409') throw new BackendError('CONFLICT', 'This profile changed in another tab. Reload it before saving your update.');
    if (['22023', '23514', '22P02'].includes(error.code ?? '')) throw new BackendError('INVALID_INPUT', 'The profile choices could not be verified. Review them and try again.');
    if (error.code === 'P0002') throw new BackendError('NOT_FOUND', 'Your workspace could not be found. Reload it and try again.');
    throw new BackendError('UNAVAILABLE', 'Tax readiness profile could not be saved. Please retry.');
  }
  const envelope = z.strictObject({ profile: z.unknown() }).safeParse(data);
  if (!envelope.success) throw new BackendError('UNAVAILABLE', 'The saved profile response could not be verified. Reload and try again.');
  const profile = mapProfile(envelope.data.profile, workspace.id, currentTaxYear);
  if (profile.version !== parsed.data.expectedVersion + 1 || JSON.stringify(profile.answers) !== JSON.stringify(parsed.data.answers)) throw new BackendError('UNAVAILABLE', 'The saved profile version could not be verified. Reload it.');
  return taxReadinessState(currentTaxYear, profile);
}