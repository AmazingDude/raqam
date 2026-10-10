import { SignUp } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) redirect('/');
  return <main><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" /></main>;
}
