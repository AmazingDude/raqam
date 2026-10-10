-- RQ-04 backend preparation. Apply AFTER the workspace spine; live gate remains open.
begin;

-- Corrections may repair a blank/long description; original text must remain intact.
alter table public.transactions drop constraint transactions_original_description_check;
alter table public.transactions add constraint transactions_original_description_check
  check (length(original_description) <= 1048576);

create table public.imports (
  source_id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  source_type text not null default 'transaction_csv' check (source_type = 'transaction_csv'),
  preview jsonb not null check (jsonb_typeof(preview) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  confirmation_result jsonb,
  confirmation_plan jsonb,
  confirmed_at timestamptz,
  check ((status = 'confirmed') = (confirmation_result is not null and confirmation_plan is not null and confirmed_at is not null)),
  foreign key (source_id, workspace_id, source_type) references public.sources(id, workspace_id, source_type)
);
create table public.review_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  actor_subject text not null,
  target_id uuid not null references public.sources(id),
  target_kind text not null check (target_kind = 'import_row'),
  source_row integer not null check (source_row >= 2),
  action text not null check (action in ('accept', 'correct', 'reject')),
  previous_value jsonb not null,
  current_value jsonb,
  created_at timestamptz not null default now(),
  unique (target_id, source_row)
);
alter table public.imports enable row level security;
alter table public.imports force row level security;
alter table public.review_decisions enable row level security;
alter table public.review_decisions force row level security;
create policy import_owner on public.imports to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_subject = (select auth.jwt()->>'sub')))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_subject = (select auth.jwt()->>'sub')));
create policy decision_owner on public.review_decisions for select to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_subject = (select auth.jwt()->>'sub')));
revoke all on public.imports, public.review_decisions from public, anon, authenticated;
grant select on public.imports to authenticated;
grant insert (source_id,workspace_id,preview) on public.imports to authenticated;
grant select on public.review_decisions to authenticated;
-- Cash creation now goes through audited confirmation; direct inserts would
-- bypass the workspace cap and omit decision history.
revoke insert on public.transactions from authenticated;

-- Invoker function retains RLS. A repeat registers the same source/batch, not new cash.
create function public.register_csv_import(p_workspace_id uuid, p_hash text, p_name text, p_preview jsonb)
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
  if jsonb_array_length(p_preview->'rows') not between 1 and 50 then
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

-- Only this function can write confirmation/history. Definer privilege is needed
-- because ordinary callers have no UPDATE/history INSERT grant. Ownership is
-- explicitly checked before any privileged reads/writes; all names are qualified.
create function public.confirm_csv_import(p_import_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  batch public.imports%rowtype; subject text := (select auth.jwt()->>'sub');
  row_plan jsonb; original_row jsonb; cash jsonb; action text; row_number integer;
  imported integer := 0; rejected integer := 0; unresolved integer := 0;
  inserted_id uuid; description_index integer; receipt jsonb;
begin
  select i.* into batch from public.imports i join public.workspaces w on w.id = i.workspace_id
    where i.source_id = p_import_id and w.owner_subject = subject and coalesce(subject,'') <> ''
    for update of i, w;
  if not found then raise exception using errcode = 'P0002', message = 'Import not found'; end if;
  if batch.status = 'confirmed' then return batch.confirmation_result || '{"duplicate":true}'::jsonb; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Invalid confirmation rows';
  end if;
  if jsonb_array_length(p_rows) <> jsonb_array_length(batch.preview->'rows') or jsonb_array_length(p_rows) not between 1 and 50
    or (select count(distinct r->>'rowNumber') from jsonb_array_elements(p_rows) r) <> jsonb_array_length(p_rows) then
    raise exception using errcode = '22023', message = 'Every row needs exactly one outcome';
  end if;
  select (ordinality - 1)::integer into description_index
    from jsonb_array_elements_text(batch.preview->'header') with ordinality as h(name,ordinality) where name = 'description';
  if description_index is null then raise exception using errcode = '22023', message = 'Missing description column'; end if;
  for row_plan in select value from jsonb_array_elements(p_rows) loop
    row_number := (row_plan->>'rowNumber')::integer; action := row_plan->>'action';
    select r into original_row from jsonb_array_elements(batch.preview->'rows') r where (r->>'rowNumber')::integer = row_number;
    if not found or action is null or action not in ('import','correct','reject','unresolved') then
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
  -- Initial prototype guard, serialized on the owner workspace to cover concurrent imports.
  if (select count(*) from public.transactions t where t.workspace_id = batch.workspace_id) > 50 then
    raise exception using errcode = 'P0001', message = 'Workspace transaction limit';
  end if;
  receipt := jsonb_build_object('importId',batch.source_id,'importedCount',imported,'rejectedCount',rejected,'unresolvedCount',unresolved);
  update public.imports set status = 'confirmed',confirmation_result = receipt,confirmation_plan = p_rows,confirmed_at = now()
    where source_id = batch.source_id;
  return receipt || '{"duplicate":false}'::jsonb;
end;
$$;
revoke all on function public.register_csv_import(uuid,text,text,jsonb), public.confirm_csv_import(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.register_csv_import(uuid,text,text,jsonb), public.confirm_csv_import(uuid,jsonb) to authenticated;
commit;
