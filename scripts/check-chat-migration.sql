-- Read-only migration 017 completeness check. Returns metadata only.
select
 to_regclass('public.chat_conversations') is not null as conversations_exist,
 to_regclass('public.chat_messages') is not null as messages_exist,
 coalesce((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in (to_regclass('public.chat_conversations'),to_regclass('public.chat_messages'))),false) as owner_rls_enabled,
 exists(select 1 from pg_attribute where attrelid=to_regclass('public.cashbook_records') and attname='source_type' and not attisdropped) as cashbook_provenance_present,
 exists(select 1 from pg_constraint where conrelid=to_regclass('public.sources') and pg_get_constraintdef(oid) like '%manual_chat%') as manual_sources_allowed,
 to_regprocedure('public.save_chat_exchange(uuid,uuid,uuid,text,text,jsonb)') is not null as exchange_rpc_exists,
 to_regprocedure('public.decide_chat_changes(uuid,uuid,text)') is not null as decision_rpc_exists,
 case when to_regprocedure('public.decide_chat_changes(uuid,uuid,text)') is null then false else
 has_function_privilege('authenticated','public.decide_chat_changes(uuid,uuid,text)','EXECUTE') and not has_function_privilege('anon','public.decide_chat_changes(uuid,uuid,text)','EXECUTE') end as decision_grants_valid,
 exists(select 1 from pg_indexes where schemaname='public' and indexname='ledger_one_posted_cash_movement' and indexdef like '%cash_superseded%') as corrected_cash_link_index_present;
