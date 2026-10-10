import Link from 'next/link';
import { readPlatformConfiguration } from '../lib/server/configuration.ts';
export const dynamic = 'force-dynamic';
export default function Home() {
  const configured = readPlatformConfiguration();
  return <main><h1>Raqam</h1><p>Reviewed bookkeeping for your business.</p>
    {configured ? <Link href="/sign-in">Sign in</Link> : <p>Account setup is pending. Configure Clerk and Supabase to open your workspace.</p>}
  </main>;
}
