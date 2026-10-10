-- Read-only hosted check for ledger/bookkeeping migration 013.
-- First verify invoice migrations 011/012 with check-invoice-migrations.sql.
-- This checks schema/privilege metadata only; it reads no financial rows.
with installed as (
 select to_regclass('public.ledger_accounts') accounts,to_regclass('public.ledger_journals') journals,
  to_regclass('public.ledger_journal_lines') journal_lines,to_regclass('public.ledger_journal_sources') sources,
  to_regclass('public.ledger_history_coverage') coverage,to_regclass('public.ledger_review_decisions') decisions,
  to_regclass('public.ledger_account_operations') account_operations,
  to_regclass('public.expense_drafts') expense_drafts,to_regclass('public.supplier_bills') supplier_bills,
  to_regprocedure('public.read_workspace_ledger(uuid)') read_ledger,
  to_regprocedure('public.save_workspace_ledger_account(uuid,jsonb)') save_account,
  to_regprocedure('public.post_workspace_ledger_journal(uuid,jsonb,jsonb)') post_journal,
  to_regprocedure('public.read_workspace_expense_drafts(uuid)') read_expenses,
  to_regprocedure('public.save_workspace_expense_draft(uuid,jsonb)') save_expense,
  to_regprocedure('public.review_workspace_expense_draft(uuid,uuid,uuid,integer,jsonb)') review_expense,
  to_regprocedure('public.read_workspace_supplier_bills(uuid)') read_bills,
  to_regprocedure('public.save_workspace_supplier_bill(uuid,jsonb)') save_bill,
  to_regprocedure('public.review_workspace_supplier_bill(uuid,uuid,uuid,integer,jsonb)') review_bill
), tables as (
 select name,relid from (values ('ledger_accounts',(select accounts from installed)),('ledger_journals',(select journals from installed)),
  ('ledger_journal_lines',(select journal_lines from installed)),('ledger_journal_sources',(select sources from installed)),
  ('ledger_history_coverage',(select coverage from installed)),('ledger_review_decisions',(select decisions from installed)),
  ('ledger_account_operations',(select account_operations from installed)),
  ('expense_drafts',(select expense_drafts from installed)),('supplier_bills',(select supplier_bills from installed))) x(name,relid)
)
select
 accounts is not null as ledger_accounts_present,journals is not null as ledger_journals_present,
 journal_lines is not null as ledger_journal_lines_present,sources is not null as ledger_sources_present,
 coverage is not null as ledger_coverage_present,decisions is not null as ledger_decisions_present,
 account_operations is not null as ledger_account_operations_present,
 expense_drafts is not null as expense_drafts_present,supplier_bills is not null as supplier_bills_present,
 coalesce((select bool_and(coalesce((select relrowsecurity from pg_class where oid=relid),false)
  and coalesce((select relforcerowsecurity from pg_class where oid=relid),false)) from tables),false) as all_rls_enabled_and_forced,
 coalesce((select bool_and(not has_table_privilege('authenticated',relid,'select') and not has_table_privilege('authenticated',relid,'insert')
  and not has_table_privilege('authenticated',relid,'update') and not has_table_privilege('authenticated',relid,'delete')) from tables),false) as direct_table_access_revoked,
 read_ledger is not null as read_ledger_rpc_present,save_account is not null as save_account_rpc_present,post_journal is not null as post_journal_rpc_present,
 read_expenses is not null as read_expense_drafts_rpc_present,save_expense is not null as save_expense_draft_rpc_present,
 review_expense is not null as review_expense_rpc_present,read_bills is not null as read_supplier_bills_rpc_present,
 save_bill is not null as save_supplier_bill_rpc_present,review_bill is not null as review_supplier_bill_rpc_present,
 coalesce(has_function_privilege('authenticated',read_ledger,'execute'),false) as authenticated_read_rpc_allowed,
 coalesce(has_function_privilege('authenticated',save_account,'execute'),false) as authenticated_save_account_rpc_allowed,
 coalesce(has_function_privilege('authenticated',post_journal,'execute'),false) as authenticated_post_rpc_allowed,
 coalesce(not has_function_privilege('anon',post_journal,'execute'),false) as anonymous_post_rpc_denied
from installed;
