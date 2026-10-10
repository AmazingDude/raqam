import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const target = path.join(root, 'src/app/(workspace)/b-checks/page.tsx');
const source = "import { notFound } from 'next/navigation';\nimport BrowserHarness from '../../../../tests/e2e/browser-harness.tsx';\nexport default function Page() { if (process.env.NODE_ENV !== 'development') notFound(); return <BrowserHarness/>; }\n";
if (process.argv.includes('--remove')) {
  const current = await readFile(target, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (current !== null && current !== source) throw new Error('Temporary route changed; preserve it for manual review.');
  await rm(target, { force: true });
  console.log('Temporary browser route removed.');
} else {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, source, { flag: 'wx' });
  console.log('Synthetic browser fixture prepared at /b-checks for next dev only. Remove with --remove before the final build.');
}
