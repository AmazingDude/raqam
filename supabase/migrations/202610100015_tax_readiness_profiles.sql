-- Private, explicitly confirmed tax-readiness profile. This stores self-reported
-- categories only; it does not calculate liability or prepare/file a return.
create or replace function public.tax_readiness_array_valid(
  p_value jsonb, p_allowed text[], p_min integer, p_max integer
) returns boolean language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(p_value) is distinct from 'array' then false
    when jsonb_array_length(p_value) < p_min or jsonb_array_length(p_value) > p_max then false
    else (
      select count(*) = count(distinct entry.value)
        and coalesce(bool_and(entry.value = any(p_allowed)), false)
      from jsonb_array_elements_text(p_value) as entry(value)
    )
  end
$$;

create or replace function public.tax_readiness_answers_valid(p_answers jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_answers) is distinct from 'object'
    or not (p_answers ?& array[
      'taxpayerType','residency','provinceOrTerritory','filingHistory',
      'incomeSources','recordsOnHand','wealthRecords'
    ])
    or p_answers - array[
      'taxpayerType','residency','provinceOrTerritory','filingHistory',
      'incomeSources','recordsOnHand','wealthRecords'
    ] <> '{}'::jsonb then
    return false;
  end if;
  if not coalesce(p_answers->>'taxpayerType' = any(array['individual','association_of_persons','company','not_sure']), false)
    or not coalesce(p_answers->>'residency' = any(array['resident','non_resident','not_sure']), false)
    or not coalesce(p_answers->>'provinceOrTerritory' = any(array[
      'punjab','sindh','khyber_pakhtunkhwa','balochistan','islamabad_capital_territory',
      'gilgit_baltistan','azad_jammu_kashmir','outside_pakistan','not_sure'
    ]), false)
    or not coalesce(p_answers->>'filingHistory' = any(array['filed_before','first_time','not_sure']), false) then
    return false;
  end if;
  if not public.tax_readiness_array_valid(p_answers->'incomeSources', array[
      'salary','business_or_freelance','rent','bank_profit','dividends_or_investments',
      'capital_gains','foreign_income','other','none','not_sure'
    ], 1, 10)
    or not public.tax_readiness_array_valid(p_answers->'recordsOnHand', array[
      'salary_certificate','business_income_expense_records','rental_records','bank_profit_certificate',
      'investment_statements','foreign_income_tax_records','prior_year_return','withholding_certificates',
      'other','not_collected_yet','not_sure'
    ], 1, 11)
    or not public.tax_readiness_array_valid(p_answers->'wealthRecords', array[
      'bank_cash_balances','property_vehicle_records','investment_balances','loans_liabilities',
      'major_personal_expenses','asset_transfers_gifts','not_applicable','not_collected_yet','not_sure'
    ], 1, 9) then
    return false;
  end if;
  if p_answers->'incomeSources' ?| array['none','not_sure'] and jsonb_array_length(p_answers->'incomeSources') <> 1 then
    return false;
  end if;
  if p_answers->'wealthRecords' ?| array['not_applicable','not_collected_yet','not_sure'] and jsonb_array_length(p_answers->'wealthRecords') <> 1 then
    return false;
  end if;
  if p_answers->'recordsOnHand' ?| array['not_collected_yet','not_sure'] and jsonb_array_length(p_answers->'recordsOnHand') <> 1 then
    return false;
  end if;
  return true;
end
$$;

create table public.tax_readiness_profiles (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tax_year integer not null check (tax_year between 2000 and 2200),
  answers jsonb not null check (public.tax_readiness_answers_valid(answers)),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, tax_year)
);
alter table public.tax_readiness_profiles enable row level security;
alter table public.tax_readiness_profiles force row level security;
create policy tax_readiness_profiles_owner_read on public.tax_readiness_profiles
  for select to authenticated using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_subject = (select auth.jwt()->>'sub'))
  );
revoke all on public.tax_readiness_profiles from public, anon, authenticated;
grant select on public.tax_readiness_profiles to authenticated;

create function public.save_tax_readiness_profile(p_tax_year integer, p_answers jsonb, p_confirmed boolean, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  subject text := (select auth.jwt()->>'sub');
  workspace uuid;
  local_today date := (clock_timestamp() at time zone 'Asia/Karachi')::date;
  expected_tax_year integer;
  saved jsonb;
  current_version integer;
begin
  if coalesce(subject, '') = '' then raise exception 'authenticated subject required' using errcode = '42501'; end if;
  if p_confirmed is distinct from true then raise exception 'explicit confirmation required' using errcode = '22023'; end if;
  expected_tax_year := extract(year from local_today)::integer + case when extract(month from local_today)::integer >= 7 then 1 else 0 end;
  if p_tax_year is distinct from expected_tax_year then raise exception 'current normal tax year required' using errcode = '22023'; end if;
  if not public.tax_readiness_answers_valid(p_answers) then raise exception 'invalid profile answers' using errcode = '22023'; end if;

  select w.id into workspace from public.workspaces w where w.owner_subject = subject for update;
  if workspace is null then raise exception 'workspace not found' using errcode = 'P0002'; end if;

  if p_expected_version is null or p_expected_version < 0 or p_expected_version > 2147483646 then
    raise exception 'invalid expected profile version' using errcode = '22023';
  end if;
  select version into current_version from public.tax_readiness_profiles where workspace_id = workspace and tax_year = p_tax_year;
  if coalesce(current_version, 0) <> p_expected_version then
    raise exception 'profile changed; reload before saving' using errcode = 'PT409';
  end if;

  insert into public.tax_readiness_profiles as stored(workspace_id, tax_year, answers, version, updated_at)
    values (workspace, p_tax_year, p_answers, 1, clock_timestamp())
    on conflict (workspace_id, tax_year) do update set
      answers = excluded.answers,
      version = stored.version + 1,
      updated_at = clock_timestamp()
    returning jsonb_build_object(
      'workspace_id', stored.workspace_id, 'tax_year', stored.tax_year,
      'answers', stored.answers, 'version', stored.version, 'updated_at', stored.updated_at
    ) into saved;
  return jsonb_build_object('profile', saved);
end
$$;
revoke all on function public.tax_readiness_array_valid(jsonb, text[], integer, integer) from public, anon, authenticated;
revoke all on function public.tax_readiness_answers_valid(jsonb) from public, anon, authenticated;
revoke all on function public.save_tax_readiness_profile(integer, jsonb, boolean, integer) from public, anon;
grant execute on function public.tax_readiness_array_valid(jsonb, text[], integer, integer) to authenticated;
grant execute on function public.tax_readiness_answers_valid(jsonb) to authenticated;
grant execute on function public.save_tax_readiness_profile(integer, jsonb, boolean, integer) to authenticated;