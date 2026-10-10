-- Additive double-entry ledger foundation. Hosted state for invoice migrations
-- 011/012 must be verified before this migration is applied to Supabase.
begin;

create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  code text not null check (length(trim(code)) between 1 and 32),
  name text not null check (length(trim(name)) between 1 and 120),
  type text not null check (type in ('asset','liability','equity','revenue','expense')),
  cash_flow_class text check (cash_flow_class in ('operating','investing','financing','non_cash','unclassified')),
  role text not null check (role in ('cash','receivable','payable','revenue','expense','unclassified_cash_clearing','opening_balance','other')),
  is_cash_account boolean not null default false,
  active boolean not null default true,
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  unique(workspace_id, id), unique(workspace_id, code),
  check ((role = 'cash') = is_cash_account),
  check (not is_cash_account or type = 'asset'),
  check (role <> 'receivable' or type = 'asset'),
  check (role <> 'payable' or type = 'liability'),
  check (role <> 'revenue' or type = 'revenue'),
  check (role <> 'expense' or type = 'expense'),
  check (role <> 'unclassified_cash_clearing' or (type='asset' and not is_cash_account and cash_flow_class='unclassified')),
  check (not is_cash_account or cash_flow_class is null)
);

create table public.ledger_journals (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  request_id uuid not null,
  entry_date date not null check (entry_date between '1000-01-01'::date and '9999-12-31'::date),
  description text not null check (length(trim(description)) between 1 and 500),
  currency text not null check (currency = 'PKR'),
  status text not null check (status in ('draft','posted')),
  version integer not null default 0 check (version >= 0),
  posted_at timestamptz,
  posted_by text,
  recognition_evidence jsonb,
  cash_movement jsonb,
  reversal_of_id uuid,
  reversal_reason text,
  request_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,id), unique(workspace_id,request_id),
  foreign key(workspace_id,reversal_of_id) references public.ledger_journals(workspace_id,id),
  check ((status='posted') = (posted_at is not null and posted_by is not null)),
  check ((reversal_of_id is null) = (reversal_reason is null)),
  check (recognition_evidence is null or jsonb_typeof(recognition_evidence)='object'),
  check (cash_movement is null or jsonb_typeof(cash_movement)='object')
);

create table public.ledger_journal_lines (
  id uuid primary key,
  workspace_id uuid not null,
  journal_id uuid not null,
  account_id uuid not null,
  debit_minor bigint not null default 0 check (debit_minor >= 0),
  credit_minor bigint not null default 0 check (credit_minor >= 0),
  memo text check (length(memo) <= 500),
  foreign key(workspace_id,journal_id) references public.ledger_journals(workspace_id,id),
  foreign key(workspace_id,account_id) references public.ledger_accounts(workspace_id,id),
  check ((debit_minor > 0) <> (credit_minor > 0))
);
create index ledger_journals_workspace_date on public.ledger_journals(workspace_id,entry_date,id) where status='posted';
create index ledger_lines_journal on public.ledger_journal_lines(workspace_id,journal_id);

create table public.ledger_journal_sources (
  workspace_id uuid not null,
  journal_id uuid not null,
  source_kind text not null check(source_kind in ('bank_transaction','document','supplier_bill','invoice','manual_payment','manual_note','opening_balance')),
  source_id uuid not null,
  locator jsonb,
  primary key(workspace_id,journal_id,source_kind,source_id),
  foreign key(workspace_id,journal_id) references public.ledger_journals(workspace_id,id)
);
create unique index ledger_one_posted_cash_movement on public.ledger_journals
  (workspace_id, (cash_movement->>'kind'), (coalesce(cash_movement->>'transactionId',cash_movement->>'paymentId')))
  where status='posted' and cash_movement is not null;
create unique index ledger_one_reversal on public.ledger_journals(workspace_id,reversal_of_id)
  where status='posted' and reversal_of_id is not null;

create table public.ledger_history_coverage (
  workspace_id uuid primary key references public.workspaces(id),
  selected_from date,
  selected_through date,
  available_from date,
  available_through date,
  is_complete boolean not null default false,
  missing_source_kinds text[] not null default array['bank','customer_invoice','supplier_bill','manual_payment']::text[],
  updated_at timestamptz not null default now(),
  check ((selected_from is null) = (selected_through is null)),
  check (selected_from is null or selected_from <= selected_through),
  check ((available_from is null) = (available_through is null)),
  check (available_from is null or available_from <= available_through),
  check (not is_complete or (selected_from is not null and available_from <= selected_from and available_through >= selected_through and cardinality(missing_source_kinds)=0))
);

create table public.ledger_review_decisions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  target_id uuid not null, target_kind text not null check(target_kind in ('account','journal','cash_movement')),
  action text not null check(action in ('accept','reject','correct','post','reverse')),
  actor_subject text not null check(length(actor_subject)>0), expected_version integer not null check(expected_version>=0),
  reason text check(length(reason)<=1000), previous_value jsonb, current_value jsonb,
  created_at timestamptz not null default now()
);
create table public.ledger_account_operations (
 workspace_id uuid not null references public.workspaces(id),request_id uuid not null,payload jsonb not null,result jsonb not null,
 created_at timestamptz not null default now(),primary key(workspace_id,request_id)
);

create table public.expense_drafts (
 id uuid primary key, workspace_id uuid not null references public.workspaces(id), request_id uuid not null,
 version integer not null default 0 check(version>=0), original_text text not null check(length(trim(original_text)) between 1 and 3000),
 description text check(description is null or length(trim(description)) between 1 and 500),
 counterparty text check(counterparty is null or length(trim(counterparty)) between 1 and 200),
 occurred_on date, amount_minor bigint check(amount_minor is null or amount_minor>=0), currency text check(currency is null or currency='PKR'),
 status text not null check(status in ('draft','needs_review','accepted','rejected')),
 request_payload jsonb not null, review_request_id uuid, review_payload jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id), unique(workspace_id,request_id), unique(workspace_id,review_request_id), check((amount_minor is null)=(currency is null))
);
create table public.expense_draft_history (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, draft_id uuid not null, actor_subject text not null,
 operation text not null check(operation in ('create','edit','accept','reject')), version integer not null,
 previous_value jsonb, current_value jsonb, created_at timestamptz not null default now(),
 foreign key(workspace_id,draft_id) references public.expense_drafts(workspace_id,id), unique(workspace_id,draft_id,version)
);
create table public.supplier_bills (
 id uuid primary key, workspace_id uuid not null references public.workspaces(id), request_id uuid not null,
 version integer not null default 0 check(version>=0), supplier_name text not null check(length(trim(supplier_name)) between 1 and 200),
 supplier_reference text check(supplier_reference is null or length(supplier_reference)<=128), issue_date date not null, due_date date,
 goods_received_date date, source_document_id uuid, expense_account_id uuid, lines jsonb not null check(jsonb_typeof(lines)='array'),
 total_minor bigint not null check(total_minor>=0), status text not null check(status in ('draft','needs_review','posted','rejected')),
 journal_id uuid, review_request_id uuid, review_payload jsonb, request_payload jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id), unique(workspace_id,request_id), unique(workspace_id,review_request_id),
 foreign key(source_document_id,workspace_id) references public.supporting_documents(id,workspace_id),
 foreign key(workspace_id,expense_account_id) references public.ledger_accounts(workspace_id,id),
 foreign key(workspace_id,journal_id) references public.ledger_journals(workspace_id,id),
 check(due_date is null or due_date>=issue_date),
 check((status='posted')=(journal_id is not null and goods_received_date is not null and expense_account_id is not null))
);
create table public.supplier_bill_history (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,bill_id uuid not null,actor_subject text not null,
 operation text not null check(operation in ('create','edit','accept','reject')),version integer not null,previous_value jsonb,current_value jsonb,
 created_at timestamptz not null default now(),foreign key(workspace_id,bill_id) references public.supplier_bills(workspace_id,id),unique(workspace_id,bill_id,version)
);

alter table public.ledger_accounts enable row level security;
alter table public.ledger_accounts force row level security;
alter table public.ledger_journals enable row level security;
alter table public.ledger_journals force row level security;
alter table public.ledger_journal_lines enable row level security;
alter table public.ledger_journal_lines force row level security;
alter table public.ledger_journal_sources enable row level security;
alter table public.ledger_journal_sources force row level security;
alter table public.ledger_history_coverage enable row level security;
alter table public.ledger_history_coverage force row level security;
alter table public.ledger_review_decisions enable row level security;
alter table public.ledger_review_decisions force row level security;
alter table public.ledger_account_operations enable row level security;
alter table public.ledger_account_operations force row level security;
alter table public.expense_drafts enable row level security;
alter table public.expense_drafts force row level security;
alter table public.expense_draft_history enable row level security;
alter table public.expense_draft_history force row level security;
alter table public.supplier_bills enable row level security;
alter table public.supplier_bills force row level security;
alter table public.supplier_bill_history enable row level security;
alter table public.supplier_bill_history force row level security;

create policy ledger_accounts_owner on public.ledger_accounts to authenticated using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_subject=(select auth.jwt()->>'sub')));
create policy ledger_journals_owner on public.ledger_journals to authenticated using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_subject=(select auth.jwt()->>'sub')));
create policy ledger_lines_owner on public.ledger_journal_lines to authenticated using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_subject=(select auth.jwt()->>'sub')));
create policy ledger_sources_owner on public.ledger_journal_sources to authenticated using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_subject=(select auth.jwt()->>'sub')));
create policy ledger_coverage_owner on public.ledger_history_coverage to authenticated using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_subject=(select auth.jwt()->>'sub')));
create policy ledger_decisions_owner on public.ledger_review_decisions to authenticated using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_subject=(select auth.jwt()->>'sub')));
create policy ledger_account_operations_owner on public.ledger_account_operations to authenticated using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_subject=(select auth.jwt()->>'sub')));
create policy expense_drafts_owner on public.expense_drafts to authenticated using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_subject=(select auth.jwt()->>'sub')));
create policy expense_history_owner on public.expense_draft_history to authenticated using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_subject=(select auth.jwt()->>'sub')));
create policy supplier_bills_owner on public.supplier_bills to authenticated using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_subject=(select auth.jwt()->>'sub')));
create policy supplier_bill_history_owner on public.supplier_bill_history to authenticated using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_subject=(select auth.jwt()->>'sub')));
revoke all on public.ledger_accounts,public.ledger_journals,public.ledger_journal_lines,public.ledger_journal_sources,public.ledger_history_coverage,public.ledger_review_decisions,public.ledger_account_operations,public.expense_drafts,public.expense_draft_history,public.supplier_bills,public.supplier_bill_history from public,anon,authenticated;

create function public.seed_workspace_ledger() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.ledger_accounts(workspace_id,code,name,type,cash_flow_class,role,is_cash_account) values
    (new.id,'1000','Bank and cash','asset',null,'cash',true),
    (new.id,'1100','Accounts receivable','asset',null,'receivable',false),
    (new.id,'1200','Unclassified cash clearing','asset','unclassified','unclassified_cash_clearing',false),
    (new.id,'2000','Accounts payable','liability',null,'payable',false),
    (new.id,'3000','Owner equity','equity',null,'other',false),
    (new.id,'4000','Service revenue','revenue',null,'revenue',false),
    (new.id,'5000','General operating expense','expense','operating','expense',false);
  insert into public.ledger_history_coverage(workspace_id) values(new.id);
  return new;
end; $$;
create trigger workspace_seed_ledger after insert on public.workspaces for each row execute function public.seed_workspace_ledger();
revoke all on function public.seed_workspace_ledger() from public,anon,authenticated;

-- Read operations return text for every bigint to avoid JSON number precision loss.
create function public.read_workspace_ledger(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=(select auth.jwt()->>'sub') and coalesce(auth.jwt()->>'sub','')<>'') then raise exception using errcode='P0002',message='Workspace not found'; end if;
 if (select count(*) from public.ledger_accounts where workspace_id=p_workspace_id)>1000 or (select count(*) from public.ledger_journals where workspace_id=p_workspace_id)>10000 then raise exception using errcode='22023',message='Ledger history exceeds the safe snapshot limit'; end if;
 select jsonb_build_object(
  'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'workspaceId',workspace_id,'code',code,'name',name,'type',type,'cashFlowClass',cash_flow_class,'role',role,'isCashAccount',is_cash_account,'active',active,'version',version) order by code) from public.ledger_accounts where workspace_id=p_workspace_id),'[]'::jsonb),
  'journals',coalesce((select jsonb_agg(public.ledger_journal_json(j.id,p_workspace_id) order by j.entry_date,j.id) from public.ledger_journals j where j.workspace_id=p_workspace_id),'[]'::jsonb),
  'coverage',public.ledger_coverage_json(p_workspace_id)
 ) into result;
 return result;
end; $$;
create function public.save_workspace_ledger_account(p_workspace_id uuid,p_account jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare subject text:=auth.jwt()->>'sub'; v_request uuid; v_id uuid; old public.ledger_accounts%rowtype; saved public.ledger_accounts%rowtype; prior jsonb; result jsonb; is_edit boolean;
begin
 if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=subject and coalesce(subject,'')<>'') then raise exception using errcode='P0002',message='Workspace not found'; end if;
 if jsonb_typeof(p_account) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_account) k where k not in ('requestId','id','expectedVersion','code','name','type','cashFlowClass','role','isCashAccount','active')) then raise exception using errcode='22023',message='Invalid account fields'; end if;
 v_request:=(p_account->>'requestId')::uuid;
 if exists(select 1 from public.ledger_account_operations where workspace_id=p_workspace_id and request_id=v_request) then
  select op.payload,op.result into prior,result from public.ledger_account_operations op where op.workspace_id=p_workspace_id and op.request_id=v_request;
  if prior is distinct from p_account then raise exception using errcode='PT409',message='Account request ID payload conflict'; end if;
  return jsonb_build_object('account',result,'duplicate',true);
 end if;
 v_id:=nullif(p_account->>'id','')::uuid;is_edit:=v_id is not null;
 if is_edit then
  select * into old from public.ledger_accounts where id=v_id and workspace_id=p_workspace_id for update;
  if not found then raise exception using errcode='P0002',message='Account not found'; end if;
  if p_account->>'expectedVersion' is null or (p_account->>'expectedVersion')::integer<>old.version then raise exception using errcode='PT409',message='Account version changed'; end if;
  if exists(select 1 from public.ledger_journal_lines where workspace_id=p_workspace_id and account_id=v_id) and
    (old.code is distinct from p_account->>'code' or old.name is distinct from p_account->>'name' or old.type is distinct from p_account->>'type' or old.role is distinct from p_account->>'role' or old.is_cash_account is distinct from (p_account->>'isCashAccount')::boolean) then
     raise exception using errcode='22023',message='Account identity is immutable after posting'; end if;
  prior:=jsonb_build_object('id',old.id,'workspaceId',old.workspace_id,'code',old.code,'name',old.name,'type',old.type,'cashFlowClass',old.cash_flow_class,'role',old.role,'isCashAccount',old.is_cash_account,'active',old.active,'version',old.version);
  update public.ledger_accounts set code=trim(p_account->>'code'),name=trim(p_account->>'name'),type=p_account->>'type',cash_flow_class=nullif(p_account->>'cashFlowClass','null'),role=p_account->>'role',is_cash_account=(p_account->>'isCashAccount')::boolean,active=(p_account->>'active')::boolean,version=version+1
   where id=v_id and workspace_id=p_workspace_id returning * into saved;
 else
  if p_account->>'expectedVersion' is not null then raise exception using errcode='22023',message='New account cannot have a version'; end if;
  insert into public.ledger_accounts(workspace_id,code,name,type,cash_flow_class,role,is_cash_account,active)
   values(p_workspace_id,trim(p_account->>'code'),trim(p_account->>'name'),p_account->>'type',nullif(p_account->>'cashFlowClass','null'),p_account->>'role',(p_account->>'isCashAccount')::boolean,(p_account->>'active')::boolean) returning * into saved;
 end if;
 result:=jsonb_build_object('id',saved.id,'workspaceId',saved.workspace_id,'code',saved.code,'name',saved.name,'type',saved.type,'cashFlowClass',saved.cash_flow_class,'role',saved.role,'isCashAccount',saved.is_cash_account,'active',saved.active,'version',saved.version);
 insert into public.ledger_review_decisions(workspace_id,target_id,target_kind,action,actor_subject,expected_version,previous_value,current_value)
 values(p_workspace_id,saved.id,'account',case when is_edit then 'correct' else 'accept' end,subject,coalesce(old.version,0),prior,result);
 insert into public.ledger_account_operations(workspace_id,request_id,payload,result) values(p_workspace_id,v_request,p_account,result);
 return jsonb_build_object('account',result,'duplicate',false);
end; $$;

create function public.ledger_coverage_json(p_workspace uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('workspaceId',workspace_id,'selectedFrom',coalesce(selected_from::text,'1000-01-01'),'selectedThrough',coalesce(selected_through::text,'9999-12-31'),
  'availableFrom',available_from,'availableThrough',available_through,'isComplete',is_complete,'missingSourceKinds',to_jsonb(missing_source_kinds),'unsupportedOpeningBalanceAccountIds','[]'::jsonb)
 from public.ledger_history_coverage where workspace_id=p_workspace;
$$;
create function public.set_workspace_ledger_history_range(p_workspace_id uuid,p_from date,p_through date) returns jsonb language plpgsql security definer set search_path='' as $$
declare available_start date; available_end date;
begin
 if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=(select auth.jwt()->>'sub') and coalesce(auth.jwt()->>'sub','')<>'') then raise exception using errcode='P0002',message='Workspace not found'; end if;
 if p_from is null or p_through is null or p_from>p_through then raise exception using errcode='22023',message='Invalid history range'; end if;
 select min(date),max(date) into available_start,available_end from public.transactions where workspace_id=p_workspace_id;
 update public.ledger_history_coverage set selected_from=p_from,selected_through=p_through,available_from=available_start,available_through=available_end,
  is_complete=false,missing_source_kinds=array['bank','customer_invoice','supplier_bill','manual_payment']::text[],updated_at=now() where workspace_id=p_workspace_id;
 return public.ledger_coverage_json(p_workspace_id);
end; $$;
create function public.ledger_journal_json(p_id uuid,p_workspace uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',j.id,'workspaceId',j.workspace_id,'entryDate',j.entry_date,'description',j.description,'currency',j.currency,'status',j.status,'version',j.version,'postedAt',j.posted_at,'postedBy',j.posted_by,
  'recognitionEvidence',j.recognition_evidence,'cashMovement',j.cash_movement,'reversalOfId',j.reversal_of_id,'reversalReason',j.reversal_reason,
  'sources',coalesce((select jsonb_agg(case s.source_kind
    when 'bank_transaction' then jsonb_build_object('kind',s.source_kind,'transactionId',s.source_id,'locator',s.locator)
    when 'document' then jsonb_build_object('kind',s.source_kind,'documentId',s.source_id,'locator',s.locator)
    when 'supplier_bill' then jsonb_build_object('kind',s.source_kind,'billId',s.source_id,'locator',s.locator)
    when 'invoice' then jsonb_build_object('kind',s.source_kind,'invoiceId',s.source_id,'locator',s.locator)
    when 'manual_payment' then jsonb_build_object('kind',s.source_kind,'paymentId',s.source_id,'locator',s.locator)
    when 'manual_note' then jsonb_build_object('kind',s.source_kind,'noteId',s.source_id,'locator',s.locator)
    else jsonb_build_object('kind',s.source_kind,'cutoverDate',j.entry_date,'evidenceId',s.source_id,'locator',s.locator) end)
    from public.ledger_journal_sources s where s.workspace_id=j.workspace_id and s.journal_id=j.id),'[]'::jsonb),
  'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'accountId',l.account_id,'debitMinor',l.debit_minor::text,'creditMinor',l.credit_minor::text,'memo',l.memo)) from public.ledger_journal_lines l where l.workspace_id=j.workspace_id and l.journal_id=j.id),'[]'::jsonb))
 from public.ledger_journals j where j.id=p_id and j.workspace_id=p_workspace;
$$;

create function public.expense_draft_json(p_id uuid,p_workspace uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'workspaceId',workspace_id,'originalText',original_text,'description',description,'counterparty',counterparty,
  'occurredOn',occurred_on,'amountMinor',amount_minor::text,'currency',currency,'status',status,'version',version,'createdAt',created_at,'updatedAt',updated_at)
 from public.expense_drafts where id=p_id and workspace_id=p_workspace;
$$;
create function public.read_workspace_expense_drafts(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=(select auth.jwt()->>'sub') and coalesce(auth.jwt()->>'sub','')<>'') then raise exception using errcode='P0002',message='Workspace not found'; end if;
 if (select count(*) from public.expense_drafts where workspace_id=p_workspace_id)>2000 then raise exception using errcode='22023',message='Expense draft limit exceeded'; end if;
 return coalesce((select jsonb_agg(public.expense_draft_json(d.id,p_workspace_id) order by d.updated_at desc,d.id) from public.expense_drafts d where d.workspace_id=p_workspace_id),'[]'::jsonb);
end; $$;
create function public.review_workspace_expense_draft(p_workspace_id uuid,p_draft_id uuid,p_request_id uuid,p_expected_version integer,p_decision jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare subject text:=auth.jwt()->>'sub'; draft public.expense_drafts%rowtype; previous jsonb; result jsonb; action text;
begin
 if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=subject and coalesce(subject,'')<>'') then raise exception using errcode='P0002',message='Workspace not found'; end if;
 if jsonb_typeof(p_decision) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_decision) k where k not in ('action','reason')) or p_decision->>'action' not in ('accept','reject') then raise exception using errcode='22023',message='Invalid expense review'; end if;
 select * into draft from public.expense_drafts where id=p_draft_id and workspace_id=p_workspace_id for update;
 if not found then raise exception using errcode='P0002',message='Expense draft not found'; end if;
 if draft.review_request_id=p_request_id then if draft.review_payload is distinct from p_decision then raise exception using errcode='PT409',message='Review request ID payload conflict'; end if; return jsonb_build_object('draft',public.expense_draft_json(draft.id,p_workspace_id),'duplicate',true); end if;
 if draft.version<>p_expected_version or draft.status in ('accepted','rejected') then raise exception using errcode='PT409',message='Expense draft changed; reload and review'; end if;
 action:=p_decision->>'action';
 if action='accept' and (draft.description is null or draft.counterparty is null or draft.occurred_on is null or draft.amount_minor is null or draft.currency is null) then raise exception using errcode='22023',message='Complete every required expense field before acceptance'; end if;
 previous:=public.expense_draft_json(draft.id,p_workspace_id);
 update public.expense_drafts set status=case when action='accept' then 'accepted' else 'rejected' end,version=version+1,review_request_id=p_request_id,review_payload=p_decision,updated_at=now()
  where id=draft.id and workspace_id=p_workspace_id;
 result:=public.expense_draft_json(draft.id,p_workspace_id);
 insert into public.expense_draft_history(workspace_id,draft_id,actor_subject,operation,version,previous_value,current_value)
  values(p_workspace_id,draft.id,subject,action,draft.version+1,previous,result);
 return jsonb_build_object('draft',result,'duplicate',false);
end; $$;
create function public.save_workspace_expense_draft(p_workspace_id uuid,p_draft jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare subject text:=auth.jwt()->>'sub'; draft_id uuid; v_request_id uuid; old public.expense_drafts%rowtype; payload jsonb; before_value jsonb; next_version integer; next_status text; result jsonb;
begin
 if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=subject and coalesce(subject,'')<>'') then raise exception using errcode='P0002',message='Workspace not found'; end if;
 if jsonb_typeof(p_draft) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_draft) k where k not in ('requestId','id','expectedVersion','originalText','description','counterparty','occurredOn','amountMinor','currency')) then raise exception using errcode='22023',message='Invalid expense draft fields'; end if;
 draft_id:=nullif(p_draft->>'id','')::uuid; v_request_id:=(p_draft->>'requestId')::uuid;
 select * into old from public.expense_drafts where workspace_id=p_workspace_id and request_id=v_request_id;
 if found then
  if old.request_payload is distinct from p_draft then raise exception using errcode='PT409',message='Draft request ID payload conflict'; end if;
  return jsonb_build_object('draft',public.expense_draft_json(old.id,p_workspace_id),'duplicate',true);
 end if;
 if draft_id is null then
  if (p_draft->>'expectedVersion') is not null then raise exception using errcode='22023',message='New draft cannot have an expected version'; end if;
  draft_id:=gen_random_uuid(); next_version:=0; before_value:=null;
 else
  select * into old from public.expense_drafts where id=draft_id and workspace_id=p_workspace_id for update;
  if not found then raise exception using errcode='P0002',message='Draft not found'; end if;
  if p_draft->>'expectedVersion' is null or (p_draft->>'expectedVersion')::integer<>old.version then raise exception using errcode='PT409',message='Draft version changed'; end if;
  if p_draft->>'originalText' is distinct from old.original_text then raise exception using errcode='22023',message='Original expense note is immutable'; end if;
  if old.status in ('accepted','rejected') then raise exception using errcode='PT409',message='Reviewed expense draft is immutable'; end if;
  before_value:=public.expense_draft_json(old.id,p_workspace_id); next_version:=old.version+1;
 end if;
 if coalesce(p_draft->>'originalText','') !~ '[^[:space:]]' or length(p_draft->>'originalText')>3000 then raise exception using errcode='22023',message='Original expense note is required'; end if;
 if (p_draft->>'amountMinor' is null)<>(p_draft->>'currency' is null) then raise exception using errcode='22023',message='Amount and currency must both be known or unresolved'; end if;
 if p_draft->>'amountMinor' is not null and (p_draft->>'amountMinor') !~ '^(0|[1-9][0-9]{0,18})$' then raise exception using errcode='22023',message='Invalid expense amount'; end if;
 next_status:=case when p_draft->>'description' is null or p_draft->>'counterparty' is null or p_draft->>'occurredOn' is null or p_draft->>'amountMinor' is null then 'needs_review' else 'draft' end;
 payload:=p_draft;
 if before_value is null then
  insert into public.expense_drafts(id,workspace_id,request_id,version,original_text,description,counterparty,occurred_on,amount_minor,currency,status,request_payload)
   values(draft_id,p_workspace_id,v_request_id,next_version,p_draft->>'originalText',nullif(p_draft->>'description',''),nullif(p_draft->>'counterparty',''),nullif(p_draft->>'occurredOn','')::date,
    nullif(p_draft->>'amountMinor','')::bigint,nullif(p_draft->>'currency',''),next_status,payload);
 else
  update public.expense_drafts set request_id=v_request_id,version=next_version,description=nullif(p_draft->>'description',''),counterparty=nullif(p_draft->>'counterparty',''),occurred_on=nullif(p_draft->>'occurredOn','')::date,
    amount_minor=nullif(p_draft->>'amountMinor','')::bigint,currency=nullif(p_draft->>'currency',''),status=next_status,request_payload=payload,updated_at=now()
   where id=draft_id and workspace_id=p_workspace_id;
 end if;
 result:=public.expense_draft_json(draft_id,p_workspace_id);
 insert into public.expense_draft_history(workspace_id,draft_id,actor_subject,operation,version,previous_value,current_value)
  values(p_workspace_id,draft_id,subject,case when before_value is null then 'create' else 'edit' end,next_version,before_value,result);
 return jsonb_build_object('draft',result,'duplicate',false);
end; $$;

create function public.supplier_bill_json(p_id uuid,p_workspace uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'workspaceId',workspace_id,'supplierName',supplier_name,'supplierReference',supplier_reference,'issueDate',issue_date,'dueDate',due_date,
  'goodsReceivedDate',goods_received_date,'sourceDocumentId',source_document_id,'expenseAccountId',expense_account_id,'lines',lines,'totalMinor',total_minor::text,
  'status',status,'version',version,'journalId',journal_id,'createdAt',created_at,'updatedAt',updated_at)
 from public.supplier_bills where id=p_id and workspace_id=p_workspace;
$$;
create function public.read_workspace_supplier_bills(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=(select auth.jwt()->>'sub') and coalesce(auth.jwt()->>'sub','')<>'') then raise exception using errcode='P0002',message='Workspace not found'; end if;
 if (select count(*) from public.supplier_bills where workspace_id=p_workspace_id)>2000 then raise exception using errcode='22023',message='Supplier bill limit exceeded'; end if;
 return coalesce((select jsonb_agg(public.supplier_bill_json(b.id,p_workspace_id) order by b.issue_date desc,b.id) from public.supplier_bills b where b.workspace_id=p_workspace_id),'[]'::jsonb);
end; $$;
create function public.save_workspace_supplier_bill(p_workspace_id uuid,p_bill jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare subject text:=auth.jwt()->>'sub'; bill_id uuid; v_request uuid; old public.supplier_bills%rowtype; line jsonb; total numeric:=0; amount numeric; qty numeric; rate numeric; position integer:=0; next_version integer; before_value jsonb; result jsonb;
begin
 if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=subject and coalesce(subject,'')<>'') then raise exception using errcode='P0002',message='Workspace not found'; end if;
 if jsonb_typeof(p_bill) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_bill) k where k not in ('requestId','id','expectedVersion','supplierName','supplierReference','issueDate','dueDate','goodsReceivedDate','sourceDocumentId','expenseAccountId','lines')) or jsonb_typeof(p_bill->'lines') is distinct from 'array' then raise exception using errcode='22023',message='Invalid supplier bill fields'; end if;
 bill_id:=nullif(p_bill->>'id','')::uuid; v_request:=(p_bill->>'requestId')::uuid;
 select * into old from public.supplier_bills where workspace_id=p_workspace_id and request_id=v_request;
 if found then if old.request_payload is distinct from p_bill then raise exception using errcode='PT409',message='Supplier bill request ID payload conflict'; end if;
  return jsonb_build_object('bill',public.supplier_bill_json(old.id,p_workspace_id),'duplicate',true); end if;
 if length(trim(coalesce(p_bill->>'supplierName','')))=0 or length(p_bill->>'supplierName')>200 or p_bill->>'issueDate' is null or jsonb_array_length(p_bill->'lines') not between 1 and 100 then raise exception using errcode='22023',message='Supplier name, date and lines are required'; end if;
 if p_bill->>'dueDate' is not null and (p_bill->>'dueDate')::date<(p_bill->>'issueDate')::date then raise exception using errcode='22023',message='Due date cannot precede bill date'; end if;
 if bill_id is null then
  if p_bill->>'expectedVersion' is not null then raise exception using errcode='22023',message='New bill cannot have a version'; end if;
  bill_id:=gen_random_uuid();next_version:=0;before_value:=null;
 else
  select * into old from public.supplier_bills where id=bill_id and workspace_id=p_workspace_id for update;
  if not found then raise exception using errcode='P0002',message='Supplier bill not found'; end if;
  if old.version<>(p_bill->>'expectedVersion')::integer then raise exception using errcode='PT409',message='Supplier bill version changed'; end if;
  if old.status in ('posted','rejected') then raise exception using errcode='PT409',message='Reviewed supplier bill is immutable'; end if;
  before_value:=public.supplier_bill_json(bill_id,p_workspace_id);next_version:=old.version+1;
 end if;
 for line in select value from jsonb_array_elements(p_bill->'lines') loop
  if jsonb_typeof(line) is distinct from 'object' or exists(select 1 from jsonb_object_keys(line) k where k not in ('id','description','quantity','rateMinor','amountMinor')) or
   (line->>'quantity') !~ '^[0-9]+(\.[0-9]{1,2})?$' or (line->>'rateMinor') !~ '^(0|[1-9][0-9]{0,18})$' or length(trim(coalesce(line->>'description','')))=0 then raise exception using errcode='22023',message='Invalid supplier bill line'; end if;
  qty:=(line->>'quantity')::numeric;rate:=(line->>'rateMinor')::numeric;
  if qty<=0 or qty>100000 or rate<=0 then raise exception using errcode='22023',message='Invalid bill quantity or rate'; end if;
  amount:=floor((qty*100*rate+50)/100);
  if amount<>(line->>'amountMinor')::numeric then raise exception using errcode='22023',message='Supplier bill line amount is incorrect'; end if;
  total:=total+amount;
 end loop;
 if total<=0 then raise exception using errcode='22023',message='Supplier bill total must be positive'; end if;
 if total>9223372036854775807 then raise exception using errcode='22003',message='Supplier bill total is too large'; end if;
 if p_bill->>'sourceDocumentId' is not null and not exists(select 1 from public.supporting_documents where id=(p_bill->>'sourceDocumentId')::uuid and workspace_id=p_workspace_id) then raise exception using errcode='22023',message='Bill document unavailable'; end if;
 if p_bill->>'expenseAccountId' is not null and not exists(select 1 from public.ledger_accounts where id=(p_bill->>'expenseAccountId')::uuid and workspace_id=p_workspace_id and active and type in ('expense','asset')) then raise exception using errcode='22023',message='Bill account unavailable'; end if;
 if bill_id is null or before_value is null then
  insert into public.supplier_bills(id,workspace_id,request_id,version,supplier_name,supplier_reference,issue_date,due_date,goods_received_date,source_document_id,expense_account_id,lines,total_minor,status,request_payload)
  values(bill_id,p_workspace_id,v_request,next_version,trim(p_bill->>'supplierName'),nullif(trim(p_bill->>'supplierReference'),''),(p_bill->>'issueDate')::date,nullif(p_bill->>'dueDate','')::date,
   nullif(p_bill->>'goodsReceivedDate','')::date,nullif(p_bill->>'sourceDocumentId','')::uuid,nullif(p_bill->>'expenseAccountId','')::uuid,p_bill->'lines',total::bigint,'draft',p_bill);
 else
  update public.supplier_bills set request_id=v_request,version=next_version,supplier_name=trim(p_bill->>'supplierName'),supplier_reference=nullif(trim(p_bill->>'supplierReference'),''),issue_date=(p_bill->>'issueDate')::date,
   due_date=nullif(p_bill->>'dueDate','')::date,goods_received_date=nullif(p_bill->>'goodsReceivedDate','')::date,source_document_id=nullif(p_bill->>'sourceDocumentId','')::uuid,expense_account_id=nullif(p_bill->>'expenseAccountId','')::uuid,
   lines=p_bill->'lines',total_minor=total::bigint,status='draft',request_payload=p_bill,updated_at=now() where id=bill_id and workspace_id=p_workspace_id;
 end if;
 result:=public.supplier_bill_json(bill_id,p_workspace_id);
 insert into public.supplier_bill_history(workspace_id,bill_id,actor_subject,operation,version,previous_value,current_value)
 values(p_workspace_id,bill_id,subject,case when before_value is null then 'create' else 'edit' end,next_version,before_value,result);
 return jsonb_build_object('bill',result,'duplicate',false);
end; $$;

create function public.review_workspace_supplier_bill(p_workspace_id uuid,p_bill_id uuid,p_request_id uuid,p_expected_version integer,p_decision jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare subject text:=auth.jwt()->>'sub'; bill public.supplier_bills%rowtype; old_value jsonb; payable_id uuid; total bigint; v_journal_id uuid:=gen_random_uuid(); review_id uuid; journal_payload jsonb; links jsonb; posted jsonb; result jsonb;
begin
 if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=subject and coalesce(subject,'')<>'') then raise exception using errcode='P0002',message='Workspace not found'; end if;
 if jsonb_typeof(p_decision) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_decision) k where k not in ('action','goodsReceivedDate','expenseAccountId','reason')) or p_decision->>'action' not in ('accept','reject') then raise exception using errcode='22023',message='Invalid bill review'; end if;
 select * into bill from public.supplier_bills where id=p_bill_id and workspace_id=p_workspace_id for update;
 if not found then raise exception using errcode='P0002',message='Supplier bill not found'; end if;
 if bill.review_request_id=p_request_id then
  if bill.review_payload is distinct from p_decision then raise exception using errcode='PT409',message='Review request ID payload conflict'; end if;
  return jsonb_build_object('bill',public.supplier_bill_json(bill.id,p_workspace_id),'duplicate',true);
 end if;
 if bill.version<>p_expected_version or bill.status in ('posted','rejected') then raise exception using errcode='PT409',message='Supplier bill changed; reload and review'; end if;
 old_value:=public.supplier_bill_json(bill.id,p_workspace_id);
 if p_decision->>'action'='reject' then
  update public.supplier_bills set status='rejected',version=version+1,review_request_id=p_request_id,review_payload=p_decision,updated_at=now() where id=bill.id and workspace_id=p_workspace_id;
  result:=public.supplier_bill_json(bill.id,p_workspace_id);
  insert into public.supplier_bill_history(workspace_id,bill_id,actor_subject,operation,version,previous_value,current_value) values(p_workspace_id,bill.id,subject,'reject',bill.version+1,old_value,result);
  return jsonb_build_object('bill',result,'duplicate',false);
 end if;
 if p_decision->>'goodsReceivedDate' is null or p_decision->>'expenseAccountId' is null then raise exception using errcode='22023',message='Confirm the goods received date and account before approving this bill'; end if;
 review_id:=p_request_id;
 select id into payable_id from public.ledger_accounts where workspace_id=p_workspace_id and role='payable' and active;
 if payable_id is null then raise exception using errcode='22023',message='Accounts payable is unavailable'; end if;
 if not exists(select 1 from public.ledger_accounts where id=(p_decision->>'expenseAccountId')::uuid and workspace_id=p_workspace_id and active and type in ('asset','expense')) then raise exception using errcode='22023',message='Select an active expense or asset account'; end if;
 select total_minor into total from public.supplier_bills where id=bill.id;
 links:=jsonb_build_array(jsonb_build_object('kind','supplier_bill','id',bill.id,'locator',jsonb_build_object('kind','owner_decision','decisionId',review_id,'field','goods_received_date')));
 if bill.source_document_id is not null then links:=links||jsonb_build_array(jsonb_build_object('kind','document','id',bill.source_document_id,'locator',jsonb_build_object('kind','document_field','field','goods_received_date','pageNumber',null,'occurrence',0))); end if;
 journal_payload:=jsonb_build_object('id',v_journal_id,'requestId',p_request_id,'expectedVersion',null,'entryDate',p_decision->>'goodsReceivedDate','description','Supplier bill: '||bill.supplier_name,'currency','PKR',
  'recognitionEvidence',jsonb_build_object('basis','goods_received','date',p_decision->>'goodsReceivedDate','source',jsonb_build_object('kind','supplier_bill','billId',bill.id,'locator',jsonb_build_object('kind','owner_decision','decisionId',review_id,'field','goods_received_date')),'reviewDecisionId',review_id),
  'cashMovement',null,'reversalOfId',null,'reversalReason',null,'lines',jsonb_build_array(
   jsonb_build_object('id',gen_random_uuid(),'accountId',(p_decision->>'expenseAccountId')::uuid,'debitMinor',total::text,'creditMinor','0','memo',bill.supplier_name),
   jsonb_build_object('id',gen_random_uuid(),'accountId',payable_id,'debitMinor','0','creditMinor',total::text,'memo',bill.supplier_name)));
 update public.supplier_bills set status='needs_review',goods_received_date=(p_decision->>'goodsReceivedDate')::date,expense_account_id=(p_decision->>'expenseAccountId')::uuid,review_request_id=p_request_id,review_payload=p_decision where id=bill.id and workspace_id=p_workspace_id;
 posted:=public.post_workspace_ledger_journal(p_workspace_id,journal_payload,links);
 update public.supplier_bills set status='posted',version=version+1,goods_received_date=(p_decision->>'goodsReceivedDate')::date,expense_account_id=(p_decision->>'expenseAccountId')::uuid,journal_id=v_journal_id,review_request_id=p_request_id,review_payload=p_decision,updated_at=now() where id=bill.id and workspace_id=p_workspace_id;
 result:=public.supplier_bill_json(bill.id,p_workspace_id);
 insert into public.supplier_bill_history(workspace_id,bill_id,actor_subject,operation,version,previous_value,current_value) values(p_workspace_id,bill.id,subject,'accept',bill.version+1,old_value,result);
 return jsonb_build_object('bill',result,'journal',posted->'journal','duplicate',false);
end; $$;

revoke all on function public.expense_draft_json(uuid,uuid),public.read_workspace_expense_drafts(uuid),public.save_workspace_expense_draft(uuid,jsonb),public.review_workspace_expense_draft(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.read_workspace_expense_drafts(uuid),public.save_workspace_expense_draft(uuid,jsonb),public.review_workspace_expense_draft(uuid,uuid,uuid,integer,jsonb) to authenticated;
revoke all on function public.supplier_bill_json(uuid,uuid),public.read_workspace_supplier_bills(uuid),public.save_workspace_supplier_bill(uuid,jsonb),public.review_workspace_supplier_bill(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.read_workspace_supplier_bills(uuid),public.save_workspace_supplier_bill(uuid,jsonb),public.review_workspace_supplier_bill(uuid,uuid,uuid,integer,jsonb) to authenticated;

create function public.post_workspace_ledger_journal(p_workspace_id uuid,p_journal jsonb,p_source_ids jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare subject text:=auth.jwt()->>'sub'; v_id uuid; v_request uuid; v_old public.ledger_journals%rowtype; v_line jsonb; v_source jsonb; debit numeric:=0; credit numeric:=0; v_cash jsonb; v_account public.ledger_accounts%rowtype; v_result jsonb; v_existing jsonb; v_touches_cash boolean:=false; v_cash_change numeric:=0; v_bank_amount numeric; v_bank_direction text; v_review_id uuid; v_needs_recognition boolean:=false;
begin
 if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=subject and coalesce(subject,'')<>'') then raise exception using errcode='P0002',message='Workspace not found'; end if;
 if jsonb_typeof(p_journal) is distinct from 'object' or jsonb_typeof(p_journal->'lines') is distinct from 'array' or jsonb_array_length(p_journal->'lines') not between 2 and 500 or jsonb_typeof(p_source_ids) is distinct from 'array' then raise exception using errcode='22023',message='Invalid journal'; end if;
 if exists(select 1 from jsonb_object_keys(p_journal) k where k not in ('requestId','expectedVersion','id','entryDate','description','currency','recognitionEvidence','cashMovement','reversalOfId','reversalReason','lines')) then raise exception using errcode='22023',message='Unknown journal fields'; end if;
 v_id:=(p_journal->>'id')::uuid; v_request:=(p_journal->>'requestId')::uuid;
 select * into v_old from public.ledger_journals where workspace_id=p_workspace_id and request_id=v_request;
 if found then
  v_existing:=public.ledger_journal_json(v_old.id,p_workspace_id);
  if v_old.request_payload is distinct from jsonb_build_object('journal',p_journal,'sources',p_source_ids) then raise exception using errcode='PT409',message='Idempotency key payload conflict'; end if;
  return jsonb_build_object('journal',v_existing,'duplicate',true);
 end if;
 if p_journal->>'currency' is distinct from 'PKR' or p_journal->>'entryDate' is null or length(trim(coalesce(p_journal->>'description','')))=0 then raise exception using errcode='22023',message='Invalid journal fields'; end if;
 if (p_journal->>'reversalOfId') is not null then
  if length(trim(coalesce(p_journal->>'reversalReason','')))=0 then raise exception using errcode='22023',message='Reversal reason required'; end if;
  if exists(select 1 from public.ledger_journals where workspace_id=p_workspace_id and reversal_of_id=(p_journal->>'reversalOfId')::uuid and status='posted') then raise exception using errcode='PT409',message='Journal already reversed'; end if;
 end if;
 if (p_journal->>'expectedVersion') is not null then raise exception using errcode='PT409',message='Journal changed; reload before posting'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_journal->'lines'))<>jsonb_array_length(p_journal->'lines') then raise exception using errcode='22023',message='Duplicate journal line'; end if;
 for v_line in select value from jsonb_array_elements(p_journal->'lines') loop
  if jsonb_typeof(v_line) is distinct from 'object' or exists(select 1 from jsonb_object_keys(v_line) k where k not in ('id','accountId','debitMinor','creditMinor','memo')) then raise exception using errcode='22023',message='Invalid journal line fields'; end if;
  if (v_line->>'debitMinor') !~ '^(0|[1-9][0-9]{0,18})$' or (v_line->>'creditMinor') !~ '^(0|[1-9][0-9]{0,18})$' then raise exception using errcode='22023',message='Invalid exact amount'; end if;
  if ((v_line->>'debitMinor')::numeric>0)=((v_line->>'creditMinor')::numeric>0) then raise exception using errcode='22023',message='Each line must have exactly one side'; end if;
  debit:=debit+(v_line->>'debitMinor')::numeric; credit:=credit+(v_line->>'creditMinor')::numeric;
  select * into v_account from public.ledger_accounts where workspace_id=p_workspace_id and id=(v_line->>'accountId')::uuid and active for share;
  if not found then raise exception using errcode='22023',message='Account unavailable'; end if;
  if v_account.is_cash_account then v_touches_cash:=true; v_cash_change:=v_cash_change+(v_line->>'debitMinor')::numeric-(v_line->>'creditMinor')::numeric; end if;
  if v_account.type in ('revenue','expense') then v_needs_recognition:=true; end if;
 end loop;
 if debit<=0 or debit<>credit then raise exception using errcode='22023',message='Journal must balance exactly'; end if;
 if v_needs_recognition and (p_journal->'recognitionEvidence' is null or p_journal->'recognitionEvidence'='null'::jsonb) then raise exception using errcode='22023',message='Reviewed recognition date evidence required'; end if;
 if p_journal->'cashMovement' is not null and p_journal->'cashMovement'<>'null'::jsonb then
  v_cash:=p_journal->'cashMovement';
  if v_cash->>'kind'='bank_transaction' then
   select amount_minor,direction into v_bank_amount,v_bank_direction from public.transactions t where t.id=(v_cash->>'transactionId')::uuid and t.workspace_id=p_workspace_id;
   if not found then raise exception using errcode='22023',message='Bank movement unavailable'; end if;
   if not v_touches_cash or abs(v_cash_change)<>v_bank_amount or (v_bank_direction='in' and v_cash_change<=0) or (v_bank_direction='out' and v_cash_change>=0) then raise exception using errcode='22023',message='Journal cash lines do not match the bank movement'; end if;
  elsif v_cash->>'kind'='manual_payment' then raise exception using errcode='22023',message='Manual payment operation is not available yet';
  else raise exception using errcode='22023',message='Invalid cash movement'; end if;
 end if;
 if v_touches_cash and (p_journal->'cashMovement' is null or p_journal->'cashMovement'='null'::jsonb) then
  if not ((p_source_ids @> '[{"kind":"opening_balance"}]'::jsonb) or (p_journal->>'reversalOfId') is not null) then raise exception using errcode='22023',message='Cash account movement evidence required'; end if;
 end if;
 if p_journal->'recognitionEvidence' is not null and p_journal->'recognitionEvidence'<>'null'::jsonb then
  if (p_journal->'recognitionEvidence'->>'date') is distinct from (p_journal->>'entryDate') then raise exception using errcode='22023',message='Recognition date must match journal date'; end if;
  if (p_journal->'recognitionEvidence'->>'reviewDecisionId') is null then raise exception using errcode='22023',message='Reviewed recognition evidence required'; end if;
  v_review_id:=(p_journal->'recognitionEvidence'->>'reviewDecisionId')::uuid;
  if not exists(select 1 from jsonb_array_elements(p_source_ids) src where src->>'kind'=p_journal->'recognitionEvidence'->'source'->>'kind'
    and src->>'id'=coalesce(p_journal->'recognitionEvidence'->'source'->>'transactionId',p_journal->'recognitionEvidence'->'source'->>'documentId',p_journal->'recognitionEvidence'->'source'->>'billId',p_journal->'recognitionEvidence'->'source'->>'invoiceId',p_journal->'recognitionEvidence'->'source'->>'paymentId',p_journal->'recognitionEvidence'->'source'->>'noteId',p_journal->'recognitionEvidence'->'source'->>'evidenceId')) then raise exception using errcode='22023',message='Recognition evidence must be linked to the journal'; end if;
  if p_journal->'recognitionEvidence'->'source'->>'kind'='supplier_bill' and not exists(select 1 from public.supplier_bills b where b.id=(p_journal->'recognitionEvidence'->'source'->>'billId')::uuid and b.workspace_id=p_workspace_id and b.review_request_id=v_review_id and b.goods_received_date=(p_journal->>'entryDate')::date and b.expense_account_id in (select (l->>'accountId')::uuid from jsonb_array_elements(p_journal->'lines') l)) then raise exception using errcode='22023',message='Goods-received date and account must be confirmed on this bill'; end if;
  if p_journal->'recognitionEvidence'->'source'->>'kind'='manual_note' and not exists(select 1 from public.expense_drafts d where d.id=(p_journal->'recognitionEvidence'->'source'->>'noteId')::uuid and d.workspace_id=p_workspace_id and d.status='accepted' and d.review_request_id=v_review_id and d.occurred_on=(p_journal->>'entryDate')::date) then raise exception using errcode='22023',message='Expense note review, date and source must match'; end if;
 end if;
 insert into public.ledger_journals(id,workspace_id,request_id,entry_date,description,currency,status,version,posted_at,posted_by,recognition_evidence,cash_movement,reversal_of_id,reversal_reason,request_payload)
 values(v_id,p_workspace_id,v_request,(p_journal->>'entryDate')::date,p_journal->>'description','PKR','posted',1,now(),subject,nullif(p_journal->'recognitionEvidence','null'::jsonb),nullif(p_journal->'cashMovement','null'::jsonb),nullif(p_journal->>'reversalOfId','')::uuid,nullif(p_journal->>'reversalReason',''),jsonb_build_object('journal',p_journal,'sources',p_source_ids));
 for v_line in select value from jsonb_array_elements(p_journal->'lines') loop
  insert into public.ledger_journal_lines(id,workspace_id,journal_id,account_id,debit_minor,credit_minor,memo) values((v_line->>'id')::uuid,p_workspace_id,v_id,(v_line->>'accountId')::uuid,(v_line->>'debitMinor')::bigint,(v_line->>'creditMinor')::bigint,nullif(v_line->>'memo',''));
 end loop;
 for v_source in select value from jsonb_array_elements(p_source_ids) loop
  if v_source->>'kind' not in ('bank_transaction','document','supplier_bill','invoice','manual_payment','manual_note','opening_balance') or v_source->>'id' is null then raise exception using errcode='22023',message='Invalid source link'; end if;
  if v_source->>'kind'='bank_transaction' and not exists(select 1 from public.transactions where id=(v_source->>'id')::uuid and workspace_id=p_workspace_id) then raise exception using errcode='22023',message='Foreign source link'; end if;
  if v_source->>'kind'='document' and not exists(select 1 from public.supporting_documents where id=(v_source->>'id')::uuid and workspace_id=p_workspace_id) then raise exception using errcode='22023',message='Foreign source link'; end if;
  if v_source->>'kind'='invoice' and not exists(select 1 from public.invoices where id=(v_source->>'id')::uuid and workspace_id=p_workspace_id) then raise exception using errcode='22023',message='Foreign source link'; end if;
  if v_source->>'kind'='supplier_bill' and not exists(select 1 from public.supplier_bills where id=(v_source->>'id')::uuid and workspace_id=p_workspace_id) then raise exception using errcode='22023',message='Foreign source link'; end if;
  if v_source->>'kind'='manual_note' and not exists(select 1 from public.expense_drafts where id=(v_source->>'id')::uuid and workspace_id=p_workspace_id and status='accepted') then raise exception using errcode='22023',message='Expense note is not explicitly accepted'; end if;
  if v_source->>'kind'='opening_balance' and (v_source->>'id' is null or (v_source->'locator'->>'kind') is distinct from 'owner_decision' or (v_source->'locator'->>'decisionId') is distinct from v_request::text or (v_source->'locator'->>'field') is distinct from 'opening_balance' or (v_source->>'cutoverDate') is distinct from (p_journal->>'entryDate')) then raise exception using errcode='22023',message='Opening balance needs a matching owner-confirmed cutover decision'; end if;
  insert into public.ledger_journal_sources(workspace_id,journal_id,source_kind,source_id,locator) values(p_workspace_id,v_id,v_source->>'kind',(v_source->>'id')::uuid,v_source->'locator');
 end loop;
 if (select count(*) from public.ledger_journal_sources where workspace_id=p_workspace_id and journal_id=v_id)<>jsonb_array_length(p_source_ids) then raise exception using errcode='22023',message='Duplicate source link'; end if;
 if p_journal->>'reversalOfId' is not null and exists(
  (select account_id,sum(debit_minor) deb,sum(credit_minor) cred from public.ledger_journal_lines where workspace_id=p_workspace_id and journal_id=(p_journal->>'reversalOfId')::uuid group by account_id)
  except
  (select account_id,sum(credit_minor) deb,sum(debit_minor) cred from public.ledger_journal_lines where workspace_id=p_workspace_id and journal_id=v_id group by account_id)
 ) then raise exception using errcode='22023',message='Reversal must exactly reverse original'; end if;
 if v_review_id is not null then
  insert into public.ledger_review_decisions(id,workspace_id,target_id,target_kind,action,actor_subject,expected_version,current_value)
  values(v_review_id,p_workspace_id,v_id,'journal','accept',subject,coalesce((p_journal->>'expectedVersion')::integer,0),jsonb_build_object('recognitionEvidence',p_journal->'recognitionEvidence','entryDate',p_journal->>'entryDate'));
 end if;
 if exists(select 1 from jsonb_array_elements(p_source_ids) src where src->>'kind'='opening_balance') then
  insert into public.ledger_review_decisions(id,workspace_id,target_id,target_kind,action,actor_subject,expected_version,current_value)
   values(v_request,p_workspace_id,v_id,'journal','accept',subject,0,jsonb_build_object('openingBalanceSources',p_source_ids,'entryDate',p_journal->>'entryDate'));
 end if;
 insert into public.ledger_review_decisions(workspace_id,target_id,target_kind,action,actor_subject,expected_version,reason,current_value)
 values(p_workspace_id,v_id,'journal','post',subject,coalesce((p_journal->>'expectedVersion')::integer,0),nullif(p_journal->>'reversalReason',''),p_journal);
 v_result:=public.ledger_journal_json(v_id,p_workspace_id);
 return jsonb_build_object('journal',v_result,'duplicate',false);
end; $$;

revoke all on function public.read_workspace_ledger(uuid),public.save_workspace_ledger_account(uuid,jsonb),public.post_workspace_ledger_journal(uuid,jsonb,jsonb),public.ledger_coverage_json(uuid),public.ledger_journal_json(uuid,uuid),public.set_workspace_ledger_history_range(uuid,date,date) from public,anon,authenticated;
grant execute on function public.read_workspace_ledger(uuid),public.save_workspace_ledger_account(uuid,jsonb),public.post_workspace_ledger_journal(uuid,jsonb,jsonb),public.set_workspace_ledger_history_range(uuid,date,date) to authenticated;

-- Seed already-existing workspaces as part of this forward-only migration.
insert into public.ledger_accounts(workspace_id,code,name,type,cash_flow_class,role,is_cash_account)
select w.id,s.code,s.name,s.type,s.cash_flow_class,s.role,s.is_cash_account from public.workspaces w cross join (values
 ('1000','Bank and cash','asset',null::text,'cash',true),('1100','Accounts receivable','asset',null,'receivable',false),
 ('1200','Unclassified cash clearing','asset','unclassified','unclassified_cash_clearing',false),('2000','Accounts payable','liability',null,'payable',false),
 ('3000','Owner equity','equity',null,'other',false),('4000','Service revenue','revenue',null,'revenue',false),('5000','General operating expense','expense','operating','expense',false)
) s(code,name,type,cash_flow_class,role,is_cash_account);
insert into public.ledger_history_coverage(workspace_id) select id from public.workspaces on conflict do nothing;

commit;
