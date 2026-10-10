import { requireSession } from '../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../lib/server/workspace.ts';
import { jsonEndpoint,readJson,requireSameOrigin } from '../../../lib/server/http.ts';
import { listSupplierBills,saveSupplierBill } from '../../../lib/server/ledger/supplier-bills.ts';

export const dynamic='force-dynamic';
export async function GET():Promise<Response>{return jsonEndpoint(async()=>{const session=await requireSession();const workspace=await requireWorkspace(session);return listSupplierBills(session,workspace);});}
export async function POST(request:Request):Promise<Response>{return jsonEndpoint(async()=>{const session=await requireSession();requireSameOrigin(request,session.configuration.APP_URL);const workspace=await requireWorkspace(session);return saveSupplierBill(session,workspace,await readJson(request,128*1024));},201);}
