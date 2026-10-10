import { requireSession } from '../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../../lib/server/http.ts';
import { BackendError } from '../../../../lib/server/errors.ts';
import { aiProviderCredentialInputSchema, aiProviderMutationSchema } from '../../../../lib/contracts/ai-providers.ts';
import { deleteAIProviderConfig, listAIProviderConfigs, saveAIProviderConfig, selectAIProviderConfig } from '../../../../lib/server/ai-provider-credentials.ts';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function GET() {
  return jsonEndpoint(async()=>{const session=await requireSession();return listAIProviderConfigs(session,await requireWorkspace(session));});
}
export async function PUT(request:Request) {
  return jsonEndpoint(async()=>{const session=await requireSession();requireSameOrigin(request,session.configuration.APP_URL);
    const input=aiProviderCredentialInputSchema.safeParse(await readJson(request,4096));
    if(!input.success)throw new BackendError('INVALID_INPUT','Enter a valid provider key and model IDs.');
    return saveAIProviderConfig(session,await requireWorkspace(session),input.data);
  });
}
export async function PATCH(request:Request) {
  return jsonEndpoint(async()=>{const session=await requireSession();requireSameOrigin(request,session.configuration.APP_URL);
    const input=aiProviderMutationSchema.safeParse(await readJson(request,2048));
    if(!input.success)throw new BackendError('INVALID_INPUT','Choose a configured provider.');
    return selectAIProviderConfig(session,await requireWorkspace(session),input.data.provider);
  });
}
export async function DELETE(request:Request) {
  return jsonEndpoint(async()=>{const session=await requireSession();requireSameOrigin(request,session.configuration.APP_URL);
    const input=aiProviderMutationSchema.safeParse(await readJson(request,2048));
    if(!input.success)throw new BackendError('INVALID_INPUT','Choose a provider to remove.');
    return deleteAIProviderConfig(session,await requireWorkspace(session),input.data.provider);
  });
}
