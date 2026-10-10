-- Migration 011: Invoices, line items and RLS policies
begin;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_number text not null check (length(trim(invoice_number)) between 1 and 64),
  status text not null check (status in ('draft', 'sent', 'overdue', 'paid')) default 'draft',
  issue_date date not null default current_date,
  due_date date not null default (current_date + interval '14 days'),
  supply_date date,
  note text check (note is null or length(note) <= 2000),

  -- Sender
  from_name text not null default 'Business Name' check (length(trim(from_name)) between 1 and 200),
  from_address text check (from_address is null or length(from_address) <= 1000),
  from_contact text check (from_contact is null or length(from_contact) <= 500),
  from_tax_id text check (from_tax_id is null or length(from_tax_id) <= 100),

  -- Recipient
  client_name text not null default 'Client Name' check (length(trim(client_name)) between 1 and 200),
  client_email text check (client_email is null or length(client_email) <= 255),
  client_address text check (client_address is null or length(client_address) <= 1000),
  client_contact text check (client_contact is null or length(client_contact) <= 500),
  client_tax_id text check (client_tax_id is null or length(client_tax_id) <= 100),

  -- Currency & integer minor units
  currency text not null default 'USD' check (length(currency) between 3 and 4),
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  shipping_minor bigint not null default 0 check (shipping_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),

  -- Additional fields
  payment_link text check (payment_link is null or length(payment_link) <= 2000),
  payment_details text check (payment_details is null or length(payment_details) <= 2000),
  signature_url text check (signature_url is null or length(signature_url) <= 2000),
  logo_url text check (logo_url is null or length(logo_url) <= 2000),
  reminders_enabled boolean not null default false,
  views_count integer not null default 0 check (views_count >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (workspace_id, invoice_number)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  description text not null check (length(trim(description)) between 1 and 1000),
  quantity numeric(12, 2) not null default 1.00 check (quantity >= 0),
  rate_minor bigint not null default 0 check (rate_minor >= 0),
  amount_minor bigint not null default 0 check (amount_minor >= 0),
  created_at timestamptz not null default now()
);

create index invoices_workspace_status_idx on public.invoices(workspace_id, status);
create index invoices_workspace_date_idx on public.invoices(workspace_id, issue_date desc);
create index invoice_items_invoice_idx on public.invoice_items(invoice_id, position asc);

alter table public.invoices enable row level security;
alter table public.invoices force row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_items force row level security;

create policy invoice_owner on public.invoices to authenticated
  using (workspace_id in (select id from public.workspaces where owner_subject = (select auth.jwt()->>'sub')))
  with check (workspace_id in (select id from public.workspaces where owner_subject = (select auth.jwt()->>'sub')));

create policy invoice_items_owner on public.invoice_items to authenticated
  using (workspace_id in (select id from public.workspaces where owner_subject = (select auth.jwt()->>'sub')))
  with check (workspace_id in (select id from public.workspaces where owner_subject = (select auth.jwt()->>'sub')));

commit;
