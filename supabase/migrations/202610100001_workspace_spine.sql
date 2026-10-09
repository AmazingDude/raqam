-- RQ-01 schema spine. Run only in a new Raqam Supabase project after review.
-- Supabase supplies auth.jwt(), storage tables and roles. No service-role app access.
begin;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_subject text not null unique check (length(owner_subject) > 0),
  business_name text not null check (length(trim(business_name)) between 1 and 200),
  currency text not null default 'PKR' check (currency = 'PKR'),
  created_at timestamptz not null default now()
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  source_type text not null check (source_type in ('transaction_csv', 'receipt_image')),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  storage_path text not null,
  original_name text not null check (length(original_name) between 1 and 255),
  status text not null default 'pending' check (status in ('pending', 'complete', 'failed')),
  created_at timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = workspace_id::text and split_part(storage_path, '/', 2) <> ''),
  unique (workspace_id, source_type, content_hash),
  unique (id, workspace_id, source_type)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  source_id uuid not null,
  source_type text not null default 'transaction_csv' check (source_type = 'transaction_csv'),
  source_row integer not null check (source_row >= 2),
  original_values jsonb not null check (jsonb_typeof(original_values) = 'array'),
  date date not null check (date between '1000-01-01'::date and '9999-12-31'::date),
  original_description text not null check (length(trim(original_description)) between 1 and 2000),
  description text not null check (length(trim(description)) between 1 and 2000),
  direction text not null check (direction in ('in', 'out')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'PKR' check (currency = 'PKR'),
  reference text check (length(reference) <= 500),
  category text check (category in ('customer_receipts', 'software_services', 'premises_utilities', 'travel', 'other_operating_cash_activity', 'transfers_owner_movements', 'uncategorized')),
  category_status text not null default 'needs_review' check (category_status in ('proposed', 'accepted', 'rejected', 'needs_review')),
  check ((category_status = 'accepted') = (category is not null)),
  created_at timestamptz not null default now(),
  foreign key (source_id, workspace_id, source_type) references public.sources(id, workspace_id, source_type),
  unique (source_id, source_row)
);

alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
alter table public.sources enable row level security;
alter table public.sources force row level security;
alter table public.transactions enable row level security;
alter table public.transactions force row level security;

create policy workspace_owner on public.workspaces to authenticated
  using (owner_subject = (select auth.jwt()->>'sub'))
  with check (owner_subject = (select auth.jwt()->>'sub'));

create policy source_owner on public.sources to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_subject = (select auth.jwt()->>'sub')))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_subject = (select auth.jwt()->>'sub')));

create policy transaction_owner on public.transactions to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_subject = (select auth.jwt()->>'sub')))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_subject = (select auth.jwt()->>'sub')));

revoke all on public.workspaces, public.sources, public.transactions from public, anon, authenticated;
grant select, insert, delete on public.workspaces, public.sources, public.transactions to authenticated;
grant update (business_name) on public.workspaces to authenticated;
grant update (status) on public.sources to authenticated;
-- Transaction corrections/approvals will be added through audited review functions.
-- No unrestricted UPDATE grant, ownership reassignment or original-value overwrite.

-- PostgREST JSON bigint numbers would lose precision in JavaScript. Query this
-- invoker view, which applies the underlying user's RLS and casts money to text.
create view public.cashbook_records with (security_invoker = true) as
  select id, workspace_id, source_id, source_row, date, original_description,
    description, direction, amount_minor::text as amount_minor, currency,
    reference, category, category_status
  from public.transactions;
revoke all on public.cashbook_records from public, anon, authenticated;
grant select on public.cashbook_records to authenticated;

insert into storage.buckets (id, name, public) values ('raqam-sources', 'raqam-sources', false);
create policy raqam_private_sources on storage.objects to authenticated
  using (
    bucket_id = 'raqam-sources' and exists (
      select 1 from public.workspaces w
      where w.id::text = split_part(name, '/', 1) and w.owner_subject = (select auth.jwt()->>'sub')
    )
  )
  with check (
    bucket_id = 'raqam-sources' and exists (
      select 1 from public.workspaces w
      where w.id::text = split_part(name, '/', 1) and w.owner_subject = (select auth.jwt()->>'sub')
    )
  );

commit;
