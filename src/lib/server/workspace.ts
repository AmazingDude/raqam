import 'server-only';
import { z } from 'zod';
import type { Workspace } from '../contracts/index.ts';
import type { RequestSession } from './auth.ts';
import { BackendError } from './errors.ts';
export { workspaceInputSchema as createWorkspaceSchema } from '../contracts/schemas.ts';

const workspaceRowSchema = z.strictObject({ id: z.uuid(), owner_subject: z.string().min(1), business_name: z.string().min(1), currency: z.literal('PKR') });
export function mapWorkspaceRow(row: unknown): Workspace {
  const record = workspaceRowSchema.parse(row);
  return { id: record.id, ownerSubject: record.owner_subject, businessName: record.business_name, currency: record.currency };
}
export async function getOwnedWorkspace(session: RequestSession): Promise<Workspace | null> {
  const { data, error } = await session.database.from('workspaces').select('id,owner_subject,business_name,currency').eq('owner_subject', session.subject).maybeSingle();
  if (error) throw new BackendError('UNAVAILABLE', 'Workspace could not be loaded. Please retry.');
  return data ? mapWorkspaceRow(data) : null;
}
export async function requireWorkspace(session: RequestSession): Promise<Workspace> {
  const workspace = await getOwnedWorkspace(session);
  if (!workspace) throw new BackendError('NOT_FOUND', 'Create your business workspace first.');
  return workspace;
}
