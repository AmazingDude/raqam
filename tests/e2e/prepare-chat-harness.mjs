import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
const folder=new URL('../../src/app/(workspace)/chat-checks/',import.meta.url),file=new URL('page.tsx',folder);
const source="import {notFound} from 'next/navigation';\nimport ChatBrowserHarness from '../../../../tests/e2e/chat-browser-harness.tsx';\nexport default function Page(){if(process.env.NODE_ENV!=='development')notFound();return <ChatBrowserHarness/>;}\n";
if(process.argv.includes('--remove')){const old=await readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(old!==null&&old!==source)throw new Error('Harness route changed; inspect before removing.');await rm(file,{force:true});}
else{await mkdir(folder,{recursive:true});await writeFile(file,source,{flag:'wx'});}
