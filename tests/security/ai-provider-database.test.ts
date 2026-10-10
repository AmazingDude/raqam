import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const workspace='10000000-0000-4000-8000-000000000001';
async function fixture(run:(db:PGlite)=>Promise<void>){
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create table public.workspaces(id uuid primary key,owner_subject text not null unique);
      insert into public.workspaces values ('${workspace}','owner-a'),('10000000-0000-4000-8000-000000000002','owner-b');
      grant usage on schema public,auth to authenticated; grant execute on function auth.jwt() to authenticated;`);
    await db.exec(await readFile(new URL('../../supabase/migrations/202610100011_byok_provider_credentials.sql',import.meta.url),'utf8'));
    await run(db);
  }finally{await db.close();}
}
async function asOwner(db:PGlite,subject:string,operation:()=>Promise<void>){
  await db.exec('begin; set local role authenticated;');
  try{await db.query('select set_config($1,$2,true)',['request.jwt.claims',JSON.stringify({sub:subject,role:'authenticated'})]);await operation();}
  finally{await db.exec('rollback;');}
}
test('provider credentials remain ciphertext behind owner-checked RPCs and direct table access is denied',async()=>fixture(async db=>{
  await asOwner(db,'owner-a',async()=>{
    await db.query(`select public.save_ai_provider_credential($1,'gemini','ciphertext-only','AAAAAAAAAAAAAAAA','BBBBBBBBBBBBBBBB','gemini-text','gemini-vision')`,[workspace]);
    await db.query('select public.select_ai_provider($1,\'gemini\')',[workspace]);
    const listed=await db.query<{provider:string;selected:boolean;text_model:string}>(`select * from public.list_ai_provider_configs($1)`,[workspace]);
    assert.equal(listed.rows.length,1);assert.equal(listed.rows[0]?.selected,true);assert.equal(listed.rows[0]?.provider,'gemini');
    const encrypted=await db.query<{key_ciphertext:string}>(`select * from public.get_ai_provider_credential($1,'gemini')`,[workspace]);
    assert.equal(encrypted.rows[0]?.key_ciphertext,'ciphertext-only');
    await assert.rejects(db.query('select * from public.ai_provider_configs'),/permission denied/);
  });
  await asOwner(db,'owner-b',async()=>{
    const other=await db.query(`select * from public.list_ai_provider_configs($1)`,[workspace]);assert.equal(other.rows.length,0);
    await assert.rejects(db.query(`select public.save_ai_provider_credential($1,'groq','ciphertext','AAAAAAAAAAAAAAAA','BBBBBBBBBBBBBBBB','text','vision')`,[workspace]),/workspace not found/);
  });
}));
