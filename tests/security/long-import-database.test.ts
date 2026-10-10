import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { previewPdfRows } from '../../src/lib/server/csv.ts';
import { buildImportPlan } from '../../src/lib/server/imports.ts';
import { mapCashbookRow } from '../../src/lib/server/cashbook-mapping.ts';
import { calculateCashSummary } from '../../src/lib/server/summary.ts';

const workspaceId = '10000000-0000-4000-8000-000000000001';

test('long-import migration confirms 1000 rows, resolves native headers, preserves complete totals and retries, isolates owners and rolls back capacity overflow', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth; create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
      $$; grant usage on schema auth to authenticated, anon;
      grant execute on function auth.jwt() to authenticated, anon;
      create schema storage;
      create table storage.buckets(id text primary key, name text not null, public boolean not null);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated,anon;
      grant select,insert,update,delete on storage.objects to authenticated;
    `);
    for (const name of ['202610100001_workspace_spine.sql','202610100002_csv_imports.sql','202610100003_cashbook_review.sql','202610100004_import_resolution.sql','202610100005_review_conflict.sql','202610100010_long_statement_imports.sql']) {
      await db.exec(await readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8'));
    }

    async function owner(subject: string) {
      await db.exec('reset role');
      await db.query('select set_config($1,$2,false)', ['request.jwt.claims',JSON.stringify({sub:subject})]);
      await db.exec('set role authenticated');
    }
    await owner('user_A');
    await db.query('insert into public.workspaces(id,owner_subject,business_name) values ($1,$2,$3)',[workspaceId,'user_A','Synthetic long import']);
    async function register(rows: string[][], marker: string) {
      const preview = previewPdfRows([['Date','Narration','Debit','Credit'],...rows],Buffer.from(marker),20000,rows.map(() => 1));
      await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['raqam-sources',`${workspaceId}/${preview.contentHash}.csv`]);
      const registered = await db.query<{result:{importId:string}}>('select public.register_csv_import($1,$2,$3,$4::jsonb) as result',[workspaceId,preview.contentHash,'synthetic.pdf',JSON.stringify(preview)]);
      return {id:registered.rows[0]!.result.importId,preview};
    }
    const batch = await register([...Array.from({length:1000},(_,i) => ['2026-10-10',`Synthetic fee ${i+1}`,'25.50','']),['2026-10-10','Unknown amount','','']],'long');
    const plan = JSON.stringify(buildImportPlan(batch.preview,{}));
    async function confirm() { return (await db.query<{result:{importedCount:number;unresolvedCount:number;duplicate:boolean}}>('select public.confirm_csv_import($1,$2::jsonb) as result',[batch.id,plan])).rows[0]!.result; }
    await owner('user_B');
    await assert.rejects(confirm,/Import not found/);
    await owner('user_A');
    const receipt = await confirm(); assert.equal(receipt.importedCount,1000); assert.equal(receipt.unresolvedCount,1);
    assert.equal((await confirm()).duplicate,true);
    const description = await db.query<{original_description:string}>('select original_description from public.transactions where source_id=$1 and source_row=2',[batch.id]);
    assert.equal(description.rows[0]!.original_description,'Synthetic fee 1');
    const decisions = [{rowNumber:1002,action:'correct',transaction:{date:'2026-10-10',description:'Reviewed unknown',direction:'in',amountMinor:'10000',currency:'PKR',reference:null}}];
    const requestId = '20000000-0000-4000-8000-000000000001';
    async function resolve() { return (await db.query<{result:{correctedCount:number;duplicate:boolean}}>('select public.resolve_csv_import_rows($1,$2,$3::jsonb) as result',[batch.id,requestId,JSON.stringify(decisions)])).rows[0]!.result; }
    assert.equal((await resolve()).correctedCount,1); assert.equal((await resolve()).duplicate,true);
    const snapshot = (await db.query<{result:{records:Record<string,unknown>[];unresolvedImportRowCount:number}}>('select public.read_cashbook_snapshot($1) as result',[workspaceId])).rows[0]!.result;
    assert.equal(snapshot.records.length,1001);
    const summary = calculateCashSummary(snapshot.records.map(mapCashbookRow),workspaceId,snapshot.unresolvedImportRowCount);
    assert.equal(summary.outflowMinor,'2550000'); assert.equal(summary.inflowMinor,'10000'); assert.equal(summary.netMovementMinor,'-2540000'); assert.equal(summary.unresolvedImportRowCount,0);
    await owner('user_B');
    assert.equal((await db.query<{result:{records:unknown[]}}>('select public.read_cashbook_snapshot($1) as result',[workspaceId])).rows[0]!.result.records.length,0);
    await assert.rejects(resolve,/Import not found/);
    await owner('user_A');
    const overflow = await register([['2026-10-10','Overflow fee','1.00','']],'overflow');
    await db.exec('reset role');
    // Admin-only synthetic setup reaches the cap without 49,000 application calls.
    await db.query(`insert into public.transactions(workspace_id,source_id,source_row,original_values,date,original_description,description,direction,amount_minor,currency)
      select $1,$2,n,'[]'::jsonb,'2026-10-10','Synthetic capacity','Synthetic capacity','out',1,'PKR'
      from generate_series(20000,68998) n`,[workspaceId,batch.id]);
    await owner('user_A');
    await assert.rejects(() => db.query('select public.confirm_csv_import($1,$2::jsonb)',[overflow.id,JSON.stringify(buildImportPlan(overflow.preview,{}))]),/Workspace transaction limit/);
    assert.equal((await db.query<{count:number}>('select count(*)::integer as count from public.transactions where workspace_id=$1',[workspaceId])).rows[0]!.count,50000);
    assert.equal((await db.query<{status:string}>('select status from public.imports where source_id=$1',[overflow.id])).rows[0]!.status,'pending');
    assert.equal((await db.query('select * from public.review_decisions where target_id=$1',[overflow.id])).rows.length,0);
  } finally { await db.close(); }
});
