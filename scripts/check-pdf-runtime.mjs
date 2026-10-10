// Exercise PDF parsing inside a compiled Next route, without auth, cloud writes or a server.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statementPdf } from '../tests/helpers/pdf-fixture.ts';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const buildRoot = join(projectRoot, '.next');
await mkdir(buildRoot, { recursive: true });
const fixtureRoot = await mkdtemp(join(buildRoot, 'pdf-runtime-'));
const require = createRequire(import.meta.url);
const sourcePath = relative(join(fixtureRoot, 'app/api/imports'), join(projectRoot, 'src/lib/server/imports.ts')).replace(/\\/g, '/');
const configPath = relative(fixtureRoot, join(projectRoot, 'next.config.ts')).replace(/\\/g, '/');
const projectPrefix = relative(fixtureRoot, projectRoot).replace(/\\/g, '/');

try {
  await mkdir(join(fixtureRoot, 'app/api/imports'), { recursive: true });
  await writeFile(join(fixtureRoot, 'package.json'), JSON.stringify({ name: 'raqam-pdf-runtime-check', private: true, type: 'module' }));
  await writeFile(join(fixtureRoot, 'tsconfig.json'), JSON.stringify({
    extends: relative(fixtureRoot, join(projectRoot, 'tsconfig.json')).replace(/\\/g, '/'),
    compilerOptions: { incremental: false },
    include: ['next-env.d.ts', 'app/**/*.ts', 'app/**/*.jsx', '.next/types/**/*.ts'], exclude: ['node_modules'],
  }));
  await writeFile(join(fixtureRoot, 'next.config.ts'), `
    import base from ${JSON.stringify(configPath)};
    export default {
      ...base, outputFileTracingRoot: ${JSON.stringify(projectRoot)}, turbopack: { root: ${JSON.stringify(projectRoot)} },
      outputFileTracingIncludes: Object.fromEntries(Object.entries(base.outputFileTracingIncludes ?? {}).map(([route, paths]) =>
        [route, paths.map(path => ${JSON.stringify(projectPrefix)} + '/' + path)])),
    };
  `);
  await writeFile(join(fixtureRoot, 'app/layout.jsx'), 'export default function Layout({children}) { return <html><body>{children}</body></html>; }');
  await writeFile(join(fixtureRoot, 'app/page.jsx'), 'export default function Page() { return <p>Synthetic PDF runtime check</p>; }');
  await writeFile(join(fixtureRoot, 'app/api/imports/route.ts'), `
    import { readCsvUpload } from ${JSON.stringify(sourcePath)};
    export const runtime = 'nodejs';
    export async function POST(request: Request) {
      try { return Response.json({ data: (await readCsvUpload(request)).preview }); }
      catch (failure) {
        const error = failure as Error;
        return Response.json({ error: error.message, cause: (error.cause as Error | undefined)?.message }, { status: 500 });
      }
    }
  `);
  console.log('Building an isolated Next route for the synthetic PDF check...');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'build', fixtureRoot], {
      cwd: fixtureRoot, windowsHide: true, timeout: 180_000,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const collect = chunk => { output = (output + chunk.toString()).slice(-24_000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Next fixture build failed (${code}):\n${output}`)));
  });
  const { routeModule } = require(join(fixtureRoot, '.next/server/app/api/imports/route.js'));
  await routeModule.ensureUserland();
  const header = ['Date', 'Description', 'Debit', 'Credit', 'Currency'];
  const bytes = statementPdf(Array.from({length:300}, (_, p) => [header, ...Array.from({length:20}, (_, r) =>
    ['2026-10-10', `Synthetic pg${p+1} row${r+1} bank activity`, r%2 ? '' : '25.50', r%2 ? '100.00' : '', 'PKR'])]));
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: 'application/pdf' }), 'synthetic-statement.pdf');
  const response = await routeModule.userland.POST(new Request('http://localhost/api/imports', { method: 'POST', body: form }));
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.data.contentHash, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(result.data.rows.length, 6000);
  assert.equal(result.data.rows.at(-1).pageNumber, 300);
  assert.equal(result.data.rows.reduce((sum,row) => sum + (row.transaction.direction === 'in' ? 1n : -1n) * BigInt(row.transaction.amountMinor),0n),22350000n);
  assert.equal(result.data.invalidCount, 0);
  const trace = JSON.parse(await readFile(join(fixtureRoot, '.next/server/app/api/imports/route.js.nft.json'), 'utf8'));
  assert.ok(trace.files.some(path => path.replace(/\\/g, '/').endsWith('/pdfjs-dist/legacy/build/pdf.worker.mjs')), 'Deployment trace must include the PDF worker');
  assert.ok(trace.files.some(path => path.replace(/\\/g, '/').endsWith('/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf')), 'Deployment trace must include standard fonts');
  console.log('PASS: compiled Next route parsed 6000/6000 synthetic rows over 300 pages, preserved the source hash, and traced worker/font assets.');
} finally {
  const actualRoot = await realpath(fixtureRoot);
  assert.equal(dirname(actualRoot), await realpath(buildRoot));
  assert.ok(basename(actualRoot).startsWith('pdf-runtime-'));
  await rm(actualRoot, { recursive: true, force: true });
}
