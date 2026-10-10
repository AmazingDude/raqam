import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../lib/server/http.ts';
import { listExpenseDrafts, saveExpenseDraft } from '../../../lib/server/ledger/expense-drafts.ts';

export const dynamic='force-dynamic';
export async function GET():Promise<Response>{return jsonEndpoint(async()=>{const session=await requireSession();const workspace=await requireWorkspace(session);return listExpenseDrafts(session,workspace);});}
export async function POST(request:Request):Promise<Response>{return jsonEndpoint(async()=>{const session=await requireSession();requireSameOrigin(request,session.configuration.APP_URL);const workspace=await requireWorkspace(session);return saveExpenseDraft(session,workspace,await readJson(request));},201);}
