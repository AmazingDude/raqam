-- Forward-only receipt evidence/cache identity. Apply manually after 001-007.
begin;
create function public.raqam_receipt_identity_valid(v jsonb) returns boolean
language plpgsql immutable set search_path='' as $$ declare k text; begin
  if jsonb_typeof(v) is distinct from 'object' or not(v ?& array['ownerId','workspaceId','sourceHash','provider','providerVersion','modelId','promptVersion','schemaVersion','preprocessingVersion','cacheKey']) or
    v - array['ownerId','workspaceId','sourceHash','provider','providerVersion','modelId','promptVersion','schemaVersion','preprocessingVersion','cacheKey'] <> '{}'::jsonb then return false; end if;
  foreach k in array array['ownerId','workspaceId','sourceHash','provider','providerVersion','modelId','promptVersion','schemaVersion','preprocessingVersion','cacheKey'] loop
    if jsonb_typeof(v->k) is distinct from 'string' or length(trim(v->>k)) not between 1 and 200 then return false; end if;
  end loop;
  return v->>'provider' in ('groq','gemini') and v->>'sourceHash' ~ '^[a-f0-9]{64}$' and v->>'cacheKey' ~ '^[a-f0-9]{64}$';
end $$;
create function public.raqam_receipt_evidence_valid(v jsonb,f jsonb) returns boolean
language plpgsql immutable set search_path='' as $$ declare k text; field jsonb; name text; maxlen integer; issue jsonb; candidate jsonb; issues text[] := '{}'; begin
  if jsonb_typeof(v) is distinct from 'object' or not(v ?& array['sourceId','sourceVersion','status','fields','blockers']) or
    v - array['sourceId','sourceVersion','status','fields','blockers'] <> '{}'::jsonb or
    jsonb_typeof(v->'sourceId') is distinct from 'string' or jsonb_typeof(v->'sourceVersion') is distinct from 'string' or
    (v->>'status' in ('proposed','needs_review')) is distinct from true or
    jsonb_typeof(v->'fields') is distinct from 'object' or not(v->'fields' ?& array['merchant','documentDate','total','currency','reference']) or
    (v->'fields') - array['merchant','documentDate','total','currency','reference'] <> '{}'::jsonb or
    jsonb_typeof(v->'blockers') is distinct from 'array' or jsonb_array_length(v->'blockers') > 7 then return false; end if;
  foreach k in array array['merchant','documentDate','total','currency','reference'] loop
    name := case k when 'merchant' then 'counterparty' when 'documentDate' then 'date' when 'total' then 'totalMinor' else k end;
    maxlen := case k when 'merchant' then 2000 when 'documentDate' then 100 when 'total' then 200 when 'currency' then 20 else 500 end;
    field := v->'fields'->k;
    if jsonb_typeof(field) is distinct from 'object' or not(field ?& array['rawText','observedCandidates','normalizedValue','state','evidenceField','issues']) or
      field - array['rawText','observedCandidates','normalizedValue','state','evidenceField','issues'] <> '{}'::jsonb or
      (field->'rawText' <> 'null'::jsonb and jsonb_typeof(field->'rawText') <> 'string') or length(field->>'rawText') > maxlen or
      field->'normalizedValue' is distinct from f->name or
      field->>'evidenceField' is distinct from (case k when 'documentDate' then 'document_date' else k end) or
      (field->>'state' in ('observed','missing','unreadable','ambiguous')) is distinct from true or
      ((field->>'state' = 'observed') is distinct from (field->'normalizedValue' <> 'null'::jsonb)) or
      jsonb_typeof(field->'observedCandidates') is distinct from 'array' or jsonb_array_length(field->'observedCandidates') > 5 or
      jsonb_typeof(field->'issues') is distinct from 'array' or jsonb_array_length(field->'issues') > 7 then return false; end if;
    for candidate in select value from jsonb_array_elements(field->'observedCandidates') loop
      if jsonb_typeof(candidate) <> 'string' or length(candidate #>> '{}') > 2000 then return false; end if;
    end loop;
    for issue in select value from jsonb_array_elements(field->'issues') loop
      if jsonb_typeof(issue) <> 'string' or (issue #>> '{}' in ('missing_field','unreadable_field','ambiguous_date','currency_unknown','currency_mismatch','amount_invalid','multiple_totals')) is distinct from true then return false; end if;
      issues := array_append(issues,issue #>> '{}');
    end loop;
    if (select count(*) <> count(distinct value) from jsonb_array_elements(field->'issues')) then return false; end if;
  end loop;
  if (select count(*) <> count(distinct value) from jsonb_array_elements(v->'blockers')) then return false; end if;
  return (select coalesce(array_agg(distinct x order by x),'{}') from unnest(issues) x) =
    (select coalesce(array_agg(value #>> '{}' order by value #>> '{}'),'{}') from jsonb_array_elements(v->'blockers')) and
    v->>'status' = case when cardinality(issues) = 0 then 'proposed' else 'needs_review' end;
exception when others then return false; end $$;
create function public.raqam_receipt_failure_valid(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$ begin
  return jsonb_typeof(v) = 'object' and v ?& array['reason','retryable','retryAfterMs'] and
    v - array['reason','retryable','retryAfterMs'] = '{}'::jsonb and jsonb_typeof(v->'reason') = 'string' and
    v->>'reason' in ('configuration_missing','invalid_request','invalid_model_output','provider_auth','provider_request','provider_blocked','provider_rate_limited','provider_unavailable','provider_timeout','provider_network','deadline_exceeded','cancelled','budget_exhausted','budget_unavailable') and
    jsonb_typeof(v->'retryable') = 'boolean' and (v->'retryAfterMs' = 'null'::jsonb or
      (jsonb_typeof(v->'retryAfterMs') = 'number' and v->>'retryAfterMs' ~ '^(0|[1-9][0-9]*)$' and (v->>'retryAfterMs')::numeric <= 2147483647));
exception when others then return false; end $$;
create table public.receipt_extraction_contexts (
  document_id uuid not null, request_id uuid not null, workspace_id uuid not null,
  identity jsonb not null check(public.raqam_receipt_identity_valid(identity)), outcome jsonb, saved_version integer,
  primary key(document_id,request_id),
  unique(document_id,saved_version),
  foreign key(document_id,request_id) references public.document_extraction_jobs(document_id,request_id),
  foreign key(document_id,workspace_id) references public.supporting_documents(id,workspace_id),
  check((outcome is null) = (saved_version is null)), check(saved_version is null or saved_version > 0)
);
alter table public.receipt_extraction_contexts enable row level security;
alter table public.receipt_extraction_contexts force row level security;
create policy owner_read on public.receipt_extraction_contexts for select to authenticated using
 (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_subject=(select auth.jwt()->>'sub')));
revoke all on public.receipt_extraction_contexts from public,anon,authenticated;
grant select on public.receipt_extraction_contexts to authenticated;

create or replace function public.raqam_document_record(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('document',jsonb_build_object('id',d.id,'workspaceId',d.workspace_id,
  'source',jsonb_build_object('sourceId',d.source_id,'rowNumber',null),'extractedFields',d.extracted_fields,'correctedFields',d.corrected_fields,
  'extractionStatus',d.extraction_status,'reviewStatus',d.review_status,'modelVersion',d.provenance->>'modelVersion','promptVersion',d.provenance->>'promptVersion'),
  'reviewVersion',d.review_version,'schemaVersion',d.provenance->>'schemaVersion','extractionFailure',d.extraction_failure,
  'extractionContext',(select jsonb_build_object('identity',c.identity,'evidence',c.outcome->'evidence','failure',c.outcome->'failure')
    from public.receipt_extraction_contexts c where c.document_id=d.id and c.saved_version <= d.review_version order by c.saved_version desc limit 1))
 from public.supporting_documents d where d.id=p_id;
$$;
create function public.reserve_receipt_extraction(p_document_id uuid,p_request_id uuid,p_expected_version integer,p_provenance jsonb,p_identity jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.supporting_documents%rowtype; s public.sources%rowtype; ctx public.receipt_extraction_contexts%rowtype; result jsonb; subject text := (select auth.jwt()->>'sub'); begin
 select doc.* into d from public.supporting_documents doc join public.workspaces w on w.id=doc.workspace_id where doc.id=p_document_id and w.owner_subject=subject and coalesce(subject,'')<>'';
 if not found then raise exception using errcode='P0002',message='Document not found'; end if;
 perform 1 from public.workspaces where id=d.workspace_id for update;
 select * into d from public.supporting_documents where id=p_document_id for update;
 select * into s from public.sources where id=d.source_id and workspace_id=d.workspace_id;
 if not public.raqam_receipt_identity_valid(p_identity) or not public.raqam_provenance_valid(p_provenance) or
  p_identity->>'ownerId' is distinct from subject or p_identity->>'workspaceId' is distinct from d.workspace_id::text or
  p_identity->>'sourceHash' is distinct from s.content_hash or s.status <> 'complete' or
  p_identity->>'modelId' is distinct from p_provenance->>'modelVersion' or p_identity->>'promptVersion' is distinct from p_provenance->>'promptVersion' or
  p_identity->>'schemaVersion' is distinct from p_provenance->>'schemaVersion' then raise exception using errcode='22023',message='Invalid receipt identity'; end if;
 select * into ctx from public.receipt_extraction_contexts where document_id=d.id and request_id=p_request_id;
 if found then
   if ctx.identity is distinct from p_identity then raise exception using errcode='PT409',message='Identity request conflict'; end if;
 elsif d.extraction_status='complete' then
   select * into ctx from public.receipt_extraction_contexts where document_id=d.id and saved_version is not null order by saved_version desc limit 1;
   if not found or ctx.identity is distinct from p_identity then raise exception using errcode='PT409',message='Completed extraction identity preserved'; end if;
 end if;
 result := public.reserve_document_extraction(p_document_id,p_request_id,p_expected_version,p_provenance);
 if result->>'state'='cached' and exists(select 1 from public.receipt_extraction_contexts where document_id=d.id and request_id=p_request_id and outcome is null) then
   raise exception using errcode='PT409',message='Extraction receipt not complete'; end if;
 if result->>'state'='reserved' then insert into public.receipt_extraction_contexts(document_id,request_id,workspace_id,identity) values(d.id,p_request_id,d.workspace_id,p_identity); end if;
 return result || jsonb_build_object('currentRecord',public.raqam_document_record(d.id));
end $$;
create function public.save_receipt_extraction(p_document_id uuid,p_request_id uuid,p_expected_version integer,p_outcome jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.supporting_documents%rowtype; ctx public.receipt_extraction_contexts%rowtype; result jsonb; failure_reason text; begin
 select doc.* into d from public.supporting_documents doc join public.workspaces w on w.id=doc.workspace_id where doc.id=p_document_id and w.owner_subject=(select auth.jwt()->>'sub') and coalesce(w.owner_subject,'')<>'';
 if not found then raise exception using errcode='P0002',message='Document not found'; end if;
 perform 1 from public.workspaces where id=d.workspace_id for update;
 select * into d from public.supporting_documents where id=p_document_id for update;
 select * into ctx from public.receipt_extraction_contexts where document_id=d.id and request_id=p_request_id;
 if not found then raise exception using errcode='PT409',message='Receipt reservation required'; end if;
 if ctx.outcome is not null and ctx.outcome is distinct from p_outcome then raise exception using errcode='PT409',message='Receipt request conflict'; end if;
 if p_outcome->>'status'='complete' then
   if p_outcome - array['status','fields','provenance','evidence'] <> '{}'::jsonb or
     not public.raqam_document_fields_valid(p_outcome->'fields') or not public.raqam_provenance_valid(p_outcome->'provenance') or
     not public.raqam_receipt_evidence_valid(p_outcome->'evidence',p_outcome->'fields') or
     p_outcome->'evidence'->>'sourceId' is distinct from d.source_id::text or p_outcome->'evidence'->>'sourceVersion' is distinct from ctx.identity->>'sourceHash' then
     raise exception using errcode='22023',message='Invalid receipt evidence'; end if;
 elsif p_outcome->>'status'='failed' then
   failure_reason := p_outcome->'failure'->>'reason';
   if p_outcome - array['status','reason','failure'] <> '{}'::jsonb or public.raqam_receipt_failure_valid(p_outcome->'failure') is distinct from true or
     p_outcome->>'reason' is distinct from (case when failure_reason='invalid_model_output' then 'invalid_model_output'
       when failure_reason in ('provider_timeout','deadline_exceeded') then 'provider_timeout'
       when failure_reason in ('provider_rate_limited','budget_exhausted') then 'provider_rate_limited' else 'provider_unavailable' end) then
     raise exception using errcode='22023',message='Invalid receipt failure'; end if;
 else raise exception using errcode='22023',message='Invalid receipt outcome'; end if;
 if ctx.outcome is null then update public.receipt_extraction_contexts set outcome=p_outcome,saved_version=p_expected_version+1 where document_id=d.id and request_id=p_request_id; end if;
 result := public.save_document_extraction(p_document_id,p_request_id,p_expected_version,p_outcome-array['evidence','failure']);
 return result || jsonb_build_object('currentRecord',public.raqam_document_record(d.id));
end $$;
revoke all on function public.raqam_receipt_identity_valid(jsonb),public.raqam_receipt_evidence_valid(jsonb,jsonb),public.raqam_receipt_failure_valid(jsonb) from public,anon,authenticated;
revoke all on function public.reserve_receipt_extraction(uuid,uuid,integer,jsonb,jsonb),public.save_receipt_extraction(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_receipt_extraction(uuid,uuid,integer,jsonb,jsonb),public.save_receipt_extraction(uuid,uuid,integer,jsonb) to authenticated;

-- Conservative application allowance, not a claim about Groq's actual account quota.
-- Reserve both possible attempts once; unused slots are deliberately not refunded.
create table public.receipt_provider_days(account_fingerprint text not null check(account_fingerprint ~ '^[a-f0-9]{64}$'),
  day date not null, reserved_attempts integer not null check(reserved_attempts between 0 and 120),primary key(account_fingerprint,day));
create table public.receipt_provider_allowances(document_id uuid not null,request_id uuid not null,
  primary key(document_id,request_id),foreign key(document_id,request_id) references public.receipt_extraction_contexts(document_id,request_id));
alter table public.receipt_provider_days enable row level security;
alter table public.receipt_provider_days force row level security;
alter table public.receipt_provider_allowances enable row level security;
alter table public.receipt_provider_allowances force row level security;
revoke all on public.receipt_provider_days,public.receipt_provider_allowances from public,anon,authenticated;
create function public.reserve_receipt_provider_allowance(p_document_id uuid,p_request_id uuid,p_account_fingerprint text)
returns boolean language plpgsql security definer set search_path='' as $$ declare wid uuid; today date := (clock_timestamp() at time zone 'UTC')::date; used integer; begin
  select c.workspace_id into wid from public.receipt_extraction_contexts c join public.workspaces w on w.id=c.workspace_id
    join public.document_extraction_jobs j on j.document_id=c.document_id and j.request_id=c.request_id
    where c.document_id=p_document_id and c.request_id=p_request_id and c.outcome is null and c.identity->>'provider'='groq' and
    j.state='running' and j.expires_at>clock_timestamp() and w.owner_subject=(select auth.jwt()->>'sub') and coalesce(w.owner_subject,'')<>'';
  if not found then raise exception using errcode='P0002',message='Active receipt reservation not found'; end if;
  if p_account_fingerprint is null or p_account_fingerprint !~ '^[a-f0-9]{64}$' then raise exception using errcode='22023',message='Invalid account allowance'; end if;
  perform 1 from public.workspaces where id=wid for update;
  if exists(select 1 from public.receipt_provider_allowances where document_id=p_document_id and request_id=p_request_id) then return false; end if;
  insert into public.receipt_provider_days(account_fingerprint,day,reserved_attempts) values(p_account_fingerprint,today,0) on conflict do nothing;
  select reserved_attempts into used from public.receipt_provider_days where account_fingerprint=p_account_fingerprint and day=today for update;
  if used+2>120 then return false; end if;
  update public.receipt_provider_days set reserved_attempts=used+2 where account_fingerprint=p_account_fingerprint and day=today;
  insert into public.receipt_provider_allowances values(p_document_id,p_request_id);
  return true;
end $$;
revoke all on function public.reserve_receipt_provider_allowance(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_receipt_provider_allowance(uuid,uuid,text) to authenticated;
commit;
