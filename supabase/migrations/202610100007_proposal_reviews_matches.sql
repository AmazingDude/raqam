-- BA-04: apply after user-installed 006. No cash creation or AI calls.
begin;
alter table public.ai_proposals add constraint ai_proposals_id_workspace_unique unique(id,workspace_id);
create table public.proposal_reviews (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  proposal_id uuid not null, actor_subject text not null, decision jsonb not null,
  previous_value jsonb not null, current_value jsonb not null, version integer not null check(version > 0),
  created_at timestamptz not null default now(), unique(proposal_id,version), unique(id,workspace_id), unique(id,proposal_id,workspace_id),
  foreign key(proposal_id,workspace_id) references public.ai_proposals(id,workspace_id)
);
create table public.accepted_matches (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  proposal_id uuid not null, transaction_id uuid not null, document_id uuid not null,
  review_decision_id uuid not null, active boolean not null default true, created_at timestamptz not null default now(),
  foreign key(proposal_id,workspace_id) references public.ai_proposals(id,workspace_id),
  foreign key(transaction_id,workspace_id) references public.transactions(id,workspace_id),
  foreign key(document_id,workspace_id) references public.supporting_documents(id,workspace_id),
  foreign key(review_decision_id,proposal_id,workspace_id) references public.proposal_reviews(id,proposal_id,workspace_id)
);
create unique index accepted_match_transaction_once on public.accepted_matches(transaction_id) where active;
create unique index accepted_match_document_once on public.accepted_matches(document_id) where active;
create unique index accepted_match_proposal_once on public.accepted_matches(proposal_id) where active;
create table public.proposal_review_operations (
  workspace_id uuid not null references public.workspaces(id), request_id uuid not null,
  request_payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key(workspace_id,request_id)
);
do $$ declare t text; begin
  foreach t in array array['proposal_reviews','accepted_matches','proposal_review_operations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('create policy owner_read on public.%I for select to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_subject = (select auth.jwt()->>''sub'')))',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;

create or replace view public.cashbook_records with (security_invoker = true) as
  select t.id,t.workspace_id,t.source_id,t.source_row,t.date,t.original_description,t.description,t.direction,
    t.amount_minor::text as amount_minor,t.currency,t.reference,t.category,t.category_status,t.review_version,
    case when exists(select 1 from public.accepted_matches m where m.transaction_id = t.id and m.active) then 'accepted'
    when exists(select 1 from public.ai_proposals p join public.supporting_documents d on d.id = p.document_id
      where p.transaction_id = t.id and p.kind = 'match' and p.status in ('proposed','needs_review') and
        p.transaction_version = t.review_version and p.document_version = d.review_version and d.review_status = 'accepted') then 'proposed'
    else 'unmatched' end as match_status
  from public.transactions t;

create function public.guard_allocated_document() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.corrected_fields is distinct from old.corrected_fields or new.review_status is distinct from old.review_status or new.review_version is distinct from old.review_version) and
     exists(select 1 from public.accepted_matches where document_id = old.id and active) then
    raise exception using errcode = 'PT409', message = 'Review the active match before editing the document'; end if;
  return new;
end $$;
create trigger protect_allocated_document before update on public.supporting_documents for each row execute function public.guard_allocated_document();
create function public.guard_allocated_proposal() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.kind = 'match' and exists(select 1 from public.accepted_matches where active and
      (document_id = new.document_id or transaction_id = new.transaction_id)) then
    raise exception using errcode = 'PT409', message = 'Existing match preserved'; end if;
  return new;
end $$;
create trigger protect_allocated_proposal before insert on public.ai_proposals for each row execute function public.guard_allocated_proposal();

create function public.review_ai_proposal(p_proposal_id uuid,p_request_id uuid,p_expected_version integer,p_decision jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.ai_proposals%rowtype; tx public.transactions%rowtype; doc public.supporting_documents%rowtype;
  old_match public.accepted_matches%rowtype; receipt public.proposal_review_operations%rowtype;
  subject text := (select auth.jwt()->>'sub'); command jsonb; before_value jsonb; result jsonb;
  action text; category_value text; target uuid; audit_id uuid := gen_random_uuid(); match_value jsonb := null;
  affected uuid[] := '{}'; changed_id uuid; old_cash jsonb := '{}'::jsonb;
begin
  select proposal.* into p from public.ai_proposals proposal join public.workspaces w on w.id = proposal.workspace_id
    where proposal.id = p_proposal_id and w.owner_subject = subject and coalesce(subject,'') <> '';
  if not found then raise exception using errcode = 'P0002', message = 'Proposal not found'; end if;
  perform 1 from public.workspaces where id = p.workspace_id for update;
  select * into p from public.ai_proposals where id = p_proposal_id for update;
  if p_request_id is null or p_expected_version is null or p_expected_version < 0 or jsonb_typeof(p_decision) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Invalid proposal decision'; end if;
  command := jsonb_build_object('proposalId',p.id,'expectedVersion',p_expected_version,'decision',p_decision);
  select * into receipt from public.proposal_review_operations where workspace_id = p.workspace_id and request_id = p_request_id;
  if found then
    if receipt.request_payload is distinct from command then raise exception using errcode = 'PT409', message = 'Request conflict'; end if;
    return receipt.result || jsonb_build_object('duplicate',true);
  end if;
  if p.review_version <> p_expected_version or p.review_version = 2147483647 or p.status = 'rejected' then
    raise exception using errcode = 'PT409', message = 'Proposal version conflict'; end if;
  action := p_decision->>'decision';
  if action in ('accept','reject') then
    if p_decision - 'decision' <> '{}'::jsonb then raise exception using errcode = '22023', message = 'Decision fields only'; end if;
  elsif action = 'correct_category' and p.kind = 'category' then
    if p_decision - array['decision','category'] <> '{}'::jsonb or
       (p_decision->>'category' in ('customer_receipts','software_services','premises_utilities','travel','other_operating_cash_activity','transfers_owner_movements','uncategorized')) is distinct from true then
      raise exception using errcode = '22023', message = 'Invalid category correction'; end if;
  elsif action = 'correct_match' and p.kind = 'match' then
    if p_decision - array['decision','transactionId','transactionVersion'] <> '{}'::jsonb or
       jsonb_typeof(p_decision->'transactionId') is distinct from 'string' or jsonb_typeof(p_decision->'transactionVersion') is distinct from 'number' or
       p_decision->>'transactionVersion' !~ '^(0|[1-9][0-9]*)$' then raise exception using errcode = '22023', message = 'Invalid match correction'; end if;
  else raise exception using errcode = '22023', message = 'Invalid decision kind'; end if;
  if action = 'accept' and p.status = 'accepted' then raise exception using errcode = 'PT409', message = 'Proposal already accepted; retry the original request'; end if;
  before_value := public.raqam_proposal_record(p.id);
  target := case when action = 'correct_match' then (p_decision->>'transactionId')::uuid else p.transaction_id end;
  select * into tx from public.transactions where id = target and workspace_id = p.workspace_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Transaction not found'; end if;
  if p.kind = 'category' then
    if action <> 'reject' or p.status = 'accepted' then
      if tx.review_version <> p.transaction_version or tx.review_version = 2147483647 then raise exception using errcode = 'PT409', message = 'Transaction version conflict'; end if;
      affected := array[tx.id];
      old_cash := jsonb_build_object(tx.id::text,(select to_jsonb(c) from public.cashbook_records c where c.id = tx.id));
      category_value := case when action = 'reject' then null when action = 'correct_category' then p_decision->>'category' else p.category end;
      update public.transactions set category = category_value,category_status = case when category_value is null then 'needs_review' else 'accepted' end,
        review_version = review_version + 1 where id = tx.id returning * into tx;
      update public.ai_proposals set category = coalesce(category_value,category),transaction_version = tx.review_version where id = p.id;
    end if;
  else
    select * into doc from public.supporting_documents where id = p.document_id and workspace_id = p.workspace_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'Document not found'; end if;
    select * into old_match from public.accepted_matches where proposal_id = p.id and active for update;
    if action <> 'reject' then
      if tx.review_version <> (case when action = 'correct_match' then (p_decision->>'transactionVersion')::numeric else p.transaction_version end) or
         doc.review_version <> p.document_version or doc.review_status <> 'accepted' or
         not public.raqam_document_fields_valid(coalesce(doc.corrected_fields,doc.extracted_fields),true) then
        raise exception using errcode = 'PT409', message = 'Reviewed snapshot required'; end if;
      if coalesce(doc.corrected_fields,doc.extracted_fields)->>'currency' <> tx.currency or
         coalesce(doc.corrected_fields,doc.extracted_fields)->>'totalMinor' <> tx.amount_minor::text then
        raise exception using errcode = '22023', message = 'Exact amount and currency compatibility required'; end if;
      if exists(select 1 from public.accepted_matches where active and proposal_id <> p.id and (transaction_id = tx.id or document_id = doc.id)) then
        raise exception using errcode = 'PT409', message = 'Record already allocated'; end if;
      affected := array[tx.id];
    end if;
    if old_match.id is not null and not (old_match.transaction_id = any(affected)) then affected := array_append(affected,old_match.transaction_id); end if;
    foreach changed_id in array affected loop
      perform 1 from public.transactions where id = changed_id for update;
      if (select review_version from public.transactions where id = changed_id) = 2147483647 then raise exception using errcode = 'PT409', message = 'Transaction version conflict'; end if;
      old_cash := old_cash || jsonb_build_object(changed_id::text,(select to_jsonb(c) from public.cashbook_records c where c.id = changed_id));
    end loop;
  end if;
  insert into public.proposal_reviews(id,workspace_id,proposal_id,actor_subject,decision,previous_value,current_value,version)
    values(audit_id,p.workspace_id,p.id,subject,p_decision,before_value,'{}',p.review_version + 1);
  if p.kind = 'match' then
    update public.accepted_matches set active = false where proposal_id = p.id and active;
    if action <> 'reject' then
      insert into public.accepted_matches(workspace_id,proposal_id,transaction_id,document_id,review_decision_id)
        values(p.workspace_id,p.id,tx.id,doc.id,audit_id)
        returning jsonb_build_object('id',id,'workspaceId',workspace_id,'transactionId',transaction_id,'documentId',document_id,'reviewDecisionId',review_decision_id) into match_value;
    end if;
    update public.transactions set review_version = review_version + 1 where id = any(affected);
    update public.ai_proposals set transaction_id = target,transaction_version = (select review_version from public.transactions where id = target) where id = p.id;
  end if;
  update public.ai_proposals set status = case when action = 'reject' then 'rejected' else 'accepted' end,review_version = review_version + 1 where id = p.id;
  foreach changed_id in array affected loop
    insert into public.transaction_reviews(workspace_id,transaction_id,actor_subject,previous_value,current_value,version)
      select p.workspace_id,changed_id,subject,old_cash->changed_id::text,to_jsonb(c),c.review_version from public.cashbook_records c where c.id = changed_id;
  end loop;
  result := jsonb_build_object('requestId',p_request_id,'proposal',public.raqam_proposal_record(p.id),'reviewDecisionId',audit_id,
    'affectedTransactionIds',to_jsonb(affected),'match',match_value,'duplicate',false);
  update public.proposal_reviews set current_value = result->'proposal' where id = audit_id;
  insert into public.proposal_review_operations(workspace_id,request_id,request_payload,result) values(p.workspace_id,p_request_id,command,result);
  return result;
exception when unique_violation then raise exception using errcode = 'PT409', message = 'Allocation or review conflict';
  when invalid_text_representation or numeric_value_out_of_range then raise exception using errcode = '22023', message = 'Invalid review value';
end $$;
revoke all on function public.guard_allocated_document(),public.guard_allocated_proposal(),public.review_ai_proposal(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.review_ai_proposal(uuid,uuid,integer,jsonb) to authenticated;
commit;
