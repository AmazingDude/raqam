import { SignIn } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '../../../components/ui/icon.tsx';
import { ThemeToggle } from '../../../components/ui/theme-provider.tsx';
import s from '../../auth-page.module.css';

export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) redirect('/');
  if ((await auth()).userId) redirect('/workspace');
  return <main className={s.page}><Link href="/" className={s.brand} aria-label="Raqam home"><Logo/></Link><ThemeToggle/><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/workspace" /><Link href="/demo" className={s.exampleLink}>Explore an example first</Link></main>;
}
