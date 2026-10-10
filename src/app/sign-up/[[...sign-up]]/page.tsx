import { SignUp } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import s from '../../auth-page.module.css';

export const dynamic = 'force-dynamic';

export default async function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) redirect('/');
  if ((await auth()).userId) redirect('/workspace');
  return <main className={s.page}><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/workspace" /></main>;
}
