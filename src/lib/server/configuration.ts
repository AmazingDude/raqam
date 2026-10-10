import { z } from 'zod';

const configurationSchema = z.object({
  APP_URL: z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol)),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().trim().min(1), CLERK_SECRET_KEY: z.string().trim().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url().refine(value => new URL(value).protocol === 'https:'),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1),
});
export type PlatformConfiguration = z.infer<typeof configurationSchema>;
export function readPlatformConfiguration(env: Record<string, string | undefined> = process.env): PlatformConfiguration | null {
  const parsed = configurationSchema.safeParse(env);
  return parsed.success ? parsed.data : null;
}
