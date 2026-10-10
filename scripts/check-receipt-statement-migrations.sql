-- Read-only hosted check for receipt/source registration 009 and long statements 010.
-- Run in Supabase SQL Editor after checking which migrations are already applied.
-- It inspects installed function definitions and grants only; it reads no user records
-- and does not apply or modify a migration.
with installed as (
  select
    to_regprocedure('public.register_supporting_document(uuid)')::oid as register_document,
    to_regprocedure('public.register_csv_import(uuid,text,text,jsonb)')::oid as register_import,
    to_regprocedure('public.confirm_csv_import(uuid,jsonb)')::oid as confirm_import,
    to_regprocedure('public.resolve_csv_import_rows(uuid,uuid,jsonb)')::oid as resolve_rows,
    to_regprocedure('public.read_cashbook_snapshot(uuid)')::oid as read_snapshot
)
select
  register_document is not null as migration_009_rpc_installed,
  coalesce(position('for update of src' in pg_get_functiondef(register_document)) > 0, false)
    as receipt_source_locked_during_registration,
  coalesce(position('s.source_type <> ''receipt_image''' in pg_get_functiondef(register_document)) > 0, false)
    as registration_requires_receipt_image,
  coalesce(position('s.status <> ''complete''' in pg_get_functiondef(register_document)) > 0, false)
    as registration_requires_complete_source,
  coalesce(has_function_privilege('authenticated', register_document, 'execute'), false)
    as authenticated_receipt_registration_allowed,
  coalesce(has_function_privilege('anon', register_document, 'execute'), false)
    as anonymous_receipt_registration_allowed,
  register_import is not null as migration_010_import_rpc_installed,
  confirm_import is not null as migration_010_confirmation_rpc_installed,
  resolve_rows is not null as migration_010_resolution_rpc_installed,
  read_snapshot is not null as migration_010_snapshot_rpc_installed,
  coalesce(position('20000' in pg_get_functiondef(register_import)) > 0, false)
    as import_preview_supports_20000_rows,
  coalesce(position('20000' in pg_get_functiondef(confirm_import)) > 0, false)
    as confirmation_supports_20000_rows,
  coalesce(position('50000' in pg_get_functiondef(confirm_import)) > 0, false)
    as confirmation_enforces_50000_workspace_cap,
  coalesce(position('50000' in pg_get_functiondef(resolve_rows)) > 0, false)
    as resolution_enforces_50000_workspace_cap,
  coalesce(position('original_row->''original''->>description_index' in pg_get_functiondef(confirm_import)) > 0, false)
    as confirmation_preserves_original_row_description,
  coalesce(position('original_row->''original''->>description_index' in pg_get_functiondef(resolve_rows)) > 0, false)
    as resolution_preserves_original_row_description,
  coalesce(position('limit 50001' in pg_get_functiondef(read_snapshot)) > 0, false)
    as snapshot_reads_full_workspace_cap,
  coalesce(has_function_privilege('authenticated', register_import, 'execute'), false)
    as authenticated_import_rpc_allowed,
  coalesce(has_function_privilege('anon', register_import, 'execute'), false)
    as anonymous_import_rpc_allowed
from installed;
