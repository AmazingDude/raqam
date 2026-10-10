import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { mapInvoice } from '../../src/lib/server/invoices.ts';
const workspace='10000000-0000-4000-8000-000000000001',foreign='10000000-0000-4000-8000-000000000002';
const invoiceId='20000000-0000-4000-8000-000000000001',lineId='30000000-0000-4000-8000-000000000001';
function payload(){return {id:invoiceId,workspace_id:workspace,invoice_number:'SYNTHETIC-001',status:'draft',issue_date:'2026-10-10',due_date:'2026-10-24',from_name:'Synthetic Studio',client_name:'Synthetic Client',client_contact:'Synthetic contact',currency:'PKR',discount_minor:'0',shipping_minor:'0',tax_minor:'0',reminders_enabled:false,
  items:[{id:lineId,description:'Synthetic service',quantity:0.5,rate_minor:'9007199254740993'}]};}
test('invoice SQL saves/edits/status/deletes atomically with exact money, audit, versions and owner isolation',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role authenticated nologin nobypassrls; create role anon nologin nobypassrls;
      create schema auth; create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema public,auth to authenticated,anon;
      create schema storage; create table storage.buckets(id text primary key,name text not null,public boolean not null);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
      alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated;`);
    for(const name of ['202610100001_workspace_spine.sql','202610100011_invoices_spine.sql'])
      await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));
    const atomicInvoiceMigration=await readFile(new URL('../../supabase/migrations/202610100012_atomic_invoice_operations.sql',import.meta.url),'utf8');
    // Simulate the hosted failure: review_version exists before migration 012.
    await db.exec('alter table public.invoices add column review_version integer not null default 0 check (review_version >= 0)');
    await db.exec(atomicInvoiceMigration);
    await db.exec(atomicInvoiceMigration); // A partial or completed SQL-editor retry stays safe.
    await db.query("insert into public.workspaces(id,owner_subject,business_name) values ($1,'synthetic_A','Synthetic A'),($2,'synthetic_B','Synthetic B')",[workspace,foreign]);
    const owner=async(subject:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:subject})]);await db.exec('set role authenticated');};
    const save=async(data:unknown,version:number|null=null)=>(await db.query<{value:unknown}>('select public.save_workspace_invoice($1,$2::jsonb,$3) as value',[workspace,JSON.stringify(data),version])).rows[0]!.value;
    await owner('synthetic_A');
    const created=mapInvoice(await save(payload()),workspace);
    assert.equal(created.totalMinor,'4503599627370497');assert.equal(created.clientContact,'Synthetic contact');assert.equal(created.reviewVersion,0);
    assert.equal((await db.query<{count:number}>('select count(*)::int as count from public.transactions')).rows[0]!.count,0);
    const read=mapInvoice((await db.query<{value:unknown}>('select public.read_workspace_invoice($1,$2) as value',[workspace,invoiceId])).rows[0]!.value,workspace);
    assert.equal(read.totalMinor,created.totalMinor);assert.equal(read.items[0]!.amountMinor,created.totalMinor);
    await assert.rejects(()=>save(payload()),/version changed/i); // Ambiguous create retry does not duplicate.
    const bad={...payload(),client_contact:'Should roll back',items:[{...payload().items[0],description:''}]};
    await assert.rejects(()=>save(bad,0));
    assert.deepEqual((await db.query('select client_contact,review_version from public.invoices')).rows,[{client_contact:'Synthetic contact',review_version:0}]);
    assert.equal((await db.query<{count:number}>('select count(*)::int as count from public.invoice_items')).rows[0]!.count,1);
    const edited=mapInvoice(await save({...payload(),items:[{...payload().items[0],rate_minor:'101'}]},0),workspace);
    assert.equal(edited.totalMinor,'51');assert.equal(edited.reviewVersion,1);
    await assert.rejects(()=>save(payload(),0),/version changed/i);
    await assert.rejects(()=>save({...payload(),items:[{...payload().items[0],quantity:1.001}]},1));
    await assert.rejects(()=>save({...payload(),discount_minor:'999999999999999999'},1));
    await assert.rejects(()=>save({...payload(),items:[{...payload().items[0],quantity:100000,rate_minor:'9223372036854775807'}]},1));
    const paid=mapInvoice((await db.query<{value:unknown}>('select public.set_workspace_invoice_status($1,$2,$3,$4) as value',[workspace,invoiceId,'paid',1])).rows[0]!.value,workspace);
    assert.equal(paid.status,'paid');assert.equal(paid.reviewVersion,2);
    await assert.rejects(()=>db.query('select public.delete_workspace_invoice($1,$2,$3)',[workspace,invoiceId,1]),/version changed/i);
    await assert.rejects(()=>db.query("update public.invoices set total_minor=0 where id=$1",[invoiceId]),/permission denied/i);
    await assert.rejects(()=>db.query('select public.invoice_snapshot_json($1,$2)',[invoiceId,workspace]),/permission denied/i);
    await owner('synthetic_B');
    assert.equal((await db.query('select id from public.invoices')).rows.length,0);
    await assert.rejects(()=>db.query('select public.read_workspace_invoices($1)',[workspace]),/Workspace not found/);
    await assert.rejects(()=>db.query('select public.set_workspace_invoice_status($1,$2,$3,$4)',[foreign,invoiceId,'paid',2]),/Invoice not found/);
    await assert.rejects(()=>db.query('select public.save_workspace_invoice($1,$2::jsonb,null)',[foreign,JSON.stringify({...payload(),workspace_id:foreign})]),/Invoice not found/);
    await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select public.read_workspace_invoices($1)',[workspace]),/permission denied/i);
    await owner('synthetic_A');
    await db.query('select public.delete_workspace_invoice($1,$2,$3)',[workspace,invoiceId,2]);
    assert.equal((await db.query('select id from public.invoice_items')).rows.length,0);
    assert.deepEqual((await db.query<{action:string}>('select action from public.invoice_reviews order by created_at,id')).rows.map(row=>row.action).sort(),['create','delete','edit','status']);
    assert.equal((await db.query<{count:number}>('select count(*)::int as count from public.transactions')).rows[0]!.count,0);
  }finally{await db.close();}
});
