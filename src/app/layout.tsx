import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
export const metadata: Metadata = { title: 'Raqam', description: 'Reviewed bookkeeping for a small service business.' };
export default function RootLayout({ children }: { children: ReactNode }) {
  const configured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;
  return <html lang="en"><body>{configured ? <ClerkProvider>{children}</ClerkProvider> : children}</body></html>;
}
