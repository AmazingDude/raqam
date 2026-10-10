import type { Metadata } from 'next';
import { Landing } from '../components/marketing/landing.tsx';

export const metadata: Metadata = {
  title: 'Raqam — Reviewed Bookkeeping & Reconciliation for Small Businesses',
  description: 'Bring your transactions and receipts together. Review AI suggestions, follow recorded PKR cash activity, and export a clearer cashbook.',
  keywords: ['bookkeeping', 'accounting', 'Pakistan', 'PKR', 'reconciliation', 'cashbook', 'receipt OCR', 'small business'],
};

export const dynamic = 'force-dynamic';

export default function Home() {
  return <Landing />;
}
