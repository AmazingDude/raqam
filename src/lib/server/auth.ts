import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { readPlatformConfiguration } from './configuration.ts';
import { BackendError } from './errors.ts';

export async function requireSession() {
  const configuration = readPlatformConfiguration();
  if (!configuration) throw new BackendError('UNAVAILABLE', 'Raqam account configuration is incomplete.');
  const session = await auth();
  if (!session.userId) throw new BackendError('UNAUTHENTICATED', 'Sign in to access your workspace.');
  const token = await session.getToken();
  if (!token) throw new BackendError('UNAUTHENTICATED', 'Your session expired. Sign in again.');
  const database = createClient(configuration.NEXT_PUBLIC_SUPABASE_URL, configuration.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { subject: session.userId, database, configuration };
}
export type RequestSession = Awaited<ReturnType<typeof requireSession>>;
