-- Read-only migration-004 checks. Do not select claims, records or receipts.
select 'resolution requests force RLS' as check_name,coalesce(c.relrowsecurity and c.relforcerowsecurity,false) as passed
from pg_catalog.pg_class c where c.oid = to_regclass('public.import_resolution_requests')
union all
select 'resolution requests deny anonymous reads',not pg_catalog.has_table_privilege('anon','public.import_resolution_requests','SELECT')
union all
select 'resolution requests deny direct writes',not pg_catalog.has_table_privilege('authenticated','public.import_resolution_requests','INSERT,UPDATE,DELETE')
union all
select 'function ' || f.signature || ' privileges/search path',
  coalesce(p.prosecdef=f.definer and 'search_path=""'=any(p.proconfig)
    and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),false)
from (values ('public.read_import_resolution_state(uuid)',false),('public.resolve_csv_import_rows(uuid,uuid,jsonb)',true)) f(signature,definer)
left join pg_catalog.pg_proc p on p.oid=to_regprocedure(f.signature);
