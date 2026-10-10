import 'server-only';
import type { Workspace } from '../../contracts/index.ts';
import type { RequestSession } from '../auth.ts';
import { readCashbook } from '../cashbook.ts';
import { BackendError } from '../errors.ts';
import { createCashbookTools } from './cashbook-tools.ts';

// Call after requireSession/requireWorkspace. C receives only these read closures.
export function createScopedCashbookTools(
  session: RequestSession,
  workspace: Workspace,
  budget: { deadlineAt: number; signal?: AbortSignal },
) {
  if (!session.subject || workspace.ownerSubject !== session.subject) {
    throw new BackendError('NOT_FOUND', 'Workspace not found.');
  }
  return createCashbookTools({
    workspaceId: workspace.id,
    readSnapshot: () => readCashbook(session, workspace),
    deadlineAt: budget.deadlineAt,
    ...(budget.signal ? { signal: budget.signal } : {}),
  });
}
