// Run after npm run build. Test only files traced into the serverless package,
// without falling back to dependencies present in the development checkout.
import { readFile, mkdir, copyFile, mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { resolve, dirname, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { statementPdf } from '../tests/helpers/pdf-fixture.ts';

const routeDirectory = resolve('.next/server/app/api/imports');
const trace = JSON.parse(await readFile(join(routeDirectory, 'route.js.nft.json'), 'utf8'));
const sandbox = await mkdtemp(join(tmpdir(), 'raqam-pdf-package-'));
try {
  for (const relative of trace.files) {
    const source = resolve(routeDirectory, relative);
    const marker = `${sep}node_modules${sep}`;
    const index = source.indexOf(marker);
    if (index === -1 || !(await stat(source)).isFile()) continue;
    const target = join(sandbox, source.slice(index + 1));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  await writeFile(join(sandbox, 'fixture.pdf'), statementPdf([[
    ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
    ['10/10/2026', 'Synthetic fee', '25.50', '', '974.50'],
  ]], true));
  await writeFile(join(sandbox, 'check.mjs'), `
    import assert from 'node:assert/strict';
    import {readFile} from 'node:fs/promises';
    import {resolve} from 'node:path';
    import {pathToFileURL} from 'node:url';
    import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/legacy/build/pdf.mjs';
    import {PDFParse} from 'pdf-parse';
    GlobalWorkerOptions.workerSrc=pathToFileURL(resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
    PDFParse.setWorker(GlobalWorkerOptions.workerSrc);
    const deadline=setTimeout(()=>{console.error('PDF package smoke timed out');process.exit(1);},20000);
    const data=new Uint8Array(await readFile('fixture.pdf'));
    const options={standardFontDataUrl:resolve('node_modules/pdfjs-dist/standard_fonts')+'/'};
    const loading=getDocument({...options,data:new Uint8Array(data)});
    const tables=new PDFParse({...options,data:new Uint8Array(data)});
    try {
      const doc=await loading.promise;
      const text=await (await doc.getPage(1)).getTextContent();
      assert.ok(text.items.some(item=>item.str==='Synthetic fee'));
      const result=await tables.getTable();
      assert.equal(result.pages.length,1);
      console.log('Packaged PDF text and table extraction passed.');
    } finally {await loading.destroy();await tables.destroy();clearTimeout(deadline);}
  `);
  const result = spawnSync(process.execPath, ['check.mjs'], {cwd:sandbox, encoding:'utf8', timeout:30000});
  if (result.status !== 0 || !result.stdout?.includes('Packaged PDF text and table extraction passed.')) throw new Error(`Packaged PDF extraction failed: ${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`);
  console.log(result.stdout.trim());
} finally { await rm(sandbox, {recursive:true, force:true}); }
