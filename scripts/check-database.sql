-- Read-only hosted schema checks. No financial records, keys or JWTs are selected.
with required_relations(name) as (values
  ('workspaces'), ('sources'), ('transactions'), ('imports'), ('review_decisions'), ('transaction_reviews')
), required_functions(signature, definer) as (values
  ('public.register_csv_import(uuid,text,text,jsonb)', false),
  ('public.confirm_csv_import(uuid,jsonb)', true),
  ('public.review_cashbook_transaction(uuid,integer,jsonb)', true),
  ('public.read_cashbook_snapshot(uuid)', false)
), checks as (
  select 'relation ' || r.name || ' exists with forced RLS' as check_name,
    coalesce(c.relrowsecurity and c.relforcerowsecurity, false) as passed
  from required_relations r left join pg_catalog.pg_class c on c.oid = to_regclass('public.' || r.name)
  union all
  select 'relation ' || r.name || ' denies anonymous reads',
    coalesce(not pg_catalog.has_table_privilege('anon', to_regclass('public.' || r.name), 'SELECT'), false)
  from required_relations r
  union all
  select 'cashbook view preserves invoker RLS', coalesce('security_invoker=true' = any(c.reloptions), false)
  from pg_catalog.pg_class c where c.oid = to_regclass('public.cashbook_records')
  union all
  select 'private source bucket', exists (select 1 from storage.buckets where id = 'raqam-sources' and public = false)
  union all
  select 'review version column', exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'review_version'
  )
  union all
  select 'authenticated cash direct writes revoked',
    not pg_catalog.has_table_privilege('authenticated', 'public.transactions', 'INSERT,UPDATE,DELETE')
  union all
  select 'function ' || f.signature || ' privileges/search path',
    coalesce(p.prosecdef = f.definer and 'search_path=""' = any(p.proconfig)
      and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'), false)
  from required_functions f left join pg_catalog.pg_proc p on p.oid = to_regprocedure(f.signature)
)
select check_name, passed from checks order by check_name;
