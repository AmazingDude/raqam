import { readPlatformConfiguration } from '../../../lib/server/configuration.ts';
export const dynamic = 'force-dynamic';
export function GET(): Response {
  return Response.json({ status: readPlatformConfiguration() ? 'configured_unverified' : 'setup_required' }, { headers: { 'Cache-Control': 'no-store' } });
}
