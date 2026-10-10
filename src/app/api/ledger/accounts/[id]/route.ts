import { z } from 'zod';
import { requireSession } from '../../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../../lib/server/workspace.ts';
import { jsonEndpoint,readJson,requireSameOrigin } from '../../../../../lib/server/http.ts';
import { BackendError } from '../../../../../lib/server/errors.ts';
import { saveLedgerAccount } from '../../../../../lib/server/ledger/accounts.ts';

export const dynamic='force-dynamic';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}):Promise<Response>{
 return jsonEndpoint(async()=>{const session=await requireSession();requireSameOrigin(request,session.configuration.APP_URL);const workspace=await requireWorkspace(session);const {id}=await params;
  if(!z.uuid().safeParse(id).success)throw new BackendError('INVALID_INPUT','Use a valid ledger account ID.');
  return saveLedgerAccount(session,workspace,await readJson(request),id);});
}
