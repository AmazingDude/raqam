-- Long PDF imports: 20,000 rows/import, 50,000 records/workspace.
-- Apply after migrations 001-009. Ownership, locks, audit and retry semantics retained.
-- Index JSON arrays once to avoid repeated scans during large confirmations.
begin;
create or replace function public.register_csv_import(p_workspace_id uuid, p_hash text, p_name text, p_preview jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved_source_id uuid; inserted integer;
begin
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_subject = (select auth.jwt()->>'sub')) then
    raise exception using errcode = 'P0002', message = 'Workspace not found';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_name is null or length(p_name) not between 1 and 255
    or jsonb_typeof(p_preview) is distinct from 'object'
    or p_preview->>'contentHash' is distinct from p_hash
    or p_preview->>'currency' is distinct from 'PKR'
    or jsonb_typeof(p_preview->'header') is distinct from 'array'
    or jsonb_typeof(p_preview->'rows') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Invalid preview';
  end if;
  if jsonb_array_length(p_preview->'rows') not between 1 and 20000 then
    raise exception using errcode = '22023', message = 'Invalid row count';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'raqam-sources'
    and o.name = p_workspace_id::text || '/' || p_hash || '.csv') then
    raise exception using errcode = '22023', message = 'Original CSV must be stored first';
  end if;
  insert into public.sources(workspace_id,source_type,content_hash,storage_path,original_name,status)
    values (p_workspace_id,'transaction_csv',p_hash,p_workspace_id::text || '/' || p_hash || '.csv',p_name,'complete')
    on conflict (workspace_id,source_type,content_hash) do nothing;
  get diagnostics inserted = row_count;
  select s.id into saved_source_id from public.sources s
    where s.workspace_id = p_workspace_id and s.source_type = 'transaction_csv' and s.content_hash = p_hash;
  insert into public.imports(source_id,workspace_id,preview) values (saved_source_id,p_workspace_id,p_preview)
    on conflict (source_id) do nothing;
  return jsonb_build_object('importId',saved_source_id,'duplicate',inserted = 0);
end;
$$;


create or replace function public.confirm_csv_import(p_import_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  batch public.imports%rowtype; subject text := (select auth.jwt()->>'sub');
  row_plan jsonb; original_row jsonb; cash jsonb; action text; row_number integer;
  imported integer := 0; rejected integer := 0; unresolved integer := 0;
  inserted_id uuid; description_index integer; receipt jsonb; original_rows jsonb;
begin
  select i.* into batch from public.imports i join public.workspaces w on w.id = i.workspace_id
    where i.source_id = p_import_id and w.owner_subject = subject and coalesce(subject,'') <> ''
    for update of i, w;
  if not found then raise exception using errcode = 'P0002', message = 'Import not found'; end if;
  if batch.status = 'confirmed' then return batch.confirmation_result || '{"duplicate":true}'::jsonb; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Invalid confirmation rows';
  end if;
  if jsonb_array_length(p_rows) <> jsonb_array_length(batch.preview->'rows') or jsonb_array_length(p_rows) not between 1 and 20000
    or (select count(distinct r->>'rowNumber') from jsonb_array_elements(p_rows) r) <> jsonb_array_length(p_rows) then
    raise exception using errcode = '22023', message = 'Every row needs exactly one outcome';
  end if;
  select (ordinality - 1)::integer into description_index
    from jsonb_array_elements_text(batch.preview->'header') with ordinality as h(name,ordinality) where name = 'description';
  description_index := coalesce((batch.preview->'fieldMap'->>'description')::integer, description_index);
  if description_index is null or description_index < 0 or description_index >= jsonb_array_length(batch.preview->'header') then raise exception using errcode = '22023', message = 'Missing description column'; end if;
  select jsonb_object_agg(r->>'rowNumber', r) into original_rows from jsonb_array_elements(batch.preview->'rows') r;
  for row_plan in select value from jsonb_array_elements(p_rows) loop
    row_number := (row_plan->>'rowNumber')::integer; action := row_plan->>'action';
    original_row := original_rows->(row_number::text);
    if original_row is null or action is null or action not in ('import','correct','reject','unresolved') then
      raise exception using errcode = '22023', message = 'Unknown row or action';
    end if;
    cash := row_plan->'transaction';
    if action = 'unresolved' then
      if original_row->'transaction' is distinct from 'null'::jsonb or cash is distinct from 'null'::jsonb then
        raise exception using errcode = '22023', message = 'Valid rows cannot silently disappear';
      end if;
      unresolved := unresolved + 1;
      continue;
    end if;
    if action = 'reject' then
      if cash is distinct from 'null'::jsonb then raise exception using errcode = '22023', message = 'Rejected row has cash'; end if;
      rejected := rejected + 1;
    else
      if jsonb_typeof(cash) is distinct from 'object' or cash->>'currency' is distinct from 'PKR'
        or jsonb_typeof(cash->'amountMinor') is distinct from 'string'
        or (cash->>'amountMinor') !~ '^(0|[1-9][0-9]{0,18})$'
        or jsonb_typeof(cash->'date') is distinct from 'string'
        or (cash->>'date') !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$'
        or cash->>'direction' is null or cash->>'direction' not in ('in','out') then
        raise exception using errcode = '22023', message = 'Invalid cash row';
      end if;
      if action = 'import' and cash is distinct from original_row->'transaction' then
        raise exception using errcode = '22023', message = 'Corrections require an explicit decision';
      end if;
      insert into public.transactions(workspace_id,source_id,source_row,original_values,date,original_description,description,direction,amount_minor,currency,reference)
        values (batch.workspace_id,batch.source_id,row_number,original_row->'original',(cash->>'date')::date,
          coalesce(original_row->'original'->>description_index,''),cash->>'description',cash->>'direction',(cash->>'amountMinor')::bigint,'PKR',cash->>'reference')
        returning id into inserted_id;
      imported := imported + 1;
    end if;
    insert into public.review_decisions(workspace_id,actor_subject,target_id,target_kind,source_row,action,previous_value,current_value)
      values (batch.workspace_id,subject,batch.source_id,'import_row',row_number,
        case when action = 'import' then 'accept' else action end,original_row,
        case when action = 'reject' then null else jsonb_build_object('transactionId',inserted_id,'transaction',cash) end);
  end loop;
  -- Capacity guard, serialized on the owner workspace to cover concurrent imports.
  if (select count(*) from public.transactions t where t.workspace_id = batch.workspace_id) > 50000 then
    raise exception using errcode = 'P0001', message = 'Workspace transaction limit';
  end if;
  receipt := jsonb_build_object('importId',batch.source_id,'importedCount',imported,'rejectedCount',rejected,'unresolvedCount',unresolved);
  update public.imports set status = 'confirmed',confirmation_result = receipt,confirmation_plan = p_rows,confirmed_at = now()
    where source_id = batch.source_id;
  return receipt || '{"duplicate":false}'::jsonb;
end;
$$;

create or replace function public.resolve_csv_import_rows(p_import_id uuid, p_request_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  batch public.imports%rowtype; saved_request public.import_resolution_requests%rowtype;
  subject text := (select auth.jwt()->>'sub'); row_plan jsonb; original_row jsonb; original_plan jsonb;
  cash jsonb; action text; row_number integer; description_index integer; inserted_id uuid;
  corrected integer := 0; rejected integer := 0; transaction_ids jsonb := '[]'::jsonb; receipt jsonb; state jsonb; original_rows jsonb; original_plans jsonb;
begin
  select i.* into batch from public.imports i join public.workspaces w on w.id = i.workspace_id
    where i.source_id = p_import_id and w.owner_subject = subject and coalesce(subject,'') <> ''
    for update of i, w;
  if not found then raise exception using errcode = 'P0002', message = 'Import not found'; end if;
  if batch.status <> 'confirmed' then raise exception using errcode = '22023', message = 'Confirm preview first'; end if;
  if p_request_id is null then raise exception using errcode = '22023', message = 'Request ID required'; end if;
  select q.* into saved_request from public.import_resolution_requests q
    where q.import_id = p_import_id and q.request_id = p_request_id;
  if found then
    if saved_request.rows is distinct from p_rows then
      raise exception using errcode = 'PT409', message = 'Request ID already used for a different decision';
    end if;
    return saved_request.receipt || '{"duplicate":true}'::jsonb;
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception using errcode = '22023', message = 'Invalid rows'; end if;
  if jsonb_array_length(p_rows) not between 1 and 20000 then raise exception using errcode = '22023', message = 'Invalid row count'; end if;
  if (select count(distinct r->>'rowNumber') from jsonb_array_elements(p_rows) r) <> jsonb_array_length(p_rows) then
    raise exception using errcode = '22023', message = 'Each row needs one decision';
  end if;
  select (ordinality - 1)::integer into description_index
    from jsonb_array_elements_text(batch.preview->'header') with ordinality as h(name,ordinality) where name = 'description';
  description_index := coalesce((batch.preview->'fieldMap'->>'description')::integer, description_index);
  if description_index is null or description_index < 0 or description_index >= jsonb_array_length(batch.preview->'header') then raise exception using errcode = '22023', message = 'Missing original description'; end if;
  select jsonb_object_agg(r->>'rowNumber', r) into original_rows from jsonb_array_elements(batch.preview->'rows') r;
  select jsonb_object_agg(r->>'rowNumber', r) into original_plans from jsonb_array_elements(batch.confirmation_plan) r;
  for row_plan in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(row_plan) is distinct from 'object' then raise exception using errcode = '22023', message = 'Invalid row decision'; end if;
    if exists (select 1 from jsonb_object_keys(row_plan) k where k not in ('rowNumber','action','transaction'))
      or jsonb_typeof(row_plan->'rowNumber') is distinct from 'number'
      or (row_plan->>'rowNumber') !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'Invalid decision fields';
    end if;
    row_number := (row_plan->>'rowNumber')::integer; action := row_plan->>'action';
    original_plan := original_plans->(row_number::text);
    if original_plan is null then raise exception using errcode = '22023', message = 'Row outside import'; end if;
    if original_plan->>'action' <> 'unresolved' or exists (
      select 1 from public.review_decisions d where d.target_id = p_import_id and d.source_row = row_number
    ) then raise exception using errcode = 'PT409', message = 'Row already reviewed'; end if;
    original_row := original_rows->(row_number::text);
    if original_row is null then raise exception using errcode = '22023', message = 'Original row missing'; end if;
    if action = 'reject' then
      if row_plan ? 'transaction' then raise exception using errcode = '22023', message = 'Rejected row cannot carry cash'; end if;
      inserted_id := null; cash := null; rejected := rejected + 1;
    elsif action = 'correct' then
      cash := row_plan->'transaction';
      if jsonb_typeof(cash) is distinct from 'object' then raise exception using errcode = '22023', message = 'Correction requires a cash row'; end if;
      if (select count(*) from jsonb_object_keys(cash)) <> 6
        or exists (select 1 from jsonb_object_keys(cash) k where k not in ('date','description','direction','amountMinor','currency','reference'))
        or cash->>'currency' is distinct from 'PKR'
        or jsonb_typeof(cash->'amountMinor') is distinct from 'string' or (cash->>'amountMinor') !~ '^(0|[1-9][0-9]{0,18})$'
        or jsonb_typeof(cash->'date') is distinct from 'string' or (cash->>'date') !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$'
        or cash->>'direction' is null or cash->>'direction' not in ('in','out')
        or jsonb_typeof(cash->'description') is distinct from 'string' or length(cash->>'description') not between 1 and 2000
        or (cash->>'description') !~ '[^[:space:]]'
        or (cash->'reference' <> 'null'::jsonb and (jsonb_typeof(cash->'reference') is distinct from 'string' or length(cash->>'reference') > 500)) then
        raise exception using errcode = '22023', message = 'Invalid cash correction';
      end if;
      insert into public.transactions(workspace_id,source_id,source_row,original_values,date,original_description,description,direction,amount_minor,currency,reference)
        values (batch.workspace_id,batch.source_id,row_number,original_row->'original',(cash->>'date')::date,
          coalesce(original_row->'original'->>description_index,''),cash->>'description',cash->>'direction',(cash->>'amountMinor')::bigint,'PKR',cash->>'reference')
        returning id into inserted_id;
      transaction_ids := transaction_ids || jsonb_build_array(inserted_id); corrected := corrected + 1;
    else raise exception using errcode = '22023', message = 'Correction or rejection required'; end if;
    insert into public.review_decisions(workspace_id,actor_subject,target_id,target_kind,source_row,action,previous_value,current_value)
      values (batch.workspace_id,subject,batch.source_id,'import_row',row_number,action,original_row,
        case when action = 'reject' then null else jsonb_build_object('transactionId',inserted_id,'transaction',cash) end);
  end loop;
  if (select count(*) from public.transactions t where t.workspace_id = batch.workspace_id) > 50000 then
    raise exception using errcode = 'P0001', message = 'Workspace transaction limit';
  end if;
  state := public.read_import_resolution_state(p_import_id);
  receipt := jsonb_build_object('importId',p_import_id,'requestId',p_request_id,'correctedCount',corrected,
    'rejectedCount',rejected,'remainingUnresolvedCount',(state->>'unresolvedCount')::integer,'transactionIds',transaction_ids);
  insert into public.import_resolution_requests(import_id,workspace_id,request_id,actor_subject,rows,receipt)
    values (p_import_id,batch.workspace_id,p_request_id,subject,p_rows,receipt);
  return receipt || '{"duplicate":false}'::jsonb;
end;
$$;

create or replace function public.read_cashbook_snapshot(p_workspace_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'records',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from (
      select * from public.cashbook_records where workspace_id = p_workspace_id order by id limit 50001
    ) c),'[]'::jsonb),
    'unresolvedImportRowCount',(
      select count(*) from public.imports i cross join lateral jsonb_array_elements(
        case when i.status = 'pending' then i.preview->'rows' else i.confirmation_plan end
      ) r where i.workspace_id = p_workspace_id and (
        (i.status = 'pending' and r->'transaction' = 'null'::jsonb)
        or (i.status = 'confirmed' and r->>'action' = 'unresolved' and not exists (
          select 1 from public.review_decisions d where d.target_id = i.source_id and d.source_row = (r->>'rowNumber')::integer
        ))
      )
    )
  );
$$;

commit;
