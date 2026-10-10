import type { Metadata } from 'next';
import { Landing } from '../components/marketing/landing.tsx';

export const metadata: Metadata = {
  title: 'Raqam — Reviewed Bookkeeping & Reconciliation for Small Businesses',
  description: 'Turn scattered bank transactions and receipts into an audit-ready cashbook. Supervised AI extraction, 1-to-1 reconciliation, and exact integer PKR math.',
  keywords: ['bookkeeping', 'accounting', 'Pakistan', 'PKR', 'reconciliation', 'cashbook', 'receipt OCR', 'small business'],
};

export const dynamic = 'force-dynamic';

export default function Home() {
  return <Landing />;
}
