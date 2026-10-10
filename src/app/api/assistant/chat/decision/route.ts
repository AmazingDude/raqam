import { requireSession } from '../../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../../lib/server/workspace.ts';
import { jsonEndpoint,readJson,requireSameOrigin } from '../../../../../lib/server/http.ts';
import { chatDecisionSchema } from '../../../../../lib/contracts/chat.ts';
import { BackendError } from '../../../../../lib/server/errors.ts';
import { decideChat } from '../../../../../lib/server/assistant/chat.ts';
export const dynamic='force-dynamic';
export async function POST(request:Request){return jsonEndpoint(async()=>{const s=await requireSession();requireSameOrigin(request,s.configuration.APP_URL);const b=chatDecisionSchema.safeParse(await readJson(request));if(!b.success)throw new BackendError('INVALID_INPUT','Choose a saved proposal to apply or discard.');return decideChat(s,await requireWorkspace(s),b.data);});}
