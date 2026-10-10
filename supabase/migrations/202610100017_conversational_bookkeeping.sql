-- Chat-entered history, durable proposals, atomic audited edits. Requires 001-016.
begin;
alter table public.sources drop constraint sources_source_type_check;
alter table public.sources add constraint sources_source_type_check check(source_type in ('transaction_csv','receipt_image','manual_chat'));
alter table public.transactions drop constraint transactions_source_type_check;
alter table public.transactions add constraint transactions_source_type_check check(source_type in ('transaction_csv','manual_chat'));
-- Keep posted journal contents immutable while allowing one current posting
-- per corrected cash movement. Reversal metadata releases only an exact reversal.
alter table public.ledger_journals add column cash_superseded boolean not null default false;
drop index public.ledger_one_posted_cash_movement;
create unique index ledger_one_posted_cash_movement on public.ledger_journals
 (workspace_id,(cash_movement->>'kind'),(coalesce(cash_movement->>'transactionId',cash_movement->>'paymentId')))
 where status='posted' and cash_movement is not null and not cash_superseded;
create function public.chat_guard_ledger_reversal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.reversal_of_id is not null then
  if not exists(select 1 from public.ledger_journals where id=new.reversal_of_id and workspace_id=new.workspace_id and status='posted') then raise exception using errcode='22023',message='Reversal target unavailable'; end if;
  if exists(with original as (select account_id,sum(debit_minor) debit,sum(credit_minor) credit from public.ledger_journal_lines where journal_id=new.reversal_of_id group by account_id),
   replacement as (select (value->>'accountId')::uuid account_id,sum((value->>'debitMinor')::numeric) debit,sum((value->>'creditMinor')::numeric) credit from jsonb_array_elements(new.request_payload->'journal'->'lines') group by (value->>'accountId')::uuid)
   select 1 from original o full join replacement r using(account_id) where coalesce(o.debit,0)<>coalesce(r.credit,0) or coalesce(o.credit,0)<>coalesce(r.debit,0)) then raise exception using errcode='22023',message='Reversal must exactly reverse the original'; end if;
  update public.ledger_journals set cash_superseded=true where id=new.reversal_of_id and workspace_id=new.workspace_id;
 end if;
 return new;
end $$;
revoke all on function public.chat_guard_ledger_reversal() from public,anon,authenticated;
create trigger chat_guard_ledger_reversal before insert on public.ledger_journals for each row execute function public.chat_guard_ledger_reversal();
create table public.chat_conversations(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 title text not null check(length(title) between 1 and 100), created_at timestamptz not null default now(), unique(id,workspace_id));
create table public.chat_messages(
 id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity, workspace_id uuid not null references public.workspaces(id),
 conversation_id uuid not null, request_id uuid not null, role text not null check(role in ('user','assistant')),
 text text not null check(length(text) between 1 and 12000), plan jsonb,
 state text not null default 'message' check(state in ('message','pending','applied','discarded')),
 result jsonb, created_at timestamptz not null default now(),
 foreign key(conversation_id,workspace_id) references public.chat_conversations(id,workspace_id),
 unique(workspace_id,request_id,role),
 check((state='message' and plan is null) or (role='assistant' and plan is not null and state<>'message')),
 check((state='applied')=(result is not null)));
create index chat_messages_history on public.chat_messages(conversation_id,created_at,id);
do $$ declare t text; begin
 foreach t in array array['chat_conversations','chat_messages'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('alter table public.%I force row level security',t);
 execute format('create policy chat_owner on public.%I for select to authenticated using(exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_subject=(select auth.jwt()->>''sub'')))',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop; end $$;
create function public.chat_message_json(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',id,'conversationId',conversation_id,'role',role,'text',text,'createdAt',created_at,'plan',plan,'state',state,'result',result) from public.chat_messages where id=p_id;
$$;
revoke all on function public.chat_message_json(uuid) from public,anon,authenticated;
grant execute on function public.chat_message_json(uuid) to authenticated;
create function public.save_chat_exchange(p_workspace_id uuid,p_conversation_id uuid,p_request_id uuid,p_user_text text,p_text text,p_plan jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare subject text:=(select auth.jwt()->>'sub'); c uuid; m uuid; old public.chat_messages%rowtype;
begin
 perform 1 from public.workspaces where id=p_workspace_id and owner_subject=subject and coalesce(subject,'')<>'' for update;
 if not found then raise exception using errcode='P0002',message='Workspace not found'; end if;
 select * into old from public.chat_messages where workspace_id=p_workspace_id and request_id=p_request_id and role='user';
 if found then
  if old.text<>p_user_text or (p_conversation_id is not null and old.conversation_id<>p_conversation_id) then raise exception using errcode='PT409',message='Request reused'; end if;
  select id into m from public.chat_messages where workspace_id=p_workspace_id and request_id=p_request_id and role='assistant';
  return jsonb_build_object('workspaceId',p_workspace_id,'conversationId',old.conversation_id,'message',public.chat_message_json(m));
 end if;
 if p_request_id is null or p_user_text is null or length(trim(p_user_text)) not between 1 and 6000 or p_text is null or length(trim(p_text)) not between 1 and 12000 then raise exception using errcode='22023',message='Invalid chat message'; end if;
 if p_plan is not null and (jsonb_typeof(p_plan->'actions') is distinct from 'array' or jsonb_array_length(p_plan->'actions') not between 1 and 10) then raise exception using errcode='22023',message='Invalid plan'; end if;
 c:=p_conversation_id;
 if c is null then
  if (select count(*) from public.chat_conversations where workspace_id=p_workspace_id)>=500 then raise exception using errcode='22023',message='Conversation limit reached'; end if;
  insert into public.chat_conversations(workspace_id,title) values(p_workspace_id,left(trim(p_user_text),100)) returning id into c;
 elsif not exists(select 1 from public.chat_conversations where id=c and workspace_id=p_workspace_id) then raise exception using errcode='P0002',message='Conversation not found'; end if;
 if (select count(*) from public.chat_messages where conversation_id=c)>=2000 then raise exception using errcode='22023',message='Start a new conversation'; end if;
 insert into public.chat_messages(workspace_id,conversation_id,request_id,role,text) values(p_workspace_id,c,p_request_id,'user',p_user_text);
 insert into public.chat_messages(workspace_id,conversation_id,request_id,role,text,plan,state) values(p_workspace_id,c,p_request_id,'assistant',p_text,p_plan,case when p_plan is null then 'message' else 'pending' end) returning id into m;
 return jsonb_build_object('workspaceId',p_workspace_id,'conversationId',c,'message',public.chat_message_json(m));
end $$;
create function public.chat_recognition_note(p_workspace_id uuid,p_id uuid,p_request_id uuid,p_text text,p_date date,p_amount bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=(select auth.jwt()->>'sub') and coalesce(auth.jwt()->>'sub','')<>'') then raise exception using errcode='P0002',message='Workspace not found'; end if;
 insert into public.expense_drafts(id,workspace_id,request_id,version,original_text,description,occurred_on,amount_minor,currency,status,request_payload,review_request_id,review_payload)
 values(p_id,p_workspace_id,p_request_id,1,left(p_text,3000),left(p_text,500),p_date,p_amount,'PKR','accepted',jsonb_build_object('origin','chat'),p_request_id,jsonb_build_object('action','accept','origin','chat'));
 insert into public.expense_draft_history(workspace_id,draft_id,actor_subject,operation,version,previous_value,current_value)
 values(p_workspace_id,p_id,auth.jwt()->>'sub','accept',1,null,jsonb_build_object('origin','chat','occurredOn',p_date,'amountMinor',p_amount::text));
end $$;
revoke all on function public.chat_recognition_note(uuid,uuid,uuid,text,date,bigint) from public,anon,authenticated;
-- Post linked cash through the existing ledger function. Unknown classification
-- stays in clearing, never invented revenue/expense. A correction reverses its
-- previous two-line cash journal and replaces it in the same transaction.
create function public.chat_post_cash(p_workspace_id uuid,p_transaction_id uuid,p_counter_account_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare t public.transactions%rowtype; j public.ledger_journals%rowtype; cash_id uuid; counter_id uuid; v_lines jsonb; cmd jsonb; jid uuid; rid uuid; note_id uuid; note jsonb;
begin
 select * into t from public.transactions where id=p_transaction_id and workspace_id=p_workspace_id;
 if not found or not exists(select 1 from public.workspaces where id=p_workspace_id and owner_subject=(select auth.jwt()->>'sub')) then raise exception using errcode='P0002',message='Transaction not found'; end if;
 select * into j from public.ledger_journals l where l.workspace_id=p_workspace_id and l.cash_movement->>'transactionId'=t.id::text
 and not exists(select 1 from public.ledger_journals r where r.reversal_of_id=l.id) order by l.created_at desc limit 1;
 if found then
  if (select count(*) from public.ledger_journal_lines where journal_id=j.id)<>2 then raise exception using errcode='PT409',message='Split accounting entries require an explicit ledger adjustment'; end if;
  select ll.account_id into cash_id from public.ledger_journal_lines ll join public.ledger_accounts a on a.id=ll.account_id where ll.journal_id=j.id and a.is_cash_account;
  select ll.account_id into counter_id from public.ledger_journal_lines ll join public.ledger_accounts a on a.id=ll.account_id where ll.journal_id=j.id and not a.is_cash_account;
  if cash_id is null or counter_id is null then raise exception using errcode='PT409',message='Cash journal requires explicit correction'; end if;
  rid:=gen_random_uuid();jid:=gen_random_uuid();
  select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'accountId',account_id,'debitMinor',credit_minor::text,'creditMinor',debit_minor::text,'memo',null)) into v_lines from public.ledger_journal_lines where journal_id=j.id;
  cmd:=jsonb_build_object('requestId',rid,'id',jid,'expectedVersion',null,'entryDate',j.entry_date,'description',left('Chat correction: '||p_reason,500),'currency','PKR','recognitionEvidence',null,'cashMovement',null,'reversalOfId',j.id,'reversalReason',left(p_reason,1000),'lines',v_lines);
  note_id:=gen_random_uuid();perform public.chat_recognition_note(p_workspace_id,note_id,rid,p_reason,j.entry_date,t.amount_minor);
  note:=jsonb_build_object('kind','manual_note','noteId',note_id,'locator',jsonb_build_object('kind','owner_decision','decisionId',rid,'field','service_date'));
  cmd:=cmd||jsonb_build_object('recognitionEvidence',jsonb_build_object('basis','correction','date',j.entry_date,'source',note,'reviewDecisionId',rid));
  perform public.post_workspace_ledger_journal(p_workspace_id,cmd,jsonb_build_array(jsonb_build_object('kind','manual_note','id',note_id,'locator',note->'locator')));
 end if;
 if cash_id is null then select id into cash_id from public.ledger_accounts where workspace_id=p_workspace_id and is_cash_account and active order by code limit 1; end if;
 counter_id:=coalesce(p_counter_account_id,counter_id);
 if counter_id is null then select id into counter_id from public.ledger_accounts where workspace_id=p_workspace_id and role='unclassified_cash_clearing' and active order by code limit 1; end if;
 if cash_id is null or counter_id is null or cash_id=counter_id or not exists(select 1 from public.ledger_accounts where id=counter_id and workspace_id=p_workspace_id and active and not is_cash_account) then raise exception using errcode='22023',message='Choose a current cash and counterpart account'; end if;
 -- Zero cash records do not create invalid zero journals.
 if t.amount_minor=0 then return; end if;
 jid:=gen_random_uuid();rid:=gen_random_uuid();
 v_lines:=jsonb_build_array(
 jsonb_build_object('id',gen_random_uuid(),'accountId',cash_id,'debitMinor',case when t.direction='in' then t.amount_minor::text else '0' end,'creditMinor',case when t.direction='out' then t.amount_minor::text else '0' end,'memo',null),
 jsonb_build_object('id',gen_random_uuid(),'accountId',counter_id,'debitMinor',case when t.direction='out' then t.amount_minor::text else '0' end,'creditMinor',case when t.direction='in' then t.amount_minor::text else '0' end,'memo',null));
 cmd:=jsonb_build_object('requestId',rid,'id',jid,'expectedVersion',null,'entryDate',t.date,'description',left(t.description,500),'currency','PKR','recognitionEvidence',null,'cashMovement',jsonb_build_object('kind','bank_transaction','transactionId',t.id),'reversalOfId',null,'reversalReason',null,'lines',v_lines);
 note_id:=gen_random_uuid();perform public.chat_recognition_note(p_workspace_id,note_id,rid,p_reason,t.date,t.amount_minor);
 note:=jsonb_build_object('kind','manual_note','noteId',note_id,'locator',jsonb_build_object('kind','owner_decision','decisionId',rid,'field','service_date'));
 cmd:=cmd||jsonb_build_object('recognitionEvidence',jsonb_build_object('basis','correction','date',t.date,'source',note,'reviewDecisionId',rid));
 perform public.post_workspace_ledger_journal(p_workspace_id,cmd,jsonb_build_array(jsonb_build_object('kind','bank_transaction','id',t.id),jsonb_build_object('kind','manual_note','id',note_id,'locator',note->'locator')));
end $$;
revoke all on function public.chat_post_cash(uuid,uuid,uuid,text) from public,anon,authenticated;
create function public.decide_chat_changes(p_workspace_id uuid,p_message_id uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare subject text:=(select auth.jwt()->>'sub'); m public.chat_messages%rowtype; t public.transactions%rowtype; v jsonb; a jsonb; ids jsonb:='[]'; source_id uuid; n integer:=1; before_value jsonb; financial boolean; user_text text; command jsonb; src jsonb;
begin
 perform 1 from public.workspaces where id=p_workspace_id and owner_subject=subject and coalesce(subject,'')<>'' for update;
 if not found then raise exception using errcode='P0002',message='Workspace not found'; end if;
 select * into m from public.chat_messages where id=p_message_id and workspace_id=p_workspace_id and role='assistant' for update;
 if not found or m.plan is null then raise exception using errcode='P0002',message='Change proposal not found'; end if;
 if p_decision not in ('apply','discard') or p_decision is null then raise exception using errcode='22023',message='Invalid decision'; end if;
 if m.state='applied' and p_decision='apply' then return jsonb_build_object('workspaceId',p_workspace_id,'message',public.chat_message_json(m.id),'duplicate',true); end if;
 if m.state='discarded' and p_decision='discard' then return jsonb_build_object('workspaceId',p_workspace_id,'message',public.chat_message_json(m.id),'duplicate',true); end if;
 if m.state<>'pending' then raise exception using errcode='PT409',message='Proposal already decided'; end if;
 if p_decision='discard' then update public.chat_messages set state='discarded' where id=m.id;
 else
  if jsonb_array_length(m.plan->'actions') not between 1 and 10 then raise exception using errcode='22023',message='Invalid actions'; end if;
  select text into user_text from public.chat_messages where workspace_id=p_workspace_id and request_id=m.request_id and role='user';
  user_text:=coalesce(m.plan->>'originalText',user_text);
  for a in select value from jsonb_array_elements(m.plan->'actions') loop
   if a->>'kind'='post_journal' then
    command:=a->'journal';
    if (command->'cashMovement' is not null and command->'cashMovement'<>'null'::jsonb) or exists(select 1 from public.ledger_journals where workspace_id=p_workspace_id and id=(command->>'reversalOfId')::uuid and cash_movement is not null) then raise exception using errcode='22023',message='Cash statement corrections must use the versioned cashbook action'; end if;
    if exists(select 1 from public.workspace_payments where workspace_id=p_workspace_id and journal_id=(command->>'reversalOfId')::uuid) then raise exception using errcode='PT409',message='A linked payment needs an explicit settlement correction'; end if;src:='[]'::jsonb;
    if jsonb_array_length(command->'sources')<>1 or command->'sources'->0->>'kind'<>'manual_note' then raise exception using errcode='22023',message='A chat adjustment requires its confirmed note'; end if;
    perform public.chat_recognition_note(p_workspace_id,(command->'sources'->0->>'noteId')::uuid,(command->>'requestId')::uuid,user_text,(command->>'entryDate')::date,(select sum((value->>'debitMinor')::numeric)::bigint from jsonb_array_elements(command->'lines')));
    src:=jsonb_build_array(jsonb_build_object('kind','manual_note','id',command->'sources'->0->>'noteId','locator',command->'sources'->0->'locator'));
    perform public.post_workspace_ledger_journal(p_workspace_id,command-'sources',src);
    continue;
   end if;
   if a->>'kind' not in ('create_cash','edit_cash') then raise exception using errcode='22023',message='Unsupported action'; end if;
   v:=a->'values';
   if jsonb_typeof(v) is distinct from 'object' or v->>'date' !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' or v->>'date' is null or
    length(trim(coalesce(v->>'description',''))) not between 1 and 500 or v->>'direction' not in ('in','out') or v->>'direction' is null or
    v->>'amountMinor' !~ '^(0|[1-9][0-9]*)$' or v->>'amountMinor' is null or (v->>'amountMinor')::numeric>9223372036854775807 or
    length(coalesce(v->>'reference',''))>500 then raise exception using errcode='22023',message='Complete valid cash values required'; end if;
   if (v->>'date')::date::text<>v->>'date' then raise exception using errcode='22023',message='Invalid date'; end if;
   if a->>'kind'='create_cash' then
    if (select count(*) from public.transactions where workspace_id=p_workspace_id)>=50000 then raise exception using errcode='22023',message='Cashbook limit reached'; end if;
    if source_id is null then
     insert into public.sources(workspace_id,source_type,content_hash,storage_path,original_name,status)
      values(p_workspace_id,'manual_chat',encode(sha256(convert_to(m.id::text,'UTF8')),'hex'),p_workspace_id::text||'/chat/'||m.id::text,'Chat-entered history','complete') returning id into source_id;
    end if;
    n:=n+1;
    insert into public.transactions(workspace_id,source_id,source_type,source_row,original_values,date,original_description,description,direction,amount_minor,reference,category,category_status,review_version)
     values(p_workspace_id,source_id,'manual_chat',n,jsonb_build_array(user_text),(v->>'date')::date,user_text,v->>'description',v->>'direction',(v->>'amountMinor')::bigint,v->>'reference',v->>'category',case when v->>'category' is null then 'needs_review' else 'accepted' end,1) returning * into t;
    before_value:=jsonb_build_object('origin','manual_chat','messageId',m.id);
    financial:=true;
   else
    select * into t from public.transactions where id=(a->>'transactionId')::uuid and workspace_id=p_workspace_id for update;
    if not found then raise exception using errcode='P0002',message='Transaction not found'; end if;
    if (a->>'expectedVersion') is null or t.review_version<>(a->>'expectedVersion')::integer then raise exception using errcode='PT409',message='Transaction changed'; end if;
    before_value:=jsonb_build_object('date',t.date,'description',t.description,'direction',t.direction,'amountMinor',t.amount_minor::text,'reference',t.reference,'category',t.category,'categoryStatus',t.category_status);
    financial:=(t.date<>(v->>'date')::date or t.direction<>v->>'direction' or t.amount_minor<>(v->>'amountMinor')::bigint or a->>'counterAccountId' is not null);
    if financial and exists(select 1 from public.workspace_payments where workspace_id=p_workspace_id and transaction_id=t.id) then raise exception using errcode='PT409',message='A linked payment needs an explicit settlement correction'; end if;
    if financial and exists(select 1 from public.accepted_matches where transaction_id=t.id and active) then raise exception using errcode='PT409',message='Undo the accepted match before changing cash values'; end if;
    update public.transactions set date=(v->>'date')::date,description=v->>'description',direction=v->>'direction',amount_minor=(v->>'amountMinor')::bigint,reference=v->>'reference',category=v->>'category',category_status=case when v->>'category' is null then 'needs_review' else 'accepted' end,review_version=review_version+1 where id=t.id returning * into t;
   end if;
   insert into public.transaction_reviews(workspace_id,transaction_id,actor_subject,previous_value,current_value,version)
     values(p_workspace_id,t.id,subject,before_value,v||jsonb_build_object('origin','chat','messageId',m.id,'categoryStatus',t.category_status),t.review_version);
   if financial then perform public.chat_post_cash(p_workspace_id,t.id,(a->>'counterAccountId')::uuid,left(user_text,1000)); end if;
   ids:=ids||jsonb_build_array(t.id);
  end loop;
  update public.chat_messages set state='applied',result=jsonb_build_object('transactionIds',ids,'actionCount',jsonb_array_length(m.plan->'actions'),'savedAt',now()) where id=m.id;
 end if;
 return jsonb_build_object('workspaceId',p_workspace_id,'message',public.chat_message_json(m.id),'duplicate',false);
end $$;
revoke all on function public.save_chat_exchange(uuid,uuid,uuid,text,text,jsonb),public.decide_chat_changes(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.save_chat_exchange(uuid,uuid,uuid,text,text,jsonb),public.decide_chat_changes(uuid,uuid,text) to authenticated;
create function public.confirm_chat_exchange(p_workspace_id uuid,p_conversation_id uuid,p_request_id uuid,p_message_id uuid,p_user_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.chat_messages where id=p_message_id and conversation_id=p_conversation_id and workspace_id=p_workspace_id) then raise exception using errcode='P0002',message='Proposal not found'; end if;
 result:=public.decide_chat_changes(p_workspace_id,p_message_id,'apply');
 return public.save_chat_exchange(p_workspace_id,p_conversation_id,p_request_id,p_user_text,'Changes saved. Your cashbook and ledger history are updated.',null);
end $$;
revoke all on function public.confirm_chat_exchange(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.confirm_chat_exchange(uuid,uuid,uuid,uuid,text) to authenticated;
-- Extend the deferred statement-origin guard without weakening its reversal checks.
create or replace function public.validate_ledger_entry_invariants() returns trigger language plpgsql security definer set search_path='' as $$
declare original public.ledger_journals%rowtype;
begin
  if new.cash_movement->>'kind'='bank_transaction' and not (exists(
    select 1 from public.transactions t join public.imports i on i.source_id=t.source_id and i.workspace_id=t.workspace_id
    cross join lateral jsonb_array_elements(i.confirmation_plan) plan
    join public.review_decisions d on d.target_id=i.source_id and d.source_row=t.source_row
      and d.workspace_id=i.workspace_id and d.target_kind='import_row' and d.action in ('accept','correct')
    join public.sources s on s.id=i.source_id and s.workspace_id=i.workspace_id and s.status='complete'
    where t.id=(new.cash_movement->>'transactionId')::uuid and t.workspace_id=new.workspace_id and i.status='confirmed'
      and (plan->>'rowNumber')::integer=t.source_row and plan->>'action' in ('import','correct')
  ) or exists(
    select 1 from public.transactions t join public.sources s on s.id=t.source_id and s.workspace_id=t.workspace_id
    join public.chat_messages m on m.workspace_id=t.workspace_id and m.id::text=split_part(s.storage_path,'/',3)
    where t.id=(new.cash_movement->>'transactionId')::uuid and t.workspace_id=new.workspace_id
      and t.source_type='manual_chat' and s.source_type='manual_chat' and s.status='complete'
      and m.state='applied' and m.role='assistant' and m.result->'transactionIds' ? t.id::text
  )) then
    raise exception using errcode='22023',message='Cash postings require a confirmed statement row or owner-confirmed chat history';
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
-- Keep old view columns stable; append source type for honest manual provenance.
create or replace view public.cashbook_records with(security_invoker=true) as
 select t.id,t.workspace_id,t.source_id,t.source_row,t.date,t.original_description,t.description,t.direction,t.amount_minor::text as amount_minor,t.currency,t.reference,t.category,t.category_status,t.review_version,
 case when exists(select 1 from public.accepted_matches m where m.transaction_id=t.id and m.active) then 'accepted'
 when exists(select 1 from public.ai_proposals p join public.supporting_documents d on d.id=p.document_id where p.transaction_id=t.id and p.kind='match' and p.status in ('proposed','needs_review') and p.transaction_version=t.review_version and p.document_version=d.review_version and d.review_status='accepted') then 'proposed' else 'unmatched' end as match_status,
 t.source_type
 from public.transactions t;
commit;
