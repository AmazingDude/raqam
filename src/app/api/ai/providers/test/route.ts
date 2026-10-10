import { requireSession } from '../../../../../lib/server/auth.ts';
import { requireWorkspace } from '../../../../../lib/server/workspace.ts';
import { jsonEndpoint, readJson, requireSameOrigin } from '../../../../../lib/server/http.ts';
import { BackendError } from '../../../../../lib/server/errors.ts';
import { aiProviderMutationSchema } from '../../../../../lib/contracts/ai-providers.ts';
import { providerCredentialForTest } from '../../../../../lib/server/ai-provider-credentials.ts';
import { testAIProviderConnection } from '../../../../../lib/server/ai-provider-check.ts';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function POST(request:Request) {
  return jsonEndpoint(async()=>{
    const session=await requireSession();requireSameOrigin(request,session.configuration.APP_URL);
    const input=aiProviderMutationSchema.safeParse(await readJson(request,2048));
    if(!input.success)throw new BackendError('INVALID_INPUT','Choose a provider to test.');
    const workspace=await requireWorkspace(session),credential=await providerCredentialForTest(session,workspace,input.data.provider);
    return testAIProviderConnection(input.data.provider,credential.apiKey);
  });
}
