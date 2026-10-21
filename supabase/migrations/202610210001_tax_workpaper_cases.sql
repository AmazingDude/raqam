-- Initial owner-scoped, year-specific tax workpaper facts.
-- This is draft setup only; no tax calculation, practitioner approval or filing.
begin;

create or replace function public.tax_workpaper_facts_valid(p_facts jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_facts) is distinct from 'object'
    or not (p_facts ?& array['taxpayerType','residency','incomeSources'])
    or p_facts - array['taxpayerType','residency','incomeSources'] <> '{}'::jsonb then
    return false;
  end if;
  if not coalesce(p_facts->>'taxpayerType' = any(array['individual','association_of_persons','company','not_sure']), false)
    or not coalesce(p_facts->>'residency' = any(array['resident','non_resident','not_sure']), false)
    or jsonb_typeof(p_facts->'incomeSources') is distinct from 'array'
    or jsonb_array_length(p_facts->'incomeSources') < 1
    or jsonb_array_length(p_facts->'incomeSources') > 10 then
    return false;
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_facts->'incomeSources') as source(value)
    where source.value <> all(array['salary','business_or_freelance','rent','bank_profit','dividends_or_investments','capital_gains','foreign_income','other','none','not_sure'])
  ) or (select count(*) <> count(distinct source.value) from jsonb_array_elements_text(p_facts->'incomeSources') as source(value)) then
    return false;
  end if;
  if p_facts->'incomeSources' ?| array['none','not_sure'] and jsonb_array_length(p_facts->'incomeSources') <> 1 then
    return false;
  end if;
  return true;
end
$$;

create table if not exists public.tax_workpaper_cases (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tax_year integer not null check (tax_year between 2000 and 2200),
  facts jsonb not null check (public.tax_workpaper_facts_valid(facts)),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (id),
  unique (workspace_id, tax_year)
);

create index if not exists tax_workpaper_cases_workspace_year_idx
  on public.tax_workpaper_cases (workspace_id, tax_year desc);

alter table public.tax_workpaper_cases enable row level security;
alter table public.tax_workpaper_cases force row level security;
drop policy if exists tax_workpaper_cases_owner_read on public.tax_workpaper_cases;
create policy tax_workpaper_cases_owner_read on public.tax_workpaper_cases
  for select to authenticated using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_subject = (select auth.jwt()->>'sub'))
  );
revoke all on public.tax_workpaper_cases from public, anon, authenticated;
grant select on public.tax_workpaper_cases to authenticated;

create table if not exists public.tax_workpaper_case_saves (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  tax_year integer not null check (tax_year between 2000 and 2200),
  request_payload jsonb not null,
  response jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (workspace_id, request_id)
);
alter table public.tax_workpaper_case_saves enable row level security;
alter table public.tax_workpaper_case_saves force row level security;
revoke all on public.tax_workpaper_case_saves from public, anon, authenticated;

create or replace function public.save_tax_workpaper_case(
  p_tax_year integer, p_facts jsonb, p_confirmed boolean, p_expected_version integer, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  subject text := (select auth.jwt()->>'sub');
  workspace uuid;
  existing_request public.tax_workpaper_case_saves%rowtype;
  current_version integer;
  saved_case jsonb;
  request_payload jsonb;
  response jsonb;
begin
  if coalesce(subject, '') = '' then raise exception 'authenticated subject required' using errcode = '42501'; end if;
  if p_confirmed is distinct from true then raise exception 'explicit confirmation required' using errcode = '22023'; end if;
  if p_tax_year is null or p_tax_year < 2000 or p_tax_year > 2200 then raise exception 'invalid tax year' using errcode = '22023'; end if;
  if p_expected_version is null or p_expected_version < 0 or p_expected_version > 2147483646 then raise exception 'invalid expected case version' using errcode = '22023'; end if;
  if p_request_id is null then raise exception 'request id required' using errcode = '22023'; end if;
  if not public.tax_workpaper_facts_valid(p_facts) then raise exception 'invalid taxpayer facts' using errcode = '22023'; end if;

  select w.id into workspace from public.workspaces w where w.owner_subject = subject for update;
  if workspace is null then raise exception 'workspace not found' using errcode = 'P0002'; end if;

  request_payload := jsonb_build_object('tax_year', p_tax_year, 'facts', p_facts, 'expected_version', p_expected_version);
  select * into existing_request from public.tax_workpaper_case_saves
    where workspace_id = workspace and request_id = p_request_id;
  if found then
    if existing_request.request_payload is distinct from request_payload then
      raise exception 'request id reused with different case input' using errcode = '22023';
    end if;
    return jsonb_build_object('case', existing_request.response, 'duplicate', true);
  end if;

  select version into current_version from public.tax_workpaper_cases
    where workspace_id = workspace and tax_year = p_tax_year;
  if coalesce(current_version, 0) <> p_expected_version then
    raise exception 'workpaper changed; reload before saving' using errcode = 'PT409';
  end if;

  insert into public.tax_workpaper_cases as stored(workspace_id, tax_year, facts, version, updated_at)
    values (workspace, p_tax_year, p_facts, 1, clock_timestamp())
    on conflict (workspace_id, tax_year) do update set
      facts = excluded.facts,
      version = stored.version + 1,
      updated_at = clock_timestamp()
    returning jsonb_build_object(
      'id', stored.id, 'workspace_id', stored.workspace_id, 'tax_year', stored.tax_year,
      'facts', stored.facts, 'version', stored.version, 'updated_at', stored.updated_at
    ) into saved_case;

  insert into public.tax_workpaper_case_saves(workspace_id, request_id, tax_year, request_payload, response)
    values (workspace, p_request_id, p_tax_year, request_payload, saved_case);
  return jsonb_build_object('case', saved_case, 'duplicate', false);
end
$$;

revoke all on function public.tax_workpaper_facts_valid(jsonb) from public, anon, authenticated;
revoke all on function public.save_tax_workpaper_case(integer, jsonb, boolean, integer, uuid) from public, anon;
grant execute on function public.tax_workpaper_facts_valid(jsonb) to authenticated;
grant execute on function public.save_tax_workpaper_case(integer, jsonb, boolean, integer, uuid) to authenticated;

commit;
