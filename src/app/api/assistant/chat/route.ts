import { requireSession } from '../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../lib/server/workspace.ts';
import { jsonEndpoint,readJson,requireSameOrigin } from '../../../../lib/server/http.ts';
import { chatSendSchema } from '../../../../lib/contracts/chat.ts';
import { BackendError } from '../../../../lib/server/errors.ts';
import { readChat,sendChat } from '../../../../lib/server/assistant/chat.ts';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=60;
export async function GET(request:Request){return jsonEndpoint(async()=>{const s=await requireSession();return readChat(s,await requireWorkspace(s),request);});}
export async function POST(request:Request){return jsonEndpoint(async()=>{const s=await requireSession();requireSameOrigin(request,s.configuration.APP_URL);const b=chatSendSchema.safeParse(await readJson(request,32*1024));if(!b.success)throw new BackendError('INVALID_INPUT','Send a message of 1–6000 characters with a request ID.');return sendChat(s,await requireWorkspace(s),b.data,request.signal);});}
