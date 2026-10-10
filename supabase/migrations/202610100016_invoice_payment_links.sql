-- Invoice recognition and exact full payment links. Apply only after confirming
-- hosted history for migrations 011-013; never replay a migration by filename.
begin;

create table public.invoice_ledger_postings (
  workspace_id uuid not null references public.workspaces(id),
  invoice_id uuid not null,
  request_id uuid not null,
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  journal_id uuid not null,
  service_date date not null,
  review_decision_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, invoice_id),
  unique (workspace_id, journal_id),
  unique (workspace_id, request_id),
  foreign key (invoice_id, workspace_id) references public.invoices(id, workspace_id) on delete restrict,
  foreign key (workspace_id, journal_id) references public.ledger_journals(workspace_id, id) on delete restrict
);

create table public.workspace_payments (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  request_id uuid not null,
  target_kind text not null check (target_kind in ('invoice','supplier_bill','expense_draft')),
  target_id uuid not null,
  transaction_id uuid not null,
  transaction_version integer not null check (transaction_version >= 0),
  cash_account_id uuid not null,
  journal_id uuid not null,
  date date not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency = 'PKR'),
  direction text not null check (direction in ('in','out')),
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, request_id),
  unique (workspace_id, target_kind, target_id),
  unique (workspace_id, transaction_id),
  unique (workspace_id, journal_id),
  foreign key (transaction_id, workspace_id) references public.transactions(id, workspace_id) on delete restrict,
  foreign key (workspace_id, cash_account_id) references public.ledger_accounts(workspace_id, id),
  foreign key (workspace_id, journal_id) references public.ledger_journals(workspace_id, id) on delete restrict
);
create table public.expense_ledger_postings (
  workspace_id uuid not null references public.workspaces(id), expense_id uuid not null, request_id uuid not null,
  request_payload jsonb not null check (jsonb_typeof(request_payload)='object'), journal_id uuid not null,
  incurred_on date not null, review_decision_id uuid not null, created_at timestamptz not null default now(),
  primary key(workspace_id,expense_id), unique(workspace_id,request_id), unique(workspace_id,journal_id),
  foreign key(workspace_id,expense_id) references public.expense_drafts(workspace_id,id) on delete restrict,
  foreign key(workspace_id,journal_id) references public.ledger_journals(workspace_id,id) on delete restrict
);

alter table public.invoice_ledger_postings enable row level security;
alter table public.invoice_ledger_postings force row level security;
alter table public.expense_ledger_postings enable row level security;
alter table public.expense_ledger_postings force row level security;
alter table public.workspace_payments enable row level security;
alter table public.workspace_payments force row level security;
create policy invoice_ledger_posting_owner on public.invoice_ledger_postings for select to authenticated using (
  workspace_id in (select id from public.workspaces where owner_subject=(select auth.jwt()->>'sub'))
);
create policy workspace_payment_owner on public.workspace_payments for select to authenticated using (
  workspace_id in (select id from public.workspaces where owner_subject=(select auth.jwt()->>'sub'))
);
create policy expense_ledger_posting_owner on public.expense_ledger_postings for select to authenticated using (
  workspace_id in (select id from public.workspaces where owner_subject=(select auth.jwt()->>'sub'))
);
revoke all on public.invoice_ledger_postings, public.expense_ledger_postings, public.workspace_payments from public, anon, authenticated;

create function public.prevent_recognized_invoice_mutation() returns trigger language plpgsql security definer set search_path='' as $$
declare v_invoice_id uuid; v_workspace_id uuid;
begin
  v_invoice_id := coalesce(old.id, new.id); v_workspace_id := coalesce(old.workspace_id, new.workspace_id);
  if exists(select 1 from public.invoice_ledger_postings p where p.invoice_id=v_invoice_id and p.workspace_id=v_workspace_id) then
    if tg_op='DELETE' then raise exception using errcode='PT409', message='Recognized invoice must be corrected by reversal and replacement'; end if;
    if (to_jsonb(new)-array['status','updated_at','review_version']) is distinct from
       (to_jsonb(old)-array['status','updated_at','review_version']) then
      raise exception using errcode='PT409', message='Recognized invoice must be corrected by reversal and replacement';
    end if;
  end if;
  if tg_op='INSERT' and new.status='paid' then
    raise exception using errcode='22023', message='Invoice payment needs a linked cash movement';
  end if;
  if tg_op='UPDATE' and new.status='paid' and old.status is distinct from 'paid'
    and not exists(select 1 from public.workspace_payments p where p.workspace_id=new.workspace_id and p.target_kind='invoice' and p.target_id=new.id) then
    raise exception using errcode='22023', message='Invoice payment needs a linked cash movement';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.prevent_recognized_invoice_mutation() from public, anon, authenticated;
drop trigger if exists recognized_invoice_header_guard on public.invoices;
create trigger recognized_invoice_header_guard before insert or update or delete on public.invoices
for each row execute function public.prevent_recognized_invoice_mutation();

create function public.prevent_recognized_invoice_item_mutation() returns trigger language plpgsql security definer set search_path='' as $$
declare v_invoice_id uuid; v_workspace_id uuid;
begin
  v_invoice_id := coalesce(old.invoice_id,new.invoice_id); v_workspace_id := coalesce(old.workspace_id,new.workspace_id);
  if exists(select 1 from public.invoice_ledger_postings p where p.invoice_id=v_invoice_id and p.workspace_id=v_workspace_id) then
    raise exception using errcode='PT409',message='Recognized invoice lines must be corrected by reversal and replacement';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.prevent_recognized_invoice_item_mutation() from public, anon, authenticated;
drop trigger if exists recognized_invoice_item_guard on public.invoice_items;
create trigger recognized_invoice_item_guard before insert or update or delete on public.invoice_items
for each row execute function public.prevent_recognized_invoice_item_mutation();

-- Enforce exact reversals at commit as a database invariant. The original 013
-- posting function checked only that every original account appeared in the
-- reversal, which still allowed extra balanced lines on unrelated accounts.
create function public.validate_ledger_entry_invariants() returns trigger language plpgsql security definer set search_path='' as $$
declare original public.ledger_journals%rowtype;
begin
  if new.cash_movement->>'kind'='bank_transaction' and not exists(
    select 1 from public.transactions t join public.imports i on i.source_id=t.source_id and i.workspace_id=t.workspace_id
    cross join lateral jsonb_array_elements(i.confirmation_plan) plan
    join public.review_decisions d on d.target_id=i.source_id and d.source_row=t.source_row
      and d.workspace_id=i.workspace_id and d.target_kind='import_row' and d.action in ('accept','correct')
    join public.sources s on s.id=i.source_id and s.workspace_id=i.workspace_id and s.status='complete'
    where t.id=(new.cash_movement->>'transactionId')::uuid and t.workspace_id=new.workspace_id and i.status='confirmed'
      and (plan->>'rowNumber')::integer=t.source_row and plan->>'action' in ('import','correct')
  ) then
    raise exception using errcode='22023',message='Cash postings require a confirmed and reviewed statement row';
  end if;
  if new.reversal_of_id is null then return new; end if;
  select * into original from public.ledger_journals
    where workspace_id=new.workspace_id and id=new.reversal_of_id for update;
  if not found or original.status<>'posted' or original.id=new.id or original.reversal_of_id is not null then
    raise exception using errcode='22023',message='A reversal must target an unreversed original posted journal';
  end if;
  if exists(
    select 1
    from (
      select account_id,sum(debit_minor) as debit_minor,sum(credit_minor) as credit_minor
      from public.ledger_journal_lines where workspace_id=new.workspace_id and journal_id=original.id group by account_id
    ) old_lines
    full join (
      select account_id,sum(debit_minor) as debit_minor,sum(credit_minor) as credit_minor
      from public.ledger_journal_lines where workspace_id=new.workspace_id and journal_id=new.id group by account_id
    ) reverse_lines using(account_id)
    where coalesce(old_lines.debit_minor,0)<>coalesce(reverse_lines.credit_minor,0)
      or coalesce(old_lines.credit_minor,0)<>coalesce(reverse_lines.debit_minor,0)
  ) then
    raise exception using errcode='22023',message='Reversal must exactly reverse original';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_ledger_entry_invariants() from public,anon,authenticated;
drop trigger if exists ledger_reversal_exact_balance on public.ledger_journals;
drop trigger if exists ledger_entry_invariants on public.ledger_journals;
create constraint trigger ledger_entry_invariants after insert on public.ledger_journals
  deferrable initially deferred for each row execute function public.validate_ledger_entry_invariants();

create function public.post_workspace_expense_accrual(p_workspace_id uuid,p_request_id uuid,p_expense_id uuid,p_expected_version integer,p_expense_account_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare subject text:=auth.jwt()->>'sub'; draft public.expense_drafts%rowtype; saved public.expense_ledger_postings%rowtype; request_payload jsonb;
  payable_id uuid; journal_id uuid:=gen_random_uuid(); line_debit uuid:=gen_random_uuid(); line_credit uuid:=gen_random_uuid(); payload jsonb; sources jsonb; posted jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace_id and owner_subject=subject and coalesce(subject,'')<>'' for update;
  if not found then raise exception using errcode='P0002',message='Workspace not found'; end if;
  if p_request_id is null or p_expense_id is null or p_expected_version is null or p_expense_account_id is null then raise exception using errcode='22023',message='Expense posting fields are required'; end if;
  request_payload:=jsonb_build_object('expenseId',p_expense_id,'expectedVersion',p_expected_version,'expenseAccountId',p_expense_account_id);
  select * into saved from public.expense_ledger_postings where workspace_id=p_workspace_id and expense_id=p_expense_id;
  if found then
    if saved.request_id=p_request_id and saved.request_payload=request_payload then
      return jsonb_build_object('posting',jsonb_build_object('workspaceId',saved.workspace_id,'expenseId',saved.expense_id,'journalId',saved.journal_id,
        'incurredOn',saved.incurred_on,'reviewDecisionId',saved.review_decision_id),'journal',public.ledger_journal_json(saved.journal_id,p_workspace_id),'duplicate',true);
    end if;
    raise exception using errcode='PT409',message='Expense accrual is already posted';
  end if;
  if exists(select 1 from public.expense_ledger_postings where workspace_id=p_workspace_id and request_id=p_request_id) then raise exception using errcode='PT409',message='Expense posting request ID was already used'; end if;
  select * into draft from public.expense_drafts where id=p_expense_id and workspace_id=p_workspace_id for update;
  if not found then raise exception using errcode='P0002',message='Expense not found'; end if;
  if draft.status<>'accepted' or draft.version<>p_expected_version or draft.amount_minor is null or draft.amount_minor<=0 or draft.currency<>'PKR' or draft.occurred_on is null or draft.review_request_id is null then
    raise exception using errcode='22023',message='Accept the complete expense note with a confirmed incurred date before posting'; end if;
  if not exists(select 1 from public.ledger_accounts where id=p_expense_account_id and workspace_id=p_workspace_id and active and ((type='expense' and role='expense') or (type='asset' and not is_cash_account and role not in ('receivable','unclassified_cash_clearing','opening_balance')))) then
    raise exception using errcode='22023',message='Choose an active reviewed expense or asset account'; end if;
  select id into payable_id from public.ledger_accounts where workspace_id=p_workspace_id and active and role='payable' order by code limit 1;
  if payable_id is null then raise exception using errcode='22023',message='No active payable account is available'; end if;
  payload:=jsonb_build_object('requestId',p_request_id,'expectedVersion',null,'id',journal_id,'entryDate',draft.occurred_on,
    'description','Recorded expense · '||coalesce(draft.description,'Expense note'),'currency','PKR','cashMovement',null,'reversalOfId',null,'reversalReason',null,
    'recognitionEvidence',jsonb_build_object('basis','expense_incurred','date',draft.occurred_on,'source',jsonb_build_object('kind','manual_note','noteId',p_expense_id,
      'locator',jsonb_build_object('kind','owner_decision','decisionId',draft.review_request_id,'field','expense_date')),'reviewDecisionId',draft.review_request_id),
    'lines',jsonb_build_array(jsonb_build_object('id',line_debit,'accountId',p_expense_account_id,'debitMinor',draft.amount_minor::text,'creditMinor','0','memo',null),
      jsonb_build_object('id',line_credit,'accountId',payable_id,'debitMinor','0','creditMinor',draft.amount_minor::text,'memo',null)));
  sources:=jsonb_build_array(jsonb_build_object('kind','manual_note','id',p_expense_id,'locator',jsonb_build_object('kind','owner_decision','decisionId',draft.review_request_id,'field','expense_date')));
  posted:=public.post_workspace_ledger_journal(p_workspace_id,payload,sources);
  insert into public.expense_ledger_postings(workspace_id,expense_id,request_id,request_payload,journal_id,incurred_on,review_decision_id)
    values(p_workspace_id,p_expense_id,p_request_id,request_payload,journal_id,draft.occurred_on,draft.review_request_id);
  return jsonb_build_object('posting',jsonb_build_object('workspaceId',p_workspace_id,'expenseId',p_expense_id,'journalId',journal_id,
    'incurredOn',draft.occurred_on,'reviewDecisionId',draft.review_request_id),'journal',posted->'journal','duplicate',false);
end;
$$;

create function public.read_workspace_payments(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=(select auth.jwt()->>'sub') and coalesce(auth.jwt()->>'sub','')<>'') then
    raise exception using errcode='P0002',message='Workspace not found';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'workspaceId',p.workspace_id,'requestId',p.request_id,'targetKind',p.target_kind,'targetId',p.target_id,
    'transactionId',p.transaction_id,'transactionVersion',p.transaction_version,'cashAccountId',p.cash_account_id,
    'journalId',p.journal_id,'date',p.date,'amountMinor',p.amount_minor::text,'currency',p.currency,'direction',p.direction,'createdAt',p.created_at
  ) order by p.date desc,p.id) from public.workspace_payments p where p.workspace_id=p_workspace_id),'[]'::jsonb);
end;
$$;

create function public.recognize_workspace_invoice(p_workspace_id uuid,p_request_id uuid,p_invoice_id uuid,p_expected_version integer,p_service_date date,p_revenue_account_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare subject text:=auth.jwt()->>'sub'; inv public.invoices%rowtype; workspace_currency text; receivable_id uuid; journal_id uuid:=gen_random_uuid();
  decision_id uuid:=gen_random_uuid(); line_debit uuid:=gen_random_uuid(); line_credit uuid:=gen_random_uuid(); payload jsonb; sources jsonb; posted jsonb; saved public.invoice_ledger_postings%rowtype; request_payload jsonb;
begin
  select currency into workspace_currency from public.workspaces where id=p_workspace_id and owner_subject=subject and coalesce(subject,'')<>'' for update;
  if not found then raise exception using errcode='P0002',message='Workspace not found'; end if;
  select * into inv from public.invoices where id=p_invoice_id and workspace_id=p_workspace_id for update;
  if not found then raise exception using errcode='P0002',message='Invoice not found'; end if;
  request_payload:=jsonb_build_object('invoiceId',p_invoice_id,'expectedVersion',p_expected_version,'serviceDate',p_service_date,'revenueAccountId',p_revenue_account_id);
  select * into saved from public.invoice_ledger_postings p where p.workspace_id=p_workspace_id and p.invoice_id=p_invoice_id;
  if found then
    if saved.request_id=p_request_id and saved.request_payload=request_payload then
      return jsonb_build_object('posting',jsonb_build_object('workspaceId',saved.workspace_id,'invoiceId',saved.invoice_id,'journalId',saved.journal_id,
        'serviceDate',saved.service_date,'reviewDecisionId',saved.review_decision_id),'journal',public.ledger_journal_json(saved.journal_id,p_workspace_id),'duplicate',true);
    end if;
    raise exception using errcode='PT409',message='Invoice revenue is already recognized';
  end if;
  if exists(select 1 from public.invoice_ledger_postings p where p.workspace_id=p_workspace_id and p.request_id=p_request_id) then
    raise exception using errcode='PT409',message='Recognition request ID was already used';
  end if;
  if p_expected_version is null or inv.review_version<>p_expected_version then raise exception using errcode='PT409',message='Invoice version changed'; end if;
  if p_request_id is null or p_service_date is null or p_service_date < inv.issue_date or inv.currency is distinct from workspace_currency or inv.total_minor<=0 or inv.status not in ('sent','overdue') then
    raise exception using errcode='22023',message='Invoice must be issued, positive, same-currency, and have a confirmed service date';
  end if;
  if inv.supply_date is not null and inv.supply_date<>p_service_date then raise exception using errcode='22023',message='Confirmed service date conflicts with saved invoice'; end if;
  if not exists(select 1 from public.ledger_accounts a where a.workspace_id=p_workspace_id and a.id=p_revenue_account_id and a.active and a.role='revenue' and a.type='revenue') then
    raise exception using errcode='22023',message='Select an active reviewed revenue account';
  end if;
  select id into receivable_id from public.ledger_accounts where workspace_id=p_workspace_id and active and role='receivable' order by code limit 1;
  if receivable_id is null then raise exception using errcode='22023',message='No active receivable account is available'; end if;
  update public.invoices set supply_date=p_service_date,review_version=review_version+1,updated_at=now() where id=p_invoice_id and workspace_id=p_workspace_id;
  payload:=jsonb_build_object('requestId',p_request_id,'expectedVersion',null,'id',journal_id,'entryDate',p_service_date,'description','Earned revenue · '||inv.invoice_number,
    'currency','PKR','recognitionEvidence',jsonb_build_object('basis','service_delivery','date',p_service_date,'source',jsonb_build_object('kind','invoice','invoiceId',p_invoice_id,'locator',jsonb_build_object('kind','owner_decision','decisionId',decision_id,'field','service_date')),'reviewDecisionId',decision_id),
    'cashMovement',null,'reversalOfId',null,'reversalReason',null,'lines',jsonb_build_array(
      jsonb_build_object('id',line_debit,'accountId',receivable_id,'debitMinor',inv.total_minor::text,'creditMinor','0','memo',null),
      jsonb_build_object('id',line_credit,'accountId',p_revenue_account_id,'debitMinor','0','creditMinor',inv.total_minor::text,'memo',null)));
  sources:=jsonb_build_array(jsonb_build_object('kind','invoice','id',p_invoice_id,'locator',jsonb_build_object('kind','owner_decision','decisionId',decision_id,'field','service_date')));
  posted:=public.post_workspace_ledger_journal(p_workspace_id,payload,sources);
  insert into public.invoice_ledger_postings(workspace_id,invoice_id,request_id,request_payload,journal_id,service_date,review_decision_id)
    values(p_workspace_id,p_invoice_id,p_request_id,request_payload,journal_id,p_service_date,decision_id);
  return jsonb_build_object('posting',jsonb_build_object('workspaceId',p_workspace_id,'invoiceId',p_invoice_id,'journalId',journal_id,'serviceDate',p_service_date,'reviewDecisionId',decision_id),'journal',posted->'journal','duplicate',false);
end;
$$;

create function public.link_workspace_payment(p_workspace_id uuid,p_request_id uuid,p_target_kind text,p_target_id uuid,p_expected_version integer,
  p_transaction_id uuid,p_expected_transaction_version integer,p_cash_account_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare subject text:=auth.jwt()->>'sub'; payload_key jsonb; saved public.workspace_payments%rowtype; tx public.transactions%rowtype;
  amount bigint; target_currency text; target_name text; target_status text; target_version integer; direction text; contra_id uuid; target_source_kind text;
  journal_id uuid:=gen_random_uuid(); payment_id uuid:=gen_random_uuid(); line_one uuid:=gen_random_uuid(); line_two uuid:=gen_random_uuid();
  journal_payload jsonb; sources jsonb; journal_result jsonb; payment_json jsonb; invoice_before jsonb; invoice_after jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace_id and owner_subject=subject and coalesce(subject,'')<>'' for update;
  if not found then raise exception using errcode='P0002',message='Workspace not found'; end if;
  if p_request_id is null or p_target_id is null or p_transaction_id is null or p_cash_account_id is null or p_expected_version is null or p_expected_transaction_version is null
    or p_target_kind not in ('invoice','supplier_bill','expense_draft') then raise exception using errcode='22023',message='Payment fields are required'; end if;
  payload_key:=jsonb_build_object('targetKind',p_target_kind,'targetId',p_target_id,'expectedVersion',p_expected_version,'transactionId',p_transaction_id,
    'expectedTransactionVersion',p_expected_transaction_version,'cashAccountId',p_cash_account_id);
  select * into saved from public.workspace_payments where workspace_id=p_workspace_id and request_id=p_request_id;
  if found then
    if saved.request_payload is distinct from payload_key then raise exception using errcode='PT409',message='Payment request ID was reused'; end if;
    return jsonb_build_object('payment',jsonb_build_object('id',saved.id,'workspaceId',saved.workspace_id,'requestId',saved.request_id,'targetKind',saved.target_kind,
      'targetId',saved.target_id,'transactionId',saved.transaction_id,'transactionVersion',saved.transaction_version,'cashAccountId',saved.cash_account_id,
      'journalId',saved.journal_id,'date',saved.date,'amountMinor',saved.amount_minor::text,'currency',saved.currency,'direction',saved.direction,'createdAt',saved.created_at),
      'journal',public.ledger_journal_json(saved.journal_id,p_workspace_id),'duplicate',true);
  end if;
  select * into tx from public.transactions where id=p_transaction_id and workspace_id=p_workspace_id for update;
  if not found or tx.source_type<>'transaction_csv' or not exists(
    select 1 from public.imports i
    cross join lateral jsonb_array_elements(i.confirmation_plan) plan
    join public.review_decisions d on d.target_id=i.source_id and d.source_row=tx.source_row
      and d.workspace_id=i.workspace_id and d.target_kind='import_row' and d.action in ('accept','correct')
    join public.sources s on s.id=i.source_id and s.workspace_id=i.workspace_id and s.status='complete'
    where i.source_id=tx.source_id and i.workspace_id=p_workspace_id and i.status='confirmed'
      and (plan->>'rowNumber')::integer=tx.source_row and plan->>'action' in ('import','correct')
  ) then raise exception using errcode='22023',message='Choose a current, confirmed and reviewed imported bank movement'; end if;
  if tx.review_version<>p_expected_transaction_version or tx.currency<>'PKR' or tx.amount_minor<=0 then raise exception using errcode='PT409',message='Bank movement changed or is not payable'; end if;
  if exists(select 1 from public.workspace_payments where workspace_id=p_workspace_id and (transaction_id=p_transaction_id or (target_kind=p_target_kind and target_id=p_target_id))) then
    raise exception using errcode='PT409',message='This invoice/bill or bank movement is already linked'; end if;
  if not exists(select 1 from public.ledger_accounts where workspace_id=p_workspace_id and id=p_cash_account_id and active and is_cash_account and type='asset') then
    raise exception using errcode='22023',message='Select an active cash or bank account'; end if;
  if p_target_kind='invoice' then
    select total_minor,currency,invoice_number,status,review_version into amount,target_currency,target_name,target_status,target_version
      from public.invoices where id=p_target_id and workspace_id=p_workspace_id for update;
    if not found then raise exception using errcode='P0002',message='Invoice not found'; end if;
    if not exists(select 1 from public.invoice_ledger_postings where workspace_id=p_workspace_id and invoice_id=p_target_id) then raise exception using errcode='22023',message='Confirm service delivery and recognize invoice revenue before linking payment'; end if;
    if target_status not in ('sent','overdue') then raise exception using errcode='PT409',message='Invoice is not open for payment'; end if;
    if target_version<>p_expected_version then raise exception using errcode='PT409',message='Invoice changed'; end if;
    invoice_before:=public.invoice_snapshot_json(p_target_id,p_workspace_id);
    direction:='in';
    target_source_kind:='invoice';
    select id into contra_id from public.ledger_accounts where workspace_id=p_workspace_id and active and role='receivable' order by code limit 1;
  elsif p_target_kind='supplier_bill' then
    select total_minor,'PKR',supplier_name,status,version into amount,target_currency,target_name,target_status,target_version
      from public.supplier_bills where id=p_target_id and workspace_id=p_workspace_id for update;
    if not found then raise exception using errcode='P0002',message='Supplier bill not found'; end if;
    if target_status<>'posted' then raise exception using errcode='22023',message='Approve the bill on its confirmed received date first'; end if;
    if target_version<>p_expected_version then raise exception using errcode='PT409',message='Supplier bill changed'; end if;
    direction:='out';
    target_source_kind:='supplier_bill';
    select id into contra_id from public.ledger_accounts where workspace_id=p_workspace_id and active and role='payable' order by code limit 1;
  elsif p_target_kind='expense_draft' then
    select amount_minor,'PKR',coalesce(description,'Expense note'),status,version into amount,target_currency,target_name,target_status,target_version
      from public.expense_drafts where id=p_target_id and workspace_id=p_workspace_id for update;
    if not found then raise exception using errcode='P0002',message='Expense note not found'; end if;
    if target_status<>'accepted' or not exists(select 1 from public.expense_ledger_postings where workspace_id=p_workspace_id and expense_id=p_target_id) then
      raise exception using errcode='22023',message='Accept and post the expense note accrual before linking payment'; end if;
    if target_version<>p_expected_version then raise exception using errcode='PT409',message='Expense note changed'; end if;
    direction:='out';
    target_source_kind:='manual_note';
    select id into contra_id from public.ledger_accounts where workspace_id=p_workspace_id and active and role='payable' order by code limit 1;
  else raise exception using errcode='22023',message='Invalid payment target'; end if;
  if contra_id is null then raise exception using errcode='22023',message='No active receivable/payable control account is available'; end if;
  if target_currency<>'PKR' or tx.direction<>direction or tx.amount_minor<>amount then raise exception using errcode='22023',message='Payment amount, direction or currency must match the full open balance exactly'; end if;
  insert into public.ledger_review_decisions(workspace_id,target_id,target_kind,action,actor_subject,expected_version,reason,previous_value,current_value)
    values(p_workspace_id,p_transaction_id,'cash_movement','accept',subject,p_expected_transaction_version,'Owner linked full bank movement to one payable/receivable',to_jsonb(tx),payload_key);
  if direction='in' then
    journal_payload:=jsonb_build_object('requestId',p_request_id,'expectedVersion',null,'id',journal_id,'entryDate',tx.date,'description','Payment received · '||target_name,
      'currency','PKR','recognitionEvidence',null,'cashMovement',jsonb_build_object('kind','bank_transaction','transactionId',p_transaction_id),'reversalOfId',null,'reversalReason',null,
      'lines',jsonb_build_array(jsonb_build_object('id',line_one,'accountId',p_cash_account_id,'debitMinor',amount::text,'creditMinor','0','memo',null),
        jsonb_build_object('id',line_two,'accountId',contra_id,'debitMinor','0','creditMinor',amount::text,'memo',null)));
  else
    journal_payload:=jsonb_build_object('requestId',p_request_id,'expectedVersion',null,'id',journal_id,'entryDate',tx.date,'description','Supplier payment · '||target_name,
      'currency','PKR','recognitionEvidence',null,'cashMovement',jsonb_build_object('kind','bank_transaction','transactionId',p_transaction_id),'reversalOfId',null,'reversalReason',null,
      'lines',jsonb_build_array(jsonb_build_object('id',line_one,'accountId',contra_id,'debitMinor',amount::text,'creditMinor','0','memo',null),
        jsonb_build_object('id',line_two,'accountId',p_cash_account_id,'debitMinor','0','creditMinor',amount::text,'memo',null)));
  end if;
  sources:=jsonb_build_array(jsonb_build_object('kind','bank_transaction','id',p_transaction_id),jsonb_build_object('kind',target_source_kind,'id',p_target_id));
  journal_result:=public.post_workspace_ledger_journal(p_workspace_id,journal_payload,sources);
  insert into public.workspace_payments(id,workspace_id,request_id,target_kind,target_id,transaction_id,transaction_version,cash_account_id,journal_id,date,amount_minor,currency,direction,request_payload,created_by)
    values(payment_id,p_workspace_id,p_request_id,p_target_kind,p_target_id,p_transaction_id,tx.review_version,p_cash_account_id,journal_id,tx.date,amount,'PKR',direction,payload_key,subject);
  if p_target_kind='invoice' then
    update public.invoices set status='paid',review_version=review_version+1,updated_at=now() where id=p_target_id and workspace_id=p_workspace_id;
    invoice_after:=public.invoice_snapshot_json(p_target_id,p_workspace_id);
    insert into public.invoice_reviews(workspace_id,invoice_id,actor_subject,action,review_version,previous_value,current_value)
      values(p_workspace_id,p_target_id,subject,'status',target_version+1,invoice_before,invoice_after||jsonb_build_object('paymentId',payment_id));
  end if;
  payment_json:=jsonb_build_object('id',payment_id,'workspaceId',p_workspace_id,'requestId',p_request_id,'targetKind',p_target_kind,'targetId',p_target_id,
    'transactionId',p_transaction_id,'transactionVersion',tx.review_version,'cashAccountId',p_cash_account_id,'journalId',journal_id,'date',tx.date,
    'amountMinor',amount::text,'currency','PKR','direction',direction,'createdAt',now());
  return jsonb_build_object('payment',payment_json,'journal',journal_result->'journal','duplicate',false);
end;
$$;

revoke all on function public.read_workspace_payments(uuid),public.recognize_workspace_invoice(uuid,uuid,uuid,integer,date,uuid),
  public.post_workspace_expense_accrual(uuid,uuid,uuid,integer,uuid),public.link_workspace_payment(uuid,uuid,text,uuid,integer,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.read_workspace_payments(uuid),public.recognize_workspace_invoice(uuid,uuid,uuid,integer,date,uuid),
  public.post_workspace_expense_accrual(uuid,uuid,uuid,integer,uuid),public.link_workspace_payment(uuid,uuid,text,uuid,integer,uuid,integer,uuid) to authenticated;
commit;
