import { SignIn } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) redirect('/');
  return <main><SignIn routing="path" path="/sign-in" /></main>;
}
