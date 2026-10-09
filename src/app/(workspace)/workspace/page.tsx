import { LiveWorkspace } from '../../../components/workspace/live-workspace.tsx';
export const dynamic = 'force-dynamic';
export default function WorkspacePage() {
  const clerkConfigured=!!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY&&!!process.env.CLERK_SECRET_KEY;
  return <LiveWorkspace clerkConfigured={clerkConfigured}/>;
}
