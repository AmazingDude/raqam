import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const target = path.join(root, 'src/app/(workspace)/person2-checks/page.tsx');
const source = "import { notFound } from 'next/navigation';\nimport Person2BrowserHarness from '../../../../tests/e2e/person2-browser-harness.tsx';\nexport default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) { if (process.env.NODE_ENV !== 'development') notFound(); const params=await searchParams; const initialCase=params.case==='clean'?'clean':params.case==='failure'?'failure':'ambiguous'; return <Person2BrowserHarness initialCase={initialCase} initialPreview={params.preview==='1'}/>; }\n";
if (process.argv.includes('--remove')) {
  const current = await readFile(target, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (current !== null && current !== source) throw new Error('Temporary route changed; preserve it for manual review.');
  await rm(target, { force:true });
  console.log('Temporary Person 2 route removed.');
} else {
  await mkdir(path.dirname(target), { recursive:true });
  await writeFile(target, source, { flag:'wx' });
  console.log('Prepared /person2-checks for development-only synthetic checks.');
}
