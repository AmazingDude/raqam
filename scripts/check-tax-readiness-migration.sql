-- Read-only verification after manually applying migration 202610100015.
-- Inspect schema/grants only; no profiles or private records are read.
with installed as (
  select to_regclass('public.tax_readiness_profiles')::oid as profile_table,
    to_regprocedure('public.save_tax_readiness_profile(integer,jsonb,boolean,integer)')::oid as save_function
)
select
  profile_table is not null as profile_table_installed,
  coalesce((select relrowsecurity and relforcerowsecurity from pg_class where oid = profile_table), false) as forced_rls_enabled,
  exists (select 1 from pg_policy where polrelid = profile_table and polname = 'tax_readiness_profiles_owner_read' and polcmd = 'r') as owner_read_policy_installed,
  coalesce(has_table_privilege('authenticated', profile_table, 'select'), false) as authenticated_read_allowed,
  coalesce(has_table_privilege('authenticated', profile_table, 'insert,update,delete'), false) as authenticated_direct_write_allowed,
  coalesce(has_table_privilege('anon', profile_table, 'select,insert,update,delete'), false) as anonymous_table_access_allowed,
  save_function is not null as save_function_installed,
  coalesce(has_function_privilege('authenticated', save_function, 'execute'), false) as authenticated_save_allowed,
  coalesce(has_function_privilege('anon', save_function, 'execute'), false) as anonymous_save_allowed,
  coalesce((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = save_function), false) as save_definer_with_empty_search_path,
  coalesce(position('for update' in pg_get_functiondef(save_function)) > 0, false) as owner_row_locked,
  coalesce(position('PT409' in pg_get_functiondef(save_function)) > 0, false) as stale_version_rejection_installed
from installed;
