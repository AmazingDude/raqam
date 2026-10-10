-- Apply after migrations 001 and 002. Descriptions/categories only; no new cash.
begin;
alter table public.transactions add column review_version integer not null default 0 check (review_version >= 0);
create table public.transaction_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  transaction_id uuid not null references public.transactions(id),
  actor_subject text not null,
  previous_value jsonb not null,
  current_value jsonb not null,
  version integer not null check (version > 0),
  created_at timestamptz not null default now(),
  unique (transaction_id, version)
);
alter table public.transaction_reviews enable row level security;
alter table public.transaction_reviews force row level security;
create policy transaction_review_owner on public.transaction_reviews for select to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_subject = (select auth.jwt()->>'sub')));
revoke all on public.transaction_reviews from public, anon, authenticated;
grant select on public.transaction_reviews to authenticated;
-- Remove the bootstrap deletion grant; reviewed cash/history must survive reruns.
revoke delete on public.transactions from authenticated;

create or replace view public.cashbook_records with (security_invoker = true) as
  select id, workspace_id, source_id, source_row, date, original_description,
    description, direction, amount_minor::text as amount_minor, currency,
    reference, category, category_status, review_version
  from public.transactions;

-- Explicit owner check is required because this function owns privileged writes.
create function public.review_cashbook_transaction(p_transaction_id uuid, p_expected_version integer, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  saved public.transactions%rowtype; before_value jsonb; after_value jsonb;
  subject text := (select auth.jwt()->>'sub'); new_description text; new_category text; new_status text;
begin
  select t.* into saved from public.transactions t join public.workspaces w on w.id = t.workspace_id
    where t.id = p_transaction_id and w.owner_subject = subject and coalesce(subject,'') <> '' for update of t;
  if not found then raise exception using errcode = 'P0002', message = 'Transaction not found'; end if;
  if p_expected_version is null or p_expected_version <> saved.review_version then
    raise exception using errcode = '40001', message = 'Review version changed';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Invalid review';
  end if;
  if p_patch = '{}'::jsonb or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('description','category')) then
    raise exception using errcode = '22023', message = 'Review fields only';
  end if;
  new_description := saved.description; new_category := saved.category; new_status := saved.category_status;
  if p_patch ? 'description' then
    if jsonb_typeof(p_patch->'description') is distinct from 'string' or length(p_patch->>'description') not between 1 and 2000
      or (p_patch->>'description') !~ '[^[:space:]]' then
      raise exception using errcode = '22023', message = 'Invalid description';
    end if;
    new_description := p_patch->>'description';
  end if;
  if p_patch ? 'category' then
    if p_patch->'category' = 'null'::jsonb then new_category := null; new_status := 'needs_review';
    elsif jsonb_typeof(p_patch->'category') = 'string' and p_patch->>'category' in (
      'customer_receipts','software_services','premises_utilities','travel',
      'other_operating_cash_activity','transfers_owner_movements','uncategorized') then
      new_category := p_patch->>'category'; new_status := 'accepted';
    else raise exception using errcode = '22023', message = 'Invalid category'; end if;
  end if;
  before_value := jsonb_build_object('description',saved.description,'category',saved.category,'categoryStatus',saved.category_status);
  after_value := jsonb_build_object('description',new_description,'category',new_category,'categoryStatus',new_status);
  if before_value is distinct from after_value then
    update public.transactions set description = new_description, category = new_category, category_status = new_status,
      review_version = review_version + 1 where id = saved.id returning * into saved;
    insert into public.transaction_reviews(workspace_id,transaction_id,actor_subject,previous_value,current_value,version)
      values (saved.workspace_id,saved.id,subject,before_value,after_value,saved.review_version);
  end if;
  return jsonb_build_object('transaction',(select to_jsonb(c) from public.cashbook_records c where c.id = saved.id),
    'reviewVersion',saved.review_version);
end;
$$;

-- One statement snapshot avoids partial totals and mixes neither pages nor instants.
-- Invoker preserves ordinary RLS; only scoped visible rows enter the JSON result.
create function public.read_cashbook_snapshot(p_workspace_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'records', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from (
      select * from public.cashbook_records where workspace_id = p_workspace_id order by id limit 51
    ) c), '[]'::jsonb),
    'unresolvedImportRowCount', (
      select count(*) from public.imports i cross join lateral jsonb_array_elements(
        case when i.status = 'pending' then i.preview->'rows' else i.confirmation_plan end
      ) r where i.workspace_id = p_workspace_id and (
        (i.status = 'pending' and r->'transaction' = 'null'::jsonb)
        or (i.status = 'confirmed' and r->>'action' = 'unresolved')
      )
    )
  );
$$;
revoke all on function public.review_cashbook_transaction(uuid,integer,jsonb), public.read_cashbook_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.review_cashbook_transaction(uuid,integer,jsonb), public.read_cashbook_snapshot(uuid) to authenticated;
commit;
