import { WorkspaceApp } from '../../../components/workspace/workspace-app.tsx';
import { exampleTransactions, exampleWorkspace } from '../../../lib/client/examples.ts';
export default function DemoPage() { return <WorkspaceApp demo workspace={exampleWorkspace} records={exampleTransactions()}/>; }
