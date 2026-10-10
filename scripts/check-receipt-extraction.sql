-- Read-only post-migration check for 202610100008_receipt_extraction_context.sql.
-- Run in Supabase SQL Editor. It inspects schema/grants only; it never reads receipt data.
select
  to_regclass('public.receipt_extraction_contexts') is not null as contexts_table_installed,
  to_regclass('public.receipt_provider_days') is not null as provider_days_table_installed,
  to_regclass('public.receipt_provider_allowances') is not null as provider_allowances_table_installed,
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.receipt_extraction_contexts')), false) as contexts_rls_enabled,
  coalesce((select relforcerowsecurity from pg_class where oid = to_regclass('public.receipt_extraction_contexts')), false) as contexts_rls_forced,
  has_table_privilege('authenticated', 'public.receipt_extraction_contexts', 'select') as owner_context_read_grant,
  has_table_privilege('authenticated', 'public.receipt_extraction_contexts', 'insert') as direct_context_insert_grant,
  has_table_privilege('authenticated', 'public.receipt_extraction_contexts', 'update') as direct_context_update_grant,
  has_table_privilege('authenticated', 'public.receipt_extraction_contexts', 'delete') as direct_context_delete_grant,
  has_table_privilege('anon', 'public.receipt_extraction_contexts', 'select') as anonymous_context_read_grant,
  has_function_privilege('authenticated', 'public.reserve_receipt_extraction(uuid,uuid,integer,jsonb,jsonb)', 'execute') as owner_reserve_rpc_grant,
  has_function_privilege('authenticated', 'public.save_receipt_extraction(uuid,uuid,integer,jsonb)', 'execute') as owner_save_rpc_grant,
  has_function_privilege('authenticated', 'public.reserve_receipt_provider_allowance(uuid,uuid,text)', 'execute') as owner_allowance_rpc_grant,
  has_function_privilege('anon', 'public.reserve_receipt_extraction(uuid,uuid,integer,jsonb,jsonb)', 'execute') as anonymous_reserve_rpc_grant,
  has_function_privilege('anon', 'public.save_receipt_extraction(uuid,uuid,integer,jsonb)', 'execute') as anonymous_save_rpc_grant,
  has_function_privilege('anon', 'public.reserve_receipt_provider_allowance(uuid,uuid,text)', 'execute') as anonymous_allowance_rpc_grant;
