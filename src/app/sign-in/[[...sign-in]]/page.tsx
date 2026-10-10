import { SignIn } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import s from '../../auth-page.module.css';

export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) redirect('/');
  if ((await auth()).userId) redirect('/workspace');
  return <main className={s.page}><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/workspace" /></main>;
}
