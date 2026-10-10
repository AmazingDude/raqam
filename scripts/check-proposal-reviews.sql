-- Read-only after manually applying migration 007. No record values are selected.
select name,to_regclass('public.' || name) is not null as installed,
  has_table_privilege('authenticated','public.' || name,'SELECT') as owner_read_grant,
  has_table_privilege('authenticated','public.' || name,'INSERT,UPDATE,DELETE') as any_direct_write_grant
from unnest(array['proposal_reviews','accepted_matches','proposal_review_operations']) as name;
select to_regprocedure('public.review_ai_proposal(uuid,uuid,integer,jsonb)') is not null as review_rpc_installed;
select count(*) = 3 as all_active_unique_indexes_present from pg_indexes
where schemaname='public' and indexname in ('accepted_match_transaction_once','accepted_match_document_once','accepted_match_proposal_once');
select exists(select 1 from information_schema.columns where table_schema='public' and table_name='cashbook_records' and column_name='match_status') as persisted_match_projection_present;
