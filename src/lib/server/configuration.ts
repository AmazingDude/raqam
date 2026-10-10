import { z } from 'zod';

const configurationSchema = z.object({
  APP_URL: z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol)),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().trim().min(1), CLERK_SECRET_KEY: z.string().trim().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url().refine(value => new URL(value).protocol === 'https:'),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1),
});
export type PlatformConfiguration = z.infer<typeof configurationSchema>;
export function readPlatformConfiguration(env: Record<string, string | undefined> = process.env): PlatformConfiguration | null {
  const effectiveEnv = { ...env };
  if (!effectiveEnv.APP_URL?.trim()) {
    const vercelHost = effectiveEnv.VERCEL_PROJECT_PRODUCTION_URL || effectiveEnv.VERCEL_URL || effectiveEnv.NEXT_PUBLIC_VERCEL_URL;
    if (vercelHost?.trim()) {
      const trimmed = vercelHost.trim();
      effectiveEnv.APP_URL = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    }
  }
  const parsed = configurationSchema.safeParse(effectiveEnv);
  return parsed.success ? parsed.data : null;
}
