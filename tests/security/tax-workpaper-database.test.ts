import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const workspaceA = '10000000-0000-4000-8000-000000000001';
const workspaceB = '10000000-0000-4000-8000-000000000002';
const requestA = '20000000-0000-4000-8000-000000000001';
const facts = { taxpayerType: 'individual', residency: 'resident', incomeSources: ['salary', 'business_or_freelance'] };

type Owner = ((subject: string, operation: () => Promise<void>) => Promise<void>) & { asAnon: (operation: () => Promise<void>) => Promise<void> };

async function fixture(run: (db: PGlite, asOwner: Owner) => Promise<void>) {
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin nobypassrls; create role authenticated nologin nobypassrls;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as
        $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      create table public.workspaces(id uuid primary key, owner_subject text not null unique);
      insert into public.workspaces values ('${workspaceA}', 'owner-a'), ('${workspaceB}', 'owner-b');
      alter table public.workspaces enable row level security;
      create policy owner_read on public.workspaces for select to authenticated using (owner_subject=auth.jwt()->>'sub');
      grant select on public.workspaces to authenticated;
      grant usage on schema public, auth to authenticated, anon;
      grant execute on function auth.jwt() to authenticated;`);
    const migration = await readFile(new URL('../../supabase/migrations/202610210001_tax_workpaper_cases.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const check = await readFile(new URL('../../scripts/check-tax-workpaper-migration.sql', import.meta.url), 'utf8');
    const installed = await db.query<Record<string, boolean>>(check);
    assert.deepEqual(installed.rows[0], {
      case_table_installed: true, case_operations_installed: true, forced_rls_enabled: true,
      owner_read_policy_installed: true, authenticated_case_read: true, direct_case_writes_denied: true,
      anonymous_case_access_denied: true, operation_writes_denied: true,
      facts_validator_installed: true, save_function_installed: true, save_definer_locked: true,
      authenticated_save_allowed: true, anonymous_save_denied: true, case_year_unique: true,
    });
    const asRole = async (role: 'authenticated' | 'anon', subject: string, operation: () => Promise<void>) => {
      await db.exec(`begin; set local role ${role};`);
      await db.query('select set_config($1,$2,true)', ['request.jwt.claims', JSON.stringify({ sub: subject, role })]);
      try { await operation(); await db.exec('commit;'); }
      catch (error) { await db.exec('rollback;'); throw error; }
    };
    const asOwner = Object.assign(
      (subject: string, operation: () => Promise<void>) => asRole('authenticated', subject, operation),
      { asAnon: (operation: () => Promise<void>) => asRole('anon', '', operation) },
    );
    await run(db, asOwner);
  } finally { await db.close(); }
}

async function expectOperationError(operation: () => Promise<unknown>, pattern: RegExp) {
  let caught: unknown;
  try { await operation(); } catch (error) { caught = error; }
  assert.ok(caught, 'expected SQL command to fail');
  assert.match(String(caught), pattern);
}

test('workpaper facts persist by owner and tax year, with version checks and idempotent retries', async () => fixture(async (db, asOwner) => {
  let caseId = '';
  await asOwner('owner-a', async () => {
    const first = await db.query<{ save_tax_workpaper_case: { case: { id: string; workspace_id: string; tax_year: number; version: number }; duplicate: boolean } }>(
      'select public.save_tax_workpaper_case($1,$2::jsonb,true,0,$3)', [2026, JSON.stringify(facts), requestA]);
    const saved = first.rows[0]!.save_tax_workpaper_case;
    assert.equal(saved.duplicate, false);
    assert.equal(saved.case.workspace_id, workspaceA);
    assert.equal(saved.case.tax_year, 2026);
    assert.equal(saved.case.version, 1);
    caseId = saved.case.id;
    const retry = await db.query<{ save_tax_workpaper_case: { case: { id: string; version: number }; duplicate: boolean } }>(
      'select public.save_tax_workpaper_case($1,$2::jsonb,true,0,$3)', [2026, JSON.stringify(facts), requestA]);
    assert.deepEqual(retry.rows[0]!.save_tax_workpaper_case, { ...saved, duplicate: true });
  });
  await expectOperationError(() => asOwner('owner-a', async () => {
    await db.query('select public.save_tax_workpaper_case($1,$2::jsonb,true,0,$3)', [2026, JSON.stringify({ ...facts, residency: 'non_resident' }), requestA]);
  }), /request id reused/);
  await asOwner('owner-a', async () => {
    const secondRequest = '20000000-0000-4000-8000-000000000002';
    const update = await db.query<{ save_tax_workpaper_case: { case: { id: string; version: number }; duplicate: boolean } }>(
      'select public.save_tax_workpaper_case($1,$2::jsonb,true,1,$3)', [2026, JSON.stringify({ ...facts, residency: 'non_resident' }), secondRequest]);
    assert.equal(update.rows[0]!.save_tax_workpaper_case.case.id, caseId);
    assert.equal(update.rows[0]!.save_tax_workpaper_case.case.version, 2);
  });
  await expectOperationError(() => asOwner('owner-a', async () => {
    await db.query('select public.save_tax_workpaper_case($1,$2::jsonb,true,1,$3)', [2026, JSON.stringify(facts), '20000000-0000-4000-8000-000000000003']);
  }), /workpaper changed/);
  await asOwner('owner-a', async () => {
    const anotherYear = await db.query<{ count: number }>(
      'select count(*)::int as count from public.tax_workpaper_cases where workspace_id=$1 and tax_year=$2', [workspaceA, 2027]);
    assert.equal(anotherYear.rows[0]!.count, 0);
    await db.query('select public.save_tax_workpaper_case($1,$2::jsonb,true,0,$3)', [2027, JSON.stringify(facts), '20000000-0000-4000-8000-000000000004']);
  });
  await asOwner('owner-b', async () => {
    assert.deepEqual((await db.query('select workspace_id,tax_year from public.tax_workpaper_cases')).rows, []);
    await db.query('select public.save_tax_workpaper_case($1,$2::jsonb,true,0,$3)', [2026, JSON.stringify(facts), '20000000-0000-4000-8000-000000000005']);
    assert.deepEqual((await db.query('select workspace_id from public.tax_workpaper_cases')).rows, [{ workspace_id: workspaceB }]);
  });
}));

test('workpaper writes reject unknown fields, unconfirmed facts, invalid years and missing workspaces', async () => fixture(async (_db, asOwner) => {
  for (const [taxYear, inputFacts, confirmed, expectedVersion, requestId] of [
    [2026, facts, false, 0, '20000000-0000-4000-8000-000000000011'],
    [2026, { ...facts, cnic: 'not accepted' }, true, 0, '20000000-0000-4000-8000-000000000012'],
    [2026, { ...facts, incomeSources: ['salary', 'salary'] }, true, 0, '20000000-0000-4000-8000-000000000013'],
    [2026, { ...facts, incomeSources: ['none', 'salary'] }, true, 0, '20000000-0000-4000-8000-000000000014'],
    [1999, facts, true, 0, '20000000-0000-4000-8000-000000000015'],
  ] as const) await expectOperationError(() => asOwner('owner-a', async () => {
    await _db.query('select public.save_tax_workpaper_case($1,$2::jsonb,$3,$4,$5)',
      [taxYear, JSON.stringify(inputFacts), confirmed, expectedVersion, requestId]);
  }), /explicit confirmation|invalid taxpayer facts|invalid tax year/);
  await expectOperationError(() => asOwner('owner-missing', async () => {
    await _db.query('select public.save_tax_workpaper_case($1,$2::jsonb,true,0,$3)', [2026, JSON.stringify(facts), '20000000-0000-4000-8000-000000000016']);
  }), /workspace not found/);
  await expectOperationError(() => asOwner.asAnon(async () => {
    await _db.query('select public.save_tax_workpaper_case($1,$2::jsonb,true,0,$3)', [2026, JSON.stringify(facts), '20000000-0000-4000-8000-000000000017']);
  }), /permission denied/);
}));

test('workpaper table grants prevent direct and anonymous mutation', async () => fixture(async (db, asOwner) => {
  for (const query of [
    'insert into public.tax_workpaper_cases(workspace_id,tax_year,facts) values ($1,$2,$3::jsonb)',
    'update public.tax_workpaper_cases set facts=$3::jsonb where workspace_id=$1 and tax_year=$2',
    'delete from public.tax_workpaper_cases where workspace_id=$1 and tax_year=$2 and facts=$3::jsonb',
  ]) await expectOperationError(() => asOwner('owner-a', async () => { await db.query(query, [workspaceA, 2026, JSON.stringify(facts)]); }), /permission denied/);
  await expectOperationError(() => asOwner.asAnon(async () => { await db.query('select * from public.tax_workpaper_cases'); }), /permission denied/);
  await expectOperationError(() => asOwner.asAnon(async () => { await db.query('select * from public.tax_workpaper_case_saves'); }), /permission denied/);
}));
