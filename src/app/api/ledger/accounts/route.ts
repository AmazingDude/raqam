import { requireSession } from '../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../lib/server/workspace.ts';
import { jsonEndpoint,readJson,requireSameOrigin } from '../../../../lib/server/http.ts';
import { readLedger } from '../../../../lib/server/ledger/persistence.ts';
import { saveLedgerAccount } from '../../../../lib/server/ledger/accounts.ts';

export const dynamic='force-dynamic';
export async function GET():Promise<Response>{return jsonEndpoint(async()=>{const session=await requireSession();const workspace=await requireWorkspace(session);const ledger=await readLedger(session,workspace);return {items:ledger.accounts};});}
export async function POST(request:Request):Promise<Response>{return jsonEndpoint(async()=>{const session=await requireSession();requireSameOrigin(request,session.configuration.APP_URL);const workspace=await requireWorkspace(session);return saveLedgerAccount(session,workspace,await readJson(request));},201);}
