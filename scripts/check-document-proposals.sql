-- Read-only installation/privilege check after the user applies migration 006.
select name, to_regclass('public.' || name) is not null as installed,
  has_table_privilege('authenticated','public.' || name,'SELECT') as owner_read_grant,
  has_table_privilege('authenticated','public.' || name,'INSERT,UPDATE,DELETE') as any_direct_write_grant
from unnest(array['supporting_documents','document_history','document_operations','document_extraction_jobs','ai_proposals','proposal_batches']) as name;

select name, to_regprocedure('public.' || name) is not null as installed
from unnest(array[
  'register_supporting_document(uuid)',
  'reserve_document_extraction(uuid,uuid,integer,jsonb)',
  'save_document_extraction(uuid,uuid,integer,jsonb)',
  'review_supporting_document(uuid,uuid,integer,jsonb)',
  'register_category_proposals(uuid,jsonb,jsonb)',
  'register_match_proposals(uuid,jsonb,jsonb)'
]) as name;
