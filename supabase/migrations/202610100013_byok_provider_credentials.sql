-- Owner-scoped BYOK provider credentials. Ciphertext is encrypted by the
-- application with BYOK_ENCRYPTION_KEY; database functions never decrypt it.
begin;

create table public.ai_provider_configs (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('gemini','openai','groq','claude')),
  key_ciphertext text not null check (length(key_ciphertext) between 1 and 4096),
  key_nonce text not null check (key_nonce ~ '^[A-Za-z0-9_-]{16,64}$'),
  key_tag text not null check (key_tag ~ '^[A-Za-z0-9_-]{16,64}$'),
  text_model text not null check (length(text_model) between 1 and 128),
  vision_model text not null check (length(vision_model) between 1 and 128),
  selected boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, provider)
);
create unique index ai_provider_one_selected_per_workspace
  on public.ai_provider_configs(workspace_id) where selected;

alter table public.ai_provider_configs enable row level security;
alter table public.ai_provider_configs force row level security;
create policy ai_provider_owner on public.ai_provider_configs to authenticated
  using (exists (select 1 from public.workspaces w where w.id=workspace_id and w.owner_subject=(select auth.jwt()->>'sub')))
  with check (exists (select 1 from public.workspaces w where w.id=workspace_id and w.owner_subject=(select auth.jwt()->>'sub')));
revoke all on public.ai_provider_configs from public, anon, authenticated;

create or replace function public.list_ai_provider_configs(p_workspace_id uuid)
returns table(provider text, selected boolean, text_model text, vision_model text, updated_at timestamptz)
language sql stable security definer set search_path=''
as $$
  select c.provider,c.selected,c.text_model,c.vision_model,c.updated_at
  from public.ai_provider_configs c join public.workspaces w on w.id=c.workspace_id
  where c.workspace_id=p_workspace_id and w.owner_subject=(select auth.jwt()->>'sub')
  order by c.provider;
$$;

create or replace function public.get_ai_provider_credential(p_workspace_id uuid,p_provider text)
returns table(provider text,key_ciphertext text,key_nonce text,key_tag text,text_model text,vision_model text,selected boolean)
language sql stable security definer set search_path=''
as $$
  select c.provider,c.key_ciphertext,c.key_nonce,c.key_tag,c.text_model,c.vision_model,c.selected
  from public.ai_provider_configs c join public.workspaces w on w.id=c.workspace_id
  where c.workspace_id=p_workspace_id and c.provider=p_provider and w.owner_subject=(select auth.jwt()->>'sub');
$$;

create or replace function public.save_ai_provider_credential(
  p_workspace_id uuid,p_provider text,p_key_ciphertext text,p_key_nonce text,p_key_tag text,p_text_model text,p_vision_model text
) returns void language plpgsql security definer set search_path=''
as $$
begin
  if not exists(select 1 from public.workspaces w where w.id=p_workspace_id and w.owner_subject=(select auth.jwt()->>'sub')) then
    raise exception 'workspace not found' using errcode='P0002';
  end if;
  insert into public.ai_provider_configs(workspace_id,provider,key_ciphertext,key_nonce,key_tag,text_model,vision_model)
  values(p_workspace_id,p_provider,p_key_ciphertext,p_key_nonce,p_key_tag,p_text_model,p_vision_model)
  on conflict(workspace_id,provider) do update set key_ciphertext=excluded.key_ciphertext,key_nonce=excluded.key_nonce,
    key_tag=excluded.key_tag,text_model=excluded.text_model,vision_model=excluded.vision_model,updated_at=now();
end;
$$;

create or replace function public.select_ai_provider(p_workspace_id uuid,p_provider text)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if not exists(select 1 from public.ai_provider_configs c join public.workspaces w on w.id=c.workspace_id
    where c.workspace_id=p_workspace_id and c.provider=p_provider and w.owner_subject=(select auth.jwt()->>'sub')) then
    raise exception 'provider not configured' using errcode='P0002';
  end if;
  update public.ai_provider_configs set selected=false where workspace_id=p_workspace_id and selected;
  update public.ai_provider_configs set selected=true,updated_at=now() where workspace_id=p_workspace_id and provider=p_provider;
end;
$$;

create or replace function public.delete_ai_provider_credential(p_workspace_id uuid,p_provider text)
returns void language plpgsql security definer set search_path=''
as $$
begin
  delete from public.ai_provider_configs c using public.workspaces w
    where c.workspace_id=p_workspace_id and c.provider=p_provider and w.id=c.workspace_id and w.owner_subject=(select auth.jwt()->>'sub');
end;
$$;

revoke all on function public.list_ai_provider_configs(uuid) from public,anon;
revoke all on function public.get_ai_provider_credential(uuid,text) from public,anon;
revoke all on function public.save_ai_provider_credential(uuid,text,text,text,text,text,text) from public,anon;
revoke all on function public.select_ai_provider(uuid,text) from public,anon;
revoke all on function public.delete_ai_provider_credential(uuid,text) from public,anon;
grant execute on function public.list_ai_provider_configs(uuid) to authenticated;
grant execute on function public.get_ai_provider_credential(uuid,text) to authenticated;
grant execute on function public.save_ai_provider_credential(uuid,text,text,text,text,text,text) to authenticated;
grant execute on function public.select_ai_provider(uuid,text) to authenticated;
grant execute on function public.delete_ai_provider_credential(uuid,text) to authenticated;

commit;
