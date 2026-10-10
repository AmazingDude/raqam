import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../lib/server/http.ts';
import { readLedger, postLedgerJournal,setLedgerHistoryRange } from '../../../lib/server/ledger/persistence.ts';

export const dynamic='force-dynamic';
export async function GET():Promise<Response>{
 return jsonEndpoint(async()=>{const session=await requireSession();const workspace=await requireWorkspace(session);return readLedger(session,workspace);});
}
export async function POST(request:Request):Promise<Response>{
 return jsonEndpoint(async()=>{const session=await requireSession();requireSameOrigin(request,session.configuration.APP_URL);const workspace=await requireWorkspace(session);return postLedgerJournal(session,workspace,await readJson(request,256*1024));},201);
}
export async function PUT(request:Request):Promise<Response>{
 return jsonEndpoint(async()=>{const session=await requireSession();requireSameOrigin(request,session.configuration.APP_URL);const workspace=await requireWorkspace(session);return setLedgerHistoryRange(session,workspace,await readJson(request));});
}
