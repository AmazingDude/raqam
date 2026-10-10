-- Resolve only confirmed unresolved rows. Preserve original preview/confirmation.
begin;
alter table public.imports add constraint imports_source_workspace_key unique (source_id, workspace_id);
create table public.import_resolution_requests (
  import_id uuid not null,
  workspace_id uuid not null references public.workspaces(id),
  request_id uuid not null,
  actor_subject text not null,
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object'),
  created_at timestamptz not null default now(),
  primary key (import_id, request_id),
  foreign key (import_id, workspace_id) references public.imports(source_id, workspace_id)
);
alter table public.import_resolution_requests enable row level security;
alter table public.import_resolution_requests force row level security;
create policy import_resolution_owner on public.import_resolution_requests for select to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_subject = (select auth.jwt()->>'sub')));
revoke all on public.import_resolution_requests from public, anon, authenticated;
grant select on public.import_resolution_requests to authenticated;

-- One read snapshot, with the existing immutable row decisions as final outcomes.
create function public.read_import_resolution_state(p_import_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with outcomes as (
    select (r->>'rowNumber')::integer as row_number,
      case when d.action = 'reject' then 'rejected'
        when d.action in ('accept','correct') then 'imported' else 'unresolved' end as outcome,
      d.current_value->>'transactionId' as transaction_id
    from public.imports i cross join lateral jsonb_array_elements(i.confirmation_plan) r
    left join public.review_decisions d on d.target_id = i.source_id and d.source_row = (r->>'rowNumber')::integer
    where i.source_id = p_import_id and i.status = 'confirmed'
  )
  select case when count(*) = 0 then null else jsonb_build_object(
    'importId',p_import_id,
    'rows',jsonb_agg(jsonb_build_object('rowNumber',row_number,'outcome',outcome,'transactionId',transaction_id) order by row_number),
    'importedCount',count(*) filter (where outcome = 'imported'),
    'rejectedCount',count(*) filter (where outcome = 'rejected'),
    'unresolvedCount',count(*) filter (where outcome = 'unresolved')
  ) end from outcomes;
$$;

-- Definer owns privileged writes; verified session ownership precedes every write
-- and retry lookup. Workspace locking serializes the existing 50-record cap.
create function public.resolve_csv_import_rows(p_import_id uuid, p_request_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  batch public.imports%rowtype; saved_request public.import_resolution_requests%rowtype;
  subject text := (select auth.jwt()->>'sub'); row_plan jsonb; original_row jsonb; original_plan jsonb;
  cash jsonb; action text; row_number integer; description_index integer; inserted_id uuid;
  corrected integer := 0; rejected integer := 0; transaction_ids jsonb := '[]'::jsonb; receipt jsonb; state jsonb;
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
  if jsonb_array_length(p_rows) not between 1 and 50 then raise exception using errcode = '22023', message = 'Invalid row count'; end if;
  if (select count(distinct r->>'rowNumber') from jsonb_array_elements(p_rows) r) <> jsonb_array_length(p_rows) then
    raise exception using errcode = '22023', message = 'Each row needs one decision';
  end if;
  select (ordinality - 1)::integer into description_index
    from jsonb_array_elements_text(batch.preview->'header') with ordinality as h(name,ordinality) where name = 'description';
  if description_index is null then raise exception using errcode = '22023', message = 'Missing original description'; end if;
  for row_plan in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(row_plan) is distinct from 'object' then raise exception using errcode = '22023', message = 'Invalid row decision'; end if;
    if exists (select 1 from jsonb_object_keys(row_plan) k where k not in ('rowNumber','action','transaction'))
      or jsonb_typeof(row_plan->'rowNumber') is distinct from 'number'
      or (row_plan->>'rowNumber') !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'Invalid decision fields';
    end if;
    row_number := (row_plan->>'rowNumber')::integer; action := row_plan->>'action';
    select r into original_plan from jsonb_array_elements(batch.confirmation_plan) r where (r->>'rowNumber')::integer = row_number;
    if not found then raise exception using errcode = '22023', message = 'Row outside import'; end if;
    if original_plan->>'action' <> 'unresolved' or exists (
      select 1 from public.review_decisions d where d.target_id = p_import_id and d.source_row = row_number
    ) then raise exception using errcode = 'PT409', message = 'Row already reviewed'; end if;
    select r into original_row from jsonb_array_elements(batch.preview->'rows') r where (r->>'rowNumber')::integer = row_number;
    if not found then raise exception using errcode = '22023', message = 'Original row missing'; end if;
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
  if (select count(*) from public.transactions t where t.workspace_id = batch.workspace_id) > 50 then
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

-- Initial confirmation receipts/plans stay immutable. Resolution history updates
-- the current unresolved count, without ever counting supporting images as cash.
create or replace function public.read_cashbook_snapshot(p_workspace_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'records',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from (
      select * from public.cashbook_records where workspace_id = p_workspace_id order by id limit 51
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
revoke all on function public.read_import_resolution_state(uuid), public.resolve_csv_import_rows(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.read_import_resolution_state(uuid), public.resolve_csv_import_rows(uuid,uuid,jsonb) to authenticated;
commit;

