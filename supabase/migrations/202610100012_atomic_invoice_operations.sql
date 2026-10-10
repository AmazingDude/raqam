-- Apply after 011. Safe to retry if a prior SQL-editor run left some objects
-- installed. Atomic invoice writes, owner checks, exact JSON money, optimistic
-- versions and audit history. Does not write cashbook transactions.
begin;
alter table public.invoices add column if not exists review_version integer not null default 0;
alter table public.invoices alter column review_version set default 0;
update public.invoices set review_version=0 where review_version is null;
alter table public.invoices alter column review_version set not null;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.invoices'::regclass and contype='c'
   and pg_get_constraintdef(oid) like '%review_version >= 0%') then
   alter table public.invoices add constraint invoices_review_version_nonnegative check(review_version >= 0);
 end if;
end $$;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.invoices'::regclass and conname='invoices_id_workspace_unique') then
   alter table public.invoices add constraint invoices_id_workspace_unique unique(id,workspace_id);
 end if;
end $$;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.invoice_items'::regclass and conname='invoice_items_invoice_workspace_fk') then
   alter table public.invoice_items add constraint invoice_items_invoice_workspace_fk
     foreign key(invoice_id,workspace_id) references public.invoices(id,workspace_id) on delete cascade;
 end if;
end $$;
create table if not exists public.invoice_reviews (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  invoice_id uuid not null, actor_subject text not null, action text not null check(action in ('create','edit','status','delete')),
  review_version integer not null, previous_value jsonb, current_value jsonb, created_at timestamptz not null default now()
);
alter table public.invoice_reviews enable row level security;
alter table public.invoice_reviews force row level security;
drop policy if exists invoice_review_owner on public.invoice_reviews;
create policy invoice_review_owner on public.invoice_reviews for select to authenticated using (
  workspace_id in (select id from public.workspaces where owner_subject=(select auth.jwt()->>'sub'))
);
revoke all on public.invoices,public.invoice_items,public.invoice_reviews from public,anon,authenticated;
grant select on public.invoices,public.invoice_items,public.invoice_reviews to authenticated;

create or replace function public.invoice_snapshot_json(p_id uuid,p_workspace uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(i) || jsonb_build_object(
   'subtotal_minor',i.subtotal_minor::text,'discount_minor',i.discount_minor::text,'shipping_minor',i.shipping_minor::text,
   'tax_minor',i.tax_minor::text,'total_minor',i.total_minor::text,
   'items',coalesce((select jsonb_agg((to_jsonb(l)-'created_at'-'workspace_id') || jsonb_build_object('rate_minor',l.rate_minor::text,'amount_minor',l.amount_minor::text) order by l.position)
     from public.invoice_items l where l.invoice_id=i.id and l.workspace_id=i.workspace_id),'[]'::jsonb))
 from public.invoices i where i.id=p_id and i.workspace_id=p_workspace;
$$;
revoke all on function public.invoice_snapshot_json(uuid,uuid) from public,anon,authenticated;

create or replace function public.read_workspace_invoice(p_workspace_id uuid,p_invoice_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=(select auth.jwt()->>'sub') and coalesce(auth.jwt()->>'sub','')<>'') then
   raise exception using errcode='P0002',message='Workspace not found'; end if;
 return public.invoice_snapshot_json(p_invoice_id,p_workspace_id);
end; $$;
create or replace function public.read_workspace_invoices(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=(select auth.jwt()->>'sub') and coalesce(auth.jwt()->>'sub','')<>'') then
   raise exception using errcode='P0002',message='Workspace not found'; end if;
 if (select count(*) from public.invoices where workspace_id=p_workspace_id)>1000 then
   raise exception using errcode='22023',message='Invoice limit exceeded'; end if;
 return coalesce((select jsonb_agg(public.invoice_snapshot_json(i.id,p_workspace_id) order by i.issue_date desc,i.id) from public.invoices i where i.workspace_id=p_workspace_id),'[]'::jsonb);
end; $$;

create or replace function public.save_workspace_invoice(p_workspace_id uuid,p_invoice jsonb,p_expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 saved public.invoices%rowtype; old_row public.invoices%rowtype; line jsonb; item_count integer; subtotal numeric:=0; amount numeric; qty numeric; rate numeric;
 before_value jsonb; after_value jsonb; subject text:=auth.jwt()->>'sub'; workspace_currency text; position integer:=0; is_edit boolean;
begin
 select currency into workspace_currency from public.workspaces where id=p_workspace_id and owner_subject=subject and coalesce(subject,'')<>'' for update;
 if not found then raise exception using errcode='P0002',message='Workspace not found'; end if;
 if jsonb_typeof(p_invoice) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_invoice) k where k not in (
   'id','workspace_id','invoice_number','status','issue_date','due_date','supply_date','note','from_name','from_address','from_contact','from_tax_id',
   'client_name','client_email','client_address','client_contact','client_tax_id','currency','subtotal_minor','discount_minor','shipping_minor','tax_minor','total_minor',
   'payment_link','payment_details','signature_url','logo_url','reminders_enabled','items')) then
   raise exception using errcode='22023',message='Invalid invoice fields'; end if;
 saved:=jsonb_populate_record(null::public.invoices,p_invoice-'items');
 if saved.workspace_id is distinct from p_workspace_id or saved.currency is distinct from workspace_currency or saved.id is null then
   raise exception using errcode='22023',message='Invalid invoice workspace or currency'; end if;
 select * into old_row from public.invoices where id=saved.id for update;
 is_edit:=found;
 if is_edit and old_row.workspace_id<>p_workspace_id then raise exception using errcode='P0002',message='Invoice not found'; end if;
 if (is_edit and (p_expected_version is null or p_expected_version<>old_row.review_version)) or (not is_edit and p_expected_version is not null) then
   raise exception using errcode='PT409',message='Invoice version changed'; end if;
 if jsonb_typeof(p_invoice->'items') is distinct from 'array' then raise exception using errcode='22023',message='Invoice items required'; end if;
 item_count:=jsonb_array_length(p_invoice->'items');
 if item_count not between 1 and 100 or (select count(distinct l->>'id') from jsonb_array_elements(p_invoice->'items') l)<>item_count then
   raise exception using errcode='22023',message='Invalid invoice item count or IDs'; end if;
 for line in select value from jsonb_array_elements(p_invoice->'items') loop
   if jsonb_typeof(line) is distinct from 'object' or jsonb_typeof(line->'quantity') is distinct from 'number'
     or (line->>'quantity') !~ '^[0-9]+(\.[0-9]{1,2})?$' or jsonb_typeof(line->'rate_minor') is distinct from 'string'
     or (line->>'rate_minor') !~ '^(0|[1-9][0-9]{0,18})$' then
     raise exception using errcode='22023',message='Invalid invoice quantity or rate'; end if;
   qty:=(line->>'quantity')::numeric; rate:=(line->>'rate_minor')::bigint;
   if qty>100000 then raise exception using errcode='22023',message='Invalid invoice quantity'; end if;
   amount:=round(qty*rate); subtotal:=subtotal+amount;
 end loop;
 before_value:=public.invoice_snapshot_json(saved.id,p_workspace_id);
 saved.subtotal_minor:=subtotal::bigint;
 saved.discount_minor:=coalesce(saved.discount_minor,0); saved.shipping_minor:=coalesce(saved.shipping_minor,0); saved.tax_minor:=coalesce(saved.tax_minor,0);
 saved.total_minor:=(subtotal-saved.discount_minor+saved.shipping_minor+saved.tax_minor)::bigint;
 saved.views_count:=case when is_edit then old_row.views_count else 0 end;
 saved.review_version:=case when is_edit then old_row.review_version+1 else 0 end;
 saved.created_at:=case when is_edit then old_row.created_at else now() end; saved.updated_at:=now();
 saved.reminders_enabled:=coalesce(saved.reminders_enabled,false);
 -- Header updates and item replacement occur inside this single transaction.
 -- Row locks serialize edits; the immutable review survives invoice deletion.
 if is_edit then
   update public.invoices set (invoice_number,status,issue_date,due_date,supply_date,note,from_name,from_address,from_contact,from_tax_id,client_name,client_email,client_address,client_contact,client_tax_id,currency,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,payment_link,payment_details,signature_url,logo_url,reminders_enabled,views_count,updated_at,review_version)=(saved.invoice_number,saved.status,saved.issue_date,saved.due_date,saved.supply_date,saved.note,saved.from_name,saved.from_address,saved.from_contact,saved.from_tax_id,saved.client_name,saved.client_email,saved.client_address,saved.client_contact,saved.client_tax_id,saved.currency,saved.subtotal_minor,saved.discount_minor,saved.shipping_minor,saved.tax_minor,saved.total_minor,saved.payment_link,saved.payment_details,saved.signature_url,saved.logo_url,saved.reminders_enabled,saved.views_count,saved.updated_at,saved.review_version) where id=saved.id and workspace_id=p_workspace_id;
   delete from public.invoice_items where invoice_id=saved.id and workspace_id=p_workspace_id;
 else insert into public.invoices select saved.*; end if;
 for line in select value from jsonb_array_elements(p_invoice->'items') loop
   insert into public.invoice_items(id,invoice_id,workspace_id,position,description,quantity,rate_minor,amount_minor)
     values((line->>'id')::uuid,saved.id,p_workspace_id,position,line->>'description',(line->>'quantity')::numeric,
       (line->>'rate_minor')::bigint,round((line->>'quantity')::numeric*(line->>'rate_minor')::bigint)::bigint);
   position:=position+1;
 end loop;
 if (select count(*) from public.invoices where workspace_id=p_workspace_id)>1000 then raise exception using errcode='22023',message='Invoice limit exceeded'; end if;
 after_value:=public.invoice_snapshot_json(saved.id,p_workspace_id);
 insert into public.invoice_reviews(workspace_id,invoice_id,actor_subject,action,review_version,previous_value,current_value)
   values(p_workspace_id,saved.id,subject,case when is_edit then 'edit' else 'create' end,saved.review_version,before_value,after_value);
 return after_value;
end; $$;

create or replace function public.set_workspace_invoice_status(p_workspace_id uuid,p_invoice_id uuid,p_status text,p_expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.invoices%rowtype; before_value jsonb; after_value jsonb;
begin
 if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=(select auth.jwt()->>'sub') and coalesce(auth.jwt()->>'sub','')<>'' for update) then raise exception using errcode='P0002',message='Workspace not found'; end if;
 select * into saved from public.invoices where id=p_invoice_id and workspace_id=p_workspace_id for update;
 if not found then raise exception using errcode='P0002',message='Invoice not found'; end if;
 if p_expected_version is null or p_expected_version<>saved.review_version then raise exception using errcode='PT409',message='Invoice version changed'; end if;
 if p_status is null or p_status not in ('draft','sent','overdue','paid') then raise exception using errcode='22023',message='Invalid invoice status'; end if;
 before_value:=public.invoice_snapshot_json(p_invoice_id,p_workspace_id);
 update public.invoices set status=p_status,review_version=review_version+1,updated_at=now() where id=p_invoice_id and workspace_id=p_workspace_id;
 after_value:=public.invoice_snapshot_json(p_invoice_id,p_workspace_id);
 insert into public.invoice_reviews(workspace_id,invoice_id,actor_subject,action,review_version,previous_value,current_value)
   values(p_workspace_id,p_invoice_id,auth.jwt()->>'sub','status',saved.review_version+1,before_value,after_value);
 return after_value;
end; $$;
create or replace function public.delete_workspace_invoice(p_workspace_id uuid,p_invoice_id uuid,p_expected_version integer) returns uuid language plpgsql security definer set search_path='' as $$
declare saved public.invoices%rowtype; before_value jsonb;
begin
 if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=(select auth.jwt()->>'sub') and coalesce(auth.jwt()->>'sub','')<>'' for update) then raise exception using errcode='P0002',message='Workspace not found'; end if;
 select * into saved from public.invoices where id=p_invoice_id and workspace_id=p_workspace_id for update;
 if not found then raise exception using errcode='P0002',message='Invoice not found'; end if;
 if p_expected_version is null or p_expected_version<>saved.review_version then raise exception using errcode='PT409',message='Invoice version changed'; end if;
 before_value:=public.invoice_snapshot_json(p_invoice_id,p_workspace_id);
 delete from public.invoices where id=p_invoice_id and workspace_id=p_workspace_id;
 insert into public.invoice_reviews(workspace_id,invoice_id,actor_subject,action,review_version,previous_value,current_value)
   values(p_workspace_id,p_invoice_id,auth.jwt()->>'sub','delete',saved.review_version+1,before_value,null);
 return p_invoice_id;
end; $$;
revoke all on function public.read_workspace_invoice(uuid,uuid),public.read_workspace_invoices(uuid),public.save_workspace_invoice(uuid,jsonb,integer),
 public.set_workspace_invoice_status(uuid,uuid,text,integer),public.delete_workspace_invoice(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.read_workspace_invoice(uuid,uuid),public.read_workspace_invoices(uuid),public.save_workspace_invoice(uuid,jsonb,integer),
 public.set_workspace_invoice_status(uuid,uuid,text,integer),public.delete_workspace_invoice(uuid,uuid,integer) to authenticated;
commit;
