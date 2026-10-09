import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real embedded PostgreSQL; simulated Supabase schemas and Clerk JWT claims.
// Does NOT prove token verification, Storage HTTP access or managed Supabase setup.
test('workspace spine enforces owner isolation, source identity and exact cash storage', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated nologin nobypassrls;
      create role anon nologin nobypassrls;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as
        $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      grant usage on schema public, auth to authenticated, anon;
      create schema storage;
      create table storage.buckets (id text primary key, name text not null, public boolean not null);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated, anon;
      grant select, insert, update, delete on storage.objects to authenticated;
    `);
    await db.exec(await readFile(new URL('../../supabase/migrations/202610100001_workspace_spine.sql', import.meta.url), 'utf8'));
    const wA = '10000000-0000-4000-8000-000000000001', wB = '10000000-0000-4000-8000-000000000002';
    const sA = '20000000-0000-4000-8000-000000000001', sB = '20000000-0000-4000-8000-000000000002';
    const asOwner = async (subject: string): Promise<void> => {
      await db.exec('reset role');
      await db.query('select set_config($1, $2, false)', ['request.jwt.claims', JSON.stringify({ sub: subject, role: 'authenticated' })]);
      await db.exec('set role authenticated');
    };
    const workspace = async (id: string, subject: string): Promise<void> => {
      await db.query('insert into public.workspaces(id, owner_subject, business_name) values ($1,$2,$3)', [id, subject, 'Synthetic test business']);
    };
    const source = async (id: string, wid: string, hash: string): Promise<void> => {
      await db.query('insert into public.sources(id,workspace_id,source_type,content_hash,storage_path,original_name) values ($1,$2,$3,$4,$5,$6)',
        [id, wid, 'transaction_csv', hash.repeat(64), `${wid}/sample.csv`, 'sample.csv']);
    };
    const insertTransaction = async (wid: string, sid: string, row: number): Promise<void> => {
      await db.query(`insert into public.transactions(workspace_id,source_id,source_row,original_values,date,original_description,description,direction,amount_minor)
        values ($1,$2,$3,'["synthetic"]','2026-10-10','Synthetic','Synthetic','in','9007199254740993')`, [wid, sid, row]);
    };
    await asOwner('user_A'); await workspace(wA, 'user_A'); await source(sA, wA, 'a'); await insertTransaction(wA, sA, 2);
    await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['raqam-sources', `${wA}/sample.csv`]);
    await asOwner('user_B'); await workspace(wB, 'user_B'); await source(sB, wB, 'b'); await insertTransaction(wB, sB, 2);
    const visible = await db.query<{ amount_minor: string; workspace_id: string }>('select amount_minor::text,workspace_id::text from public.transactions');
    assert.deepEqual(visible.rows, [{ amount_minor: '9007199254740993', workspace_id: wB }]);
    assert.deepEqual((await db.query('select amount_minor from public.cashbook_records')).rows, [{ amount_minor: '9007199254740993' }]);
    assert.deepEqual((await db.query('select id from public.workspaces where id = $1', [wA])).rows, []);
    assert.deepEqual((await db.query('select id from public.sources where id = $1', [sA])).rows, []);
    await assert.rejects(() => workspace('10000000-0000-4000-8000-000000000003', 'user_A'));
    await assert.rejects(() => source('20000000-0000-4000-8000-000000000003', wA, 'c'));
    await assert.rejects(() => insertTransaction(wA, sA, 3));
    await assert.rejects(() => insertTransaction(wB, sA, 3)); // same owner row with foreign source fails composite FK
    await assert.rejects(() => insertTransaction(wB, sB, 2)); // repeated imported source row
    await insertTransaction(wB, sB, 3); // distinct equal amount is legitimate
    await assert.rejects(() => source('20000000-0000-4000-8000-000000000004', wB, 'b')); // identical file
    assert.deepEqual((await db.query('update public.sources set status = $1 where id = $2 returning id', ['complete', sA])).rows, []);
    assert.deepEqual((await db.query('delete from public.transactions where workspace_id = $1 returning id', [wA])).rows, []);
    await assert.rejects(() => db.query('update public.transactions set amount_minor = 0 where workspace_id = $1', [wB]));
    assert.deepEqual((await db.query('select id from storage.objects')).rows, []);
    await assert.rejects(() => db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['raqam-sources', `${wA}/intrusion.csv`]));
    await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['raqam-sources', `${wB}/own.csv`]);
    await assert.rejects(() => db.query('update storage.objects set name = $1 where name = $2', [`${wA}/intrusion.csv`, `${wB}/own.csv`]));
    assert.deepEqual((await db.query('delete from storage.objects where name = $1 returning id', [`${wA}/sample.csv`])).rows, []);
    await asOwner('user_A');
    assert.equal((await db.query('select id from public.transactions')).rows.length, 1);
    assert.equal((await db.query('select id from storage.objects')).rows.length, 1);
    await asOwner(''); assert.deepEqual((await db.query('select id from public.transactions')).rows, []);
    await db.exec('reset role; set role anon');
    await assert.rejects(() => db.query('select id from public.transactions'));
  } finally { await db.close(); }
});
