import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { readPlatformConfiguration } from './configuration.ts';
import { BackendError } from './errors.ts';

export async function requireSession(options: { refreshTokens?: boolean } = {}) {
  const refreshTokens = options.refreshTokens === true;
  const configuration = readPlatformConfiguration();
  if (!configuration) throw new BackendError('UNAVAILABLE', 'Raqam account configuration is incomplete.');
  const session = await auth();
  if (!session.userId) throw new BackendError('UNAUTHENTICATED', 'Sign in to access your workspace.');
  const token = await session.getToken();
  if (!token) throw new BackendError('UNAUTHENTICATED', 'Your session expired. Sign in again.');
  const database = createClient(configuration.NEXT_PUBLIC_SUPABASE_URL, configuration.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    accessToken: async () => {
      if (!refreshTokens) return token;
      // Native session tokens can expire during OCR. Refresh the same verified
      // session for each database request; no JWT template or provider switching.
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const refreshed = await Promise.race([session.getToken({ expiresInSeconds: 60 }),new Promise<never>((_resolve,reject)=>{
        timeout=setTimeout(()=>reject(new BackendError('UNAVAILABLE','Session refresh is unavailable. Please retry.')),5000);
      })]).finally(()=>{if(timeout)clearTimeout(timeout);});
      if (!refreshed) throw new BackendError('UNAUTHENTICATED', 'Your session expired. Sign in again.');
      return refreshed;
    },
    db: { timeout: 10000, retry: false },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { subject: session.userId, database, configuration };
}
export type RequestSession = Awaited<ReturnType<typeof requireSession>>;
