-- BA-01: reviewed supporting evidence and AI proposals. Apply after 001-005.
-- No cash creation, model inference, service-role application client or hosted execution.
begin;

create function public.raqam_document_fields_valid(p_fields jsonb, p_accepted boolean default false)
returns boolean language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb;
begin
  if jsonb_typeof(p_fields) is distinct from 'object' or
     not (p_fields ?& array['counterparty','date','totalMinor','currency','reference']) or
     p_fields - array['counterparty','date','totalMinor','currency','reference'] <> '{}'::jsonb then return false; end if;
  foreach k in array array['counterparty','date','totalMinor','currency','reference'] loop
    v := p_fields->k;
    if v <> 'null'::jsonb and jsonb_typeof(v) <> 'string' then return false; end if;
  end loop;
  if length(p_fields->>'counterparty') > 2000 or length(p_fields->>'currency') > 10 or length(p_fields->>'reference') > 500 then return false; end if;
  if p_fields->>'date' is not null and
     (p_fields->>'date' !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' or (p_fields->>'date')::date::text <> p_fields->>'date') then return false; end if;
  if p_fields->>'totalMinor' is not null then
    if p_fields->>'totalMinor' !~ '^(0|[1-9][0-9]*)$' or length(p_fields->>'totalMinor') > 19 then return false; end if;
    if (p_fields->>'totalMinor')::numeric > 9223372036854775807 then return false; end if;
  end if;
  if p_accepted and (p_fields->>'date' is null or p_fields->>'totalMinor' is null or p_fields->>'currency' is distinct from 'PKR') then return false; end if;
  return true;
exception when others then return false;
end $$;
create function public.raqam_provenance_valid(p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare k text;
begin
  if jsonb_typeof(p_value) is distinct from 'object' or
     not (p_value ?& array['modelVersion','promptVersion','schemaVersion']) or
     p_value - array['modelVersion','promptVersion','schemaVersion'] <> '{}'::jsonb then return false; end if;
  foreach k in array array['modelVersion','promptVersion','schemaVersion'] loop
    if jsonb_typeof(p_value->k) is distinct from 'string' or length(trim(p_value->>k)) not between 1 and 200 then return false; end if;
  end loop;
  return true;
end $$;

create table public.supporting_documents (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  source_id uuid not null unique, source_type text not null default 'receipt_image' check (source_type = 'receipt_image'),
  extracted_fields jsonb not null default '{"counterparty":null,"date":null,"totalMinor":null,"currency":null,"reference":null}',
  corrected_fields jsonb, extraction_status text not null default 'pending' check (extraction_status in ('pending','complete','failed')),
  extraction_failure text check (extraction_failure in ('provider_timeout','provider_rate_limited','provider_unavailable','invalid_model_output','unreadable_source')),
  provenance jsonb, review_status text not null default 'needs_review' check (review_status in ('proposed','accepted','rejected','needs_review')),
  review_version integer not null default 0 check (review_version >= 0), created_at timestamptz not null default now(),
  foreign key(source_id,workspace_id,source_type) references public.sources(id,workspace_id,source_type),
  unique(id,workspace_id),
  check(public.raqam_document_fields_valid(extracted_fields)),
  check(corrected_fields is null or public.raqam_document_fields_valid(corrected_fields)),
  check((extraction_status = 'failed') = (extraction_failure is not null)),
  check(provenance is null or public.raqam_provenance_valid(provenance)),
  check(extraction_status <> 'complete' or provenance is not null),
  check(review_status <> 'accepted' or public.raqam_document_fields_valid(coalesce(corrected_fields,extracted_fields),true))
);
create table public.document_history (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  document_id uuid not null, actor_subject text not null, operation text not null check(operation in ('extraction','review')),
  previous_value jsonb not null, current_value jsonb not null, version integer not null check(version > 0),
  created_at timestamptz not null default now(), unique(document_id,version),
  foreign key(document_id,workspace_id) references public.supporting_documents(id,workspace_id)
);
create table public.document_operations (
  document_id uuid not null, request_id uuid not null, workspace_id uuid not null references public.workspaces(id),
  request_payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key(document_id,request_id), foreign key(document_id,workspace_id) references public.supporting_documents(id,workspace_id)
);
create table public.document_extraction_jobs (
  document_id uuid not null, request_id uuid not null, workspace_id uuid not null references public.workspaces(id),
  request_payload jsonb not null, state text not null check(state in ('running','complete','failed')),
  expires_at timestamptz not null, created_at timestamptz not null default now(), primary key(document_id,request_id),
  foreign key(document_id,workspace_id) references public.supporting_documents(id,workspace_id)
);
alter table public.transactions add constraint transactions_id_workspace_unique unique(id,workspace_id);
create table public.ai_proposals (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  transaction_id uuid not null, transaction_version integer not null check(transaction_version >= 0),
  kind text not null check(kind in ('category','match')), category text,
  document_id uuid, document_version integer, rationale text not null check(length(trim(rationale)) between 1 and 2000),
  status text not null check(status in ('proposed','needs_review','accepted','rejected')),
  provenance jsonb not null check(public.raqam_provenance_valid(provenance)), review_version integer not null default 0 check(review_version >= 0),
  created_at timestamptz not null default now(),
  foreign key(transaction_id,workspace_id) references public.transactions(id,workspace_id),
  foreign key(document_id,workspace_id) references public.supporting_documents(id,workspace_id),
  check((kind = 'category' and category in ('customer_receipts','software_services','premises_utilities','travel','other_operating_cash_activity','transfers_owner_movements','uncategorized') and category is not null and document_id is null and document_version is null)
     or (kind = 'match' and category is null and document_id is not null and document_version is not null and document_version >= 0))
);
create table public.proposal_batches (
  workspace_id uuid not null references public.workspaces(id), request_id uuid not null, request_payload jsonb not null,
  result jsonb not null, created_at timestamptz not null default now(), primary key(workspace_id,request_id)
);

-- Immutable receipts/history and ordinary read-only tables. Every write requires an audited owner RPC.
do $$ declare t text; begin
  foreach t in array array['supporting_documents','document_history','document_operations','document_extraction_jobs','ai_proposals','proposal_batches'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('create policy owner_read on public.%I for select to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_subject = (select auth.jwt()->>''sub'')))',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;

-- Internal serializers are not executable by application roles.
create function public.raqam_document_record(p_id uuid) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('document',jsonb_build_object('id',id,'workspaceId',workspace_id,
    'source',jsonb_build_object('sourceId',source_id,'rowNumber',null),'extractedFields',extracted_fields,'correctedFields',corrected_fields,
    'extractionStatus',extraction_status,'reviewStatus',review_status,'modelVersion',provenance->>'modelVersion','promptVersion',provenance->>'promptVersion'),
    'reviewVersion',review_version,'schemaVersion',provenance->>'schemaVersion','extractionFailure',extraction_failure)
  from public.supporting_documents where id = p_id;
$$;
create function public.raqam_proposal_record(p_id uuid) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id',id,'workspaceId',workspace_id,'transactionId',transaction_id,'transactionVersion',transaction_version,
    'reviewVersion',review_version,'rationale',rationale,'status',status,'provenance',provenance,'suggestion',
    case when kind = 'category' then jsonb_build_object('kind',kind,'category',category)
    else jsonb_build_object('kind',kind,'documentId',document_id,'documentVersion',document_version) end)
  from public.ai_proposals where id = p_id;
$$;
create function public.register_supporting_document(p_source_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.sources%rowtype; d uuid; duplicate boolean;
begin
  select src.* into s from public.sources src join public.workspaces w on w.id = src.workspace_id
    where src.id = p_source_id and w.owner_subject = (select auth.jwt()->>'sub') and coalesce(w.owner_subject,'') <> '';
  if not found then raise exception using errcode = 'P0002', message = 'Source not found'; end if;
  if s.source_type <> 'receipt_image' then raise exception using errcode = '22023', message = 'Image source required'; end if;
  perform 1 from public.workspaces where id = s.workspace_id for update;
  select id into d from public.supporting_documents where source_id = p_source_id;
  duplicate := found;
  if not duplicate then insert into public.supporting_documents(workspace_id,source_id) values(s.workspace_id,s.id) returning id into d; end if;
  return jsonb_build_object('record',public.raqam_document_record(d),'duplicate',duplicate);
end $$;

create function public.reserve_document_extraction(p_document_id uuid,p_request_id uuid,p_expected_version integer,p_provenance jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.supporting_documents%rowtype; job public.document_extraction_jobs%rowtype; command jsonb; receipt jsonb; deadline timestamptz;
begin
  select doc.* into d from public.supporting_documents doc join public.workspaces w on w.id = doc.workspace_id
    where doc.id = p_document_id and w.owner_subject = (select auth.jwt()->>'sub') and coalesce(w.owner_subject,'') <> '';
  if not found then raise exception using errcode = 'P0002', message = 'Document not found'; end if;
  perform 1 from public.workspaces where id = d.workspace_id for update;
  select * into d from public.supporting_documents where id = p_document_id for update;
  if p_request_id is null or p_expected_version is null or p_expected_version < 0 or not public.raqam_provenance_valid(p_provenance) then
    raise exception using errcode = '22023', message = 'Invalid extraction reservation'; end if;
  command := jsonb_build_object('expectedVersion',p_expected_version,'provenance',p_provenance);
  select * into job from public.document_extraction_jobs where document_id = d.id and request_id = p_request_id;
  if found then
    if job.request_payload is distinct from command then raise exception using errcode = 'PT409', message = 'Request conflict'; end if;
    select result into receipt from public.document_operations where document_id = d.id and request_id = p_request_id;
    if found then return jsonb_build_object('state','cached','requestId',p_request_id,'record',receipt->'record'); end if;
    if job.state = 'running' and job.expires_at > clock_timestamp() then
      return jsonb_build_object('state','busy','requestId',p_request_id,'expiresAt',job.expires_at); end if;
    raise exception using errcode = 'PT409', message = 'Expired request; use a new request ID';
  end if;
  if d.review_version <> p_expected_version then raise exception using errcode = 'PT409', message = 'Document version conflict'; end if;
  if d.extraction_status = 'complete' and d.provenance = p_provenance then
    return jsonb_build_object('state','cached','requestId',p_request_id,'record',public.raqam_document_record(d.id)); end if;
  if d.corrected_fields is not null or d.review_status in ('accepted','rejected') or d.extraction_status = 'complete' then
    raise exception using errcode = 'PT409', message = 'Existing document decision preserved'; end if;
  select * into job from public.document_extraction_jobs where document_id = d.id and state = 'running' and expires_at > clock_timestamp();
  if found then return jsonb_build_object('state','busy','requestId',p_request_id,'expiresAt',job.expires_at); end if;
  update public.document_extraction_jobs set state = 'failed' where document_id = d.id and state = 'running';
  deadline := clock_timestamp() + interval '90 seconds';
  insert into public.document_extraction_jobs(document_id,request_id,workspace_id,request_payload,state,expires_at)
    values(d.id,p_request_id,d.workspace_id,command,'running',deadline);
  return jsonb_build_object('state','reserved','requestId',p_request_id,'expiresAt',deadline);
end $$;

create function public.raqam_mutate_document(p_kind text,p_document_id uuid,p_request_id uuid,p_expected_version integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.supporting_documents%rowtype; receipt public.document_operations%rowtype;
  command jsonb; before_value jsonb; result jsonb; subject text := (select auth.jwt()->>'sub');
begin
  select doc.* into d from public.supporting_documents doc join public.workspaces w on w.id = doc.workspace_id
    where doc.id = p_document_id and w.owner_subject = subject and coalesce(subject,'') <> '';
  if not found then raise exception using errcode = 'P0002', message = 'Document not found'; end if;
  perform 1 from public.workspaces where id = d.workspace_id for update;
  select * into d from public.supporting_documents where id = p_document_id for update;
  if p_request_id is null or p_expected_version is null or p_expected_version < 0 or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Invalid document command'; end if;
  command := jsonb_build_object('kind',p_kind,'expectedVersion',p_expected_version,'payload',p_payload);
  select * into receipt from public.document_operations where document_id = d.id and request_id = p_request_id;
  if found then
    if receipt.request_payload is distinct from command then raise exception using errcode = 'PT409', message = 'Request conflict'; end if;
    return receipt.result || jsonb_build_object('duplicate',true);
  end if;
  if d.review_version <> p_expected_version or d.review_version = 2147483647 then raise exception using errcode = 'PT409', message = 'Document version conflict'; end if;
  before_value := public.raqam_document_record(d.id);
  if p_kind = 'extraction' then
    if not exists(select 1 from public.document_extraction_jobs j where j.document_id = d.id and j.request_id = p_request_id and
        j.state = 'running' and j.expires_at > clock_timestamp() and (j.request_payload->>'expectedVersion')::integer = p_expected_version and
        (p_payload->>'status' = 'failed' or j.request_payload->'provenance' = p_payload->'provenance')) then
      raise exception using errcode = 'PT409', message = 'Active extraction reservation required'; end if;
    if d.corrected_fields is not null or d.review_status in ('accepted','rejected') or d.extraction_status = 'complete' then
      raise exception using errcode = 'PT409', message = 'Existing document decision preserved'; end if;
    if p_payload->>'status' = 'complete' and p_payload - array['status','fields','provenance'] = '{}'::jsonb
       and public.raqam_document_fields_valid(p_payload->'fields') and public.raqam_provenance_valid(p_payload->'provenance') then
      update public.supporting_documents set extracted_fields = p_payload->'fields',provenance = p_payload->'provenance',
        extraction_status = 'complete',extraction_failure = null,review_status = 'proposed' where id = d.id;
    elsif p_payload->>'status' = 'failed' and p_payload - array['status','reason'] = '{}'::jsonb and
       p_payload->>'reason' in ('provider_timeout','provider_rate_limited','provider_unavailable','invalid_model_output','unreadable_source') then
      update public.supporting_documents set extraction_status = 'failed',extraction_failure = p_payload->>'reason',review_status = 'needs_review' where id = d.id;
    else raise exception using errcode = '22023', message = 'Invalid extraction outcome'; end if;
  elsif p_kind = 'review' then
    if p_payload->>'action' in ('accept','correct') and p_payload - array['action','fields'] = '{}'::jsonb and
       public.raqam_document_fields_valid(p_payload->'fields',p_payload->>'action' = 'accept') then
      update public.supporting_documents set corrected_fields = p_payload->'fields',
        review_status = case when p_payload->>'action' = 'accept' then 'accepted' else 'needs_review' end where id = d.id;
    elsif p_payload = '{"action":"reject"}'::jsonb then
      update public.supporting_documents set review_status = 'rejected' where id = d.id;
    else raise exception using errcode = '22023', message = 'Invalid document review'; end if;
  else raise exception using errcode = '22023', message = 'Invalid operation'; end if;
  update public.supporting_documents set review_version = review_version + 1 where id = d.id;
  result := jsonb_build_object('requestId',p_request_id,'record',public.raqam_document_record(d.id),'duplicate',false);
  insert into public.document_history(workspace_id,document_id,actor_subject,operation,previous_value,current_value,version)
    values(d.workspace_id,d.id,subject,p_kind,before_value,result->'record',d.review_version + 1);
  insert into public.document_operations(document_id,request_id,workspace_id,request_payload,result)
    values(d.id,p_request_id,d.workspace_id,command,result);
  if p_kind = 'extraction' then update public.document_extraction_jobs set state = p_payload->>'status'
    where document_id = d.id and request_id = p_request_id; end if;
  return result;
end $$;
create function public.save_document_extraction(p_document_id uuid,p_request_id uuid,p_expected_version integer,p_outcome jsonb)
returns jsonb language sql security definer set search_path = '' as $$
  select public.raqam_mutate_document('extraction',p_document_id,p_request_id,p_expected_version,p_outcome);
$$;
create function public.review_supporting_document(p_document_id uuid,p_request_id uuid,p_expected_version integer,p_decision jsonb)
returns jsonb language sql security definer set search_path = '' as $$
  select public.raqam_mutate_document('review',p_document_id,p_request_id,p_expected_version,p_decision);
$$;

create function public.raqam_register_proposals(p_kind text,p_request_id uuid,p_provenance jsonb,p_proposals jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare subject text := (select auth.jwt()->>'sub'); wid uuid; item jsonb; tx public.transactions%rowtype;
  doc public.supporting_documents%rowtype; receipt public.proposal_batches%rowtype; command jsonb; result jsonb;
  seen text[] := '{}'; identity text; proposal_id uuid; items jsonb := '[]';
begin
  if coalesce(subject,'') = '' then raise exception using errcode = 'P0002', message = 'Workspace not found'; end if;
  select id into wid from public.workspaces where owner_subject = subject for update;
  if not found then raise exception using errcode = 'P0002', message = 'Workspace not found'; end if;
  if p_kind not in ('category','match') or p_request_id is null or not public.raqam_provenance_valid(p_provenance) or
     jsonb_typeof(p_proposals) is distinct from 'array' then raise exception using errcode = '22023', message = 'Invalid proposals'; end if;
  if jsonb_array_length(p_proposals) not between 1 and 50 then raise exception using errcode = '22023', message = 'Invalid proposal count'; end if;
  command := jsonb_build_object('kind',p_kind,'provenance',p_provenance,'proposals',p_proposals);
  select * into receipt from public.proposal_batches where workspace_id = wid and request_id = p_request_id;
  if found then
    if receipt.request_payload is distinct from command then raise exception using errcode = 'PT409', message = 'Request conflict'; end if;
    return receipt.result || jsonb_build_object('duplicate',true);
  end if;
  for item in select value from jsonb_array_elements(p_proposals) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'transactionId') is distinct from 'string' or
       jsonb_typeof(item->'transactionVersion') is distinct from 'number' or item->>'transactionVersion' !~ '^(0|[1-9][0-9]*)$' or
       jsonb_typeof(item->'rationale') is distinct from 'string' or length(trim(item->>'rationale')) not between 1 and 2000 or
       (item->>'status' in ('proposed','needs_review')) is distinct from true then raise exception using errcode = '22023', message = 'Invalid proposal'; end if;
    select * into tx from public.transactions where id = (item->>'transactionId')::uuid and workspace_id = wid for update;
    if not found then raise exception using errcode = 'P0002', message = 'Transaction not found'; end if;
    if tx.review_version <> (item->>'transactionVersion')::numeric then raise exception using errcode = 'PT409', message = 'Transaction version conflict'; end if;
    if p_kind = 'category' then
      if item - array['transactionId','transactionVersion','category','rationale','status'] <> '{}'::jsonb or
         (item->>'category' in ('customer_receipts','software_services','premises_utilities','travel','other_operating_cash_activity','transfers_owner_movements','uncategorized')) is distinct from true then
        raise exception using errcode = '22023', message = 'Invalid category proposal'; end if;
      if tx.category_status = 'accepted' then raise exception using errcode = 'PT409', message = 'Existing category preserved'; end if;
      identity := tx.id::text;
    else
      if item - array['transactionId','transactionVersion','documentId','documentVersion','rationale','status'] <> '{}'::jsonb or
         jsonb_typeof(item->'documentId') is distinct from 'string' or jsonb_typeof(item->'documentVersion') is distinct from 'number' or
         item->>'documentVersion' !~ '^(0|[1-9][0-9]*)$' then raise exception using errcode = '22023', message = 'Invalid match proposal'; end if;
      select * into doc from public.supporting_documents where id = (item->>'documentId')::uuid and workspace_id = wid for update;
      if not found then raise exception using errcode = 'P0002', message = 'Document not found'; end if;
      if doc.review_version <> (item->>'documentVersion')::numeric or doc.review_status <> 'accepted' then
        raise exception using errcode = 'PT409', message = 'Reviewed document required'; end if;
      -- Currency/amount differences can remain explicit needs-review candidates; only BA-04 can approve a compatible allocation.
      identity := tx.id::text || ':' || doc.id::text;
    end if;
    if identity = any(seen) then raise exception using errcode = '22023', message = 'Duplicate proposal'; end if;
    seen := array_append(seen,identity);
    insert into public.ai_proposals(workspace_id,transaction_id,transaction_version,kind,category,document_id,document_version,rationale,status,provenance)
      values(wid,tx.id,tx.review_version,p_kind,case when p_kind = 'category' then item->>'category' end,
        case when p_kind = 'match' then doc.id end,case when p_kind = 'match' then doc.review_version end,item->>'rationale',item->>'status',p_provenance)
      returning id into proposal_id;
    items := items || jsonb_build_array(public.raqam_proposal_record(proposal_id));
  end loop;
  result := jsonb_build_object('requestId',p_request_id,'items',items,'duplicate',false);
  insert into public.proposal_batches(workspace_id,request_id,request_payload,result) values(wid,p_request_id,command,result);
  return result;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'Invalid proposal value';
end $$;
create function public.register_category_proposals(p_request_id uuid,p_provenance jsonb,p_proposals jsonb)
returns jsonb language sql security definer set search_path = '' as $$
  select public.raqam_register_proposals('category',p_request_id,p_provenance,p_proposals);
$$;
create function public.register_match_proposals(p_request_id uuid,p_provenance jsonb,p_proposals jsonb)
returns jsonb language sql security definer set search_path = '' as $$
  select public.raqam_register_proposals('match',p_request_id,p_provenance,p_proposals);
$$;

revoke all on function public.raqam_document_fields_valid(jsonb,boolean),public.raqam_provenance_valid(jsonb),
  public.raqam_document_record(uuid),public.raqam_proposal_record(uuid),public.raqam_mutate_document(text,uuid,uuid,integer,jsonb),
  public.raqam_register_proposals(text,uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.register_supporting_document(uuid),public.reserve_document_extraction(uuid,uuid,integer,jsonb),public.save_document_extraction(uuid,uuid,integer,jsonb),
  public.review_supporting_document(uuid,uuid,integer,jsonb),public.register_category_proposals(uuid,jsonb,jsonb),
  public.register_match_proposals(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.register_supporting_document(uuid),public.reserve_document_extraction(uuid,uuid,integer,jsonb),public.save_document_extraction(uuid,uuid,integer,jsonb),
  public.review_supporting_document(uuid,uuid,integer,jsonb),public.register_category_proposals(uuid,jsonb,jsonb),
  public.register_match_proposals(uuid,jsonb,jsonb) to authenticated;
commit;
