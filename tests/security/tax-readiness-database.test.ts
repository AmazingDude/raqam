import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { getCurrentPakistanTaxYear } from '../../src/lib/contracts/tax-readiness.ts';

const workspaceA = '10000000-0000-4000-8000-000000000001';
const workspaceB = '10000000-0000-4000-8000-000000000002';
const answers = {
  taxpayerType: 'individual', residency: 'resident', provinceOrTerritory: 'punjab', filingHistory: 'first_time',
  incomeSources: ['salary', 'business_or_freelance'], recordsOnHand: ['salary_certificate'],
  wealthRecords: ['bank_cash_balances'],
};

async function fixture(run: (db: PGlite, asOwner: (subject: string, operation: () => Promise<void>) => Promise<void>) => Promise<void>) {
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
    // Reproduce the hosted migration's reported 42P07 state: the table exists,
    // but the remaining policy, RPC, and grants may not have been installed.
    await db.exec(`create table public.tax_readiness_profiles (
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      tax_year integer not null, answers jsonb not null, version integer not null default 1,
      updated_at timestamptz not null default now(), primary key (workspace_id, tax_year)
    );`);
    const taxReadinessMigration = await readFile(new URL('../../supabase/migrations/202610100015_tax_readiness_profiles.sql', import.meta.url), 'utf8');
    await db.exec(taxReadinessMigration);
    // Re-running the migration after the reported duplicate-table failure must
    // preserve the table and complete/reapply policy and function grants.
    await db.exec(taxReadinessMigration);
    const checkSql = await readFile(new URL('../../scripts/check-tax-readiness-migration.sql', import.meta.url), 'utf8');
    const installed = await db.query<Record<string, boolean>>(checkSql);
    assert.deepEqual(installed.rows[0], {
      profile_table_installed: true, required_profile_columns_present: true, forced_rls_enabled: true, owner_read_policy_installed: true,
      authenticated_read_allowed: true, authenticated_direct_write_denied: true, anonymous_table_access_denied: true,
      array_validator_installed: true, answers_validator_installed: true, save_function_installed: true,
      authenticated_rpc_access: true, anonymous_rpc_access_denied: true,
      save_definer_with_empty_search_path: true, owner_row_locked: true, stale_version_rejection_installed: true, explicit_confirmation_required: true,
    });
    const asOwner = async (subject: string, operation: () => Promise<void>) => {
      await db.exec('begin; set local role authenticated;');
      await db.query('select set_config($1,$2,true)', ['request.jwt.claims', JSON.stringify({ sub: subject, role: 'authenticated' })]);
      try { await operation(); await db.exec('commit;'); }
      catch (error) { await db.exec('rollback;'); throw error; }
    };
    await run(db, asOwner);
  } finally { await db.close(); }
}

// Real embedded PostgreSQL with simulated Clerk claims; no hosted auth/concurrency claim.
test('confirmed profile saves derive ownership, persist across reads and reject stale updates', async () => fixture(async (db, asOwner) => {
  const taxYear = getCurrentPakistanTaxYear();
  await asOwner('owner-a', async () => {
    const saved = await db.query<{ save_tax_readiness_profile: { profile: { workspace_id: string; tax_year: number; version: number } } }>(
      'select public.save_tax_readiness_profile($1,$2::jsonb,true,0)', [taxYear, JSON.stringify(answers)]);
    assert.equal(saved.rows[0]?.save_tax_readiness_profile.profile.workspace_id, workspaceA);
    assert.equal(saved.rows[0]?.save_tax_readiness_profile.profile.tax_year, taxYear);
    assert.equal(saved.rows[0]?.save_tax_readiness_profile.profile.version, 1);
  });
  await asOwner('owner-b', async () => {
    assert.deepEqual((await db.query('select workspace_id from public.tax_readiness_profiles')).rows, []);
    await db.query('select public.save_tax_readiness_profile($1,$2::jsonb,true,0)', [taxYear, JSON.stringify(answers)]);
    assert.deepEqual((await db.query('select workspace_id from public.tax_readiness_profiles')).rows, [{ workspace_id: workspaceB }]);
  });
  await assert.rejects(asOwner('owner-a', async () => {
    await db.query('select public.save_tax_readiness_profile($1,$2::jsonb,true,0)', [taxYear, JSON.stringify(answers)]);
  }), /profile changed/);
  await asOwner('owner-a', async () => {
    await db.query('select public.save_tax_readiness_profile($1,$2::jsonb,true,1)', [taxYear, JSON.stringify({ ...answers, filingHistory: 'filed_before' })]);
    const result = await db.query<{ version: number; answers: { filingHistory: string } }>('select version,answers from public.tax_readiness_profiles');
    assert.equal(result.rows[0]?.version, 2);
    assert.equal(result.rows[0]?.answers.filingHistory, 'filed_before');
  });
  await assert.rejects(asOwner('owner-a', async () => {
    await db.query('select public.save_tax_readiness_profile($1,$2::jsonb,true,1)', [taxYear, JSON.stringify(answers)]);
  }), /profile changed/);
}));

test('profile database rejects direct writes, unconfirmed/invalid submissions and missing owners', async () => fixture(async (db, asOwner) => {
  const taxYear = getCurrentPakistanTaxYear();
  for (const sql of [
    'insert into public.tax_readiness_profiles(workspace_id,tax_year,answers) values ($1,$2,$3::jsonb)',
    'update public.tax_readiness_profiles set answers=$3::jsonb where workspace_id=$1 and tax_year=$2',
    'delete from public.tax_readiness_profiles where workspace_id=$1 and tax_year=$2 and answers=$3::jsonb',
  ]) await assert.rejects(asOwner('owner-a', async () => { await db.query(sql, [workspaceA, taxYear, JSON.stringify(answers)]); }), /permission denied/);
  for (const invalid of [
    null, [], { ...answers, cnic: 'extra' }, { ...answers, taxpayerType: null },
    { ...answers, incomeSources: ['salary', 'salary'] }, { ...answers, incomeSources: ['none', 'salary'] },
    { ...answers, recordsOnHand: ['salary_certificate', 'not_collected_yet'] },
    { ...answers, wealthRecords: ['not_applicable', 'bank_cash_balances'] },
  ]) await assert.rejects(asOwner('owner-a', async () => {
    await db.query('select public.save_tax_readiness_profile($1,$2::jsonb,true,0)', [taxYear, JSON.stringify(invalid)]);
  }), /invalid profile answers/);
  await assert.rejects(asOwner('owner-a', async () => {
    await db.query('select public.save_tax_readiness_profile($1,$2::jsonb,false,0)', [taxYear, JSON.stringify(answers)]);
  }), /explicit confirmation/);
  await assert.rejects(asOwner('owner-a', async () => {
    await db.query('select public.save_tax_readiness_profile($1,$2::jsonb,true,0)', [taxYear - 1, JSON.stringify(answers)]);
  }), /current normal tax year/);
  await assert.rejects(asOwner('owner-missing', async () => {
    await db.query('select public.save_tax_readiness_profile($1,$2::jsonb,true,0)', [taxYear, JSON.stringify(answers)]);
  }), /workspace not found/);
  await assert.rejects(asOwner('', async () => {
    await db.query('select public.save_tax_readiness_profile($1,$2::jsonb,true,0)', [taxYear, JSON.stringify(answers)]);
  }), /authenticated subject/);
  await db.exec('set role anon;');
  await assert.rejects(db.query('select * from public.tax_readiness_profiles'), /permission denied/);
  await assert.rejects(db.query('select public.save_tax_readiness_profile($1,$2::jsonb,true,0)', [taxYear, JSON.stringify(answers)]), /permission denied/);
}));
