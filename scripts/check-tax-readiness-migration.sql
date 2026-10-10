-- Read-only verification after manually applying migration 202610100015.
-- Inspect schema/grants only; no profiles or private records are read.
with installed as (
  select to_regclass('public.tax_readiness_profiles') as profile_table,
    to_regprocedure('public.tax_readiness_array_valid(jsonb,text[],integer,integer)') as array_function,
    to_regprocedure('public.tax_readiness_answers_valid(jsonb)') as answers_function,
    to_regprocedure('public.save_tax_readiness_profile(integer,jsonb,boolean,integer)') as save_function
)
select
  profile_table is not null as profile_table_installed,
  coalesce((select bool_and(a.attname is not null) from (values ('workspace_id'),('tax_year'),('answers'),('version'),('updated_at')) required(name)
    left join pg_attribute a on a.attrelid=profile_table and a.attname=required.name and a.attnum>0 and not a.attisdropped),false) as required_profile_columns_present,
  coalesce((select relrowsecurity and relforcerowsecurity from pg_class where oid = profile_table), false) as forced_rls_enabled,
  exists (select 1 from pg_policies where schemaname='public' and tablename='tax_readiness_profiles'
    and policyname='tax_readiness_profiles_owner_read' and cmd='SELECT' and 'authenticated'=any(roles) and qual ilike '%owner_subject%') as owner_read_policy_installed,
  coalesce(has_table_privilege('authenticated', profile_table, 'select'), false) as authenticated_read_allowed,
  coalesce(not has_table_privilege('authenticated', profile_table, 'insert') and not has_table_privilege('authenticated', profile_table, 'update')
    and not has_table_privilege('authenticated', profile_table, 'delete'), false) as authenticated_direct_write_denied,
  coalesce(not has_table_privilege('anon', profile_table, 'select') and not has_table_privilege('anon', profile_table, 'insert')
    and not has_table_privilege('anon', profile_table, 'update') and not has_table_privilege('anon', profile_table, 'delete'), false) as anonymous_table_access_denied,
  array_function is not null as array_validator_installed,
  answers_function is not null as answers_validator_installed,
  save_function is not null as save_function_installed,
  coalesce(has_function_privilege('authenticated', array_function, 'execute') and has_function_privilege('authenticated', answers_function, 'execute')
    and has_function_privilege('authenticated', save_function, 'execute'), false) as authenticated_rpc_access,
  coalesce(not has_function_privilege('anon', array_function, 'execute') and not has_function_privilege('anon', answers_function, 'execute')
    and not has_function_privilege('anon', save_function, 'execute'), false) as anonymous_rpc_access_denied,
  coalesce((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = save_function), false) as save_definer_with_empty_search_path,
  coalesce(position('for update' in lower(pg_get_functiondef(save_function))) > 0, false) as owner_row_locked,
  coalesce(position('pt409' in lower(pg_get_functiondef(save_function))) > 0, false) as stale_version_rejection_installed,
  coalesce(position('explicit confirmation required' in lower(pg_get_functiondef(save_function))) > 0, false) as explicit_confirmation_required
from installed;
