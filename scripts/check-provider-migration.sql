-- Read-only status check for BYOK provider migration 013.
-- Returns only schema/privilege booleans; it never reads credential values.
with target as (
  select
    to_regclass('public.ai_provider_configs') as table_oid,
    to_regprocedure('public.list_ai_provider_configs(uuid)') as list_rpc,
    to_regprocedure('public.get_ai_provider_credential(uuid,text)') as get_rpc,
    to_regprocedure('public.save_ai_provider_credential(uuid,text,text,text,text,text,text)') as save_rpc,
    to_regprocedure('public.select_ai_provider(uuid,text)') as select_rpc,
    to_regprocedure('public.delete_ai_provider_credential(uuid,text)') as delete_rpc
), required_columns(name) as (
  values ('workspace_id'), ('provider'), ('key_ciphertext'), ('key_nonce'),
         ('key_tag'), ('text_model'), ('vision_model'), ('selected'), ('updated_at')
)
select
  t.table_oid is not null as provider_table_present,
  coalesce((select bool_and(a.attname is not null)
    from required_columns c left join pg_attribute a
      on a.attrelid=t.table_oid and a.attname=c.name and a.attnum > 0 and not a.attisdropped), false)
    as required_columns_present,
  coalesce((select relrowsecurity and relforcerowsecurity from pg_class where oid=t.table_oid), false)
    as row_security_enabled_and_forced,
  exists(select 1 from pg_policies p where p.schemaname='public'
    and p.tablename='ai_provider_configs' and p.policyname='ai_provider_owner'
    and 'authenticated' = any(p.roles)) as owner_policy_present,
  exists(select 1 from pg_indexes i where i.schemaname='public'
    and i.tablename='ai_provider_configs' and i.indexname='ai_provider_one_selected_per_workspace')
    as selected_provider_index_present,
  coalesce(not has_table_privilege('authenticated',t.table_oid,'select')
    and not has_table_privilege('authenticated',t.table_oid,'insert')
    and not has_table_privilege('authenticated',t.table_oid,'update')
    and not has_table_privilege('authenticated',t.table_oid,'delete')
    and not has_table_privilege('anon',t.table_oid,'select')
    and not has_table_privilege('anon',t.table_oid,'insert')
    and not has_table_privilege('anon',t.table_oid,'update')
    and not has_table_privilege('anon',t.table_oid,'delete'), false) as direct_table_access_revoked,
  t.list_rpc is not null as list_rpc_present,
  t.get_rpc is not null as get_rpc_present,
  t.save_rpc is not null as save_rpc_present,
  t.select_rpc is not null as select_rpc_present,
  t.delete_rpc is not null as delete_rpc_present,
  coalesce(has_function_privilege('authenticated',t.list_rpc,'execute'),false)
    and coalesce(has_function_privilege('authenticated',t.get_rpc,'execute'),false)
    and coalesce(has_function_privilege('authenticated',t.save_rpc,'execute'),false)
    and coalesce(has_function_privilege('authenticated',t.select_rpc,'execute'),false)
    and coalesce(has_function_privilege('authenticated',t.delete_rpc,'execute'),false)
    as authenticated_rpc_access,
  coalesce(not has_function_privilege('anon',t.list_rpc,'execute'),false)
    and coalesce(not has_function_privilege('anon',t.get_rpc,'execute'),false)
    and coalesce(not has_function_privilege('anon',t.save_rpc,'execute'),false)
    and coalesce(not has_function_privilege('anon',t.select_rpc,'execute'),false)
    and coalesce(not has_function_privilege('anon',t.delete_rpc,'execute'),false)
    as anonymous_rpc_access_denied
from target t;
