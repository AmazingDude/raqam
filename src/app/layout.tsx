import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from '../components/ui/theme-provider.tsx';
import { themeInitScript } from '../lib/client/theme.ts';
import './theme.css';
export const metadata: Metadata = { title: 'Raqam', description: 'Reviewed bookkeeping for a small service business.' };
export default function RootLayout({ children }: { children: ReactNode }) {
  const configured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;
  return <html lang="en" data-theme="dark" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeInitScript}}/></head><body><ThemeProvider>{configured ? <ClerkProvider appearance={{variables:{colorBackground:'var(--rq-surface)',colorForeground:'var(--rq-ink)',colorMuted:'var(--rq-surface-2)',colorMutedForeground:'var(--rq-muted)',colorInput:'var(--rq-canvas)',colorInputForeground:'var(--rq-ink)',colorPrimary:'var(--rq-action)',colorPrimaryForeground:'var(--rq-on-action)',colorBorder:'var(--rq-field-border)',fontFamily:'var(--rq-font)',borderRadius:'0.875rem'}}}>{children}</ClerkProvider> : children}</ThemeProvider></body></html>;
}
