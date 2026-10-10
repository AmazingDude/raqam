-- Registration must enforce the completed upload state at the database seam too.
-- HTTP validation is not sufficient because authenticated clients can call this RPC.
begin;

create or replace function public.register_supporting_document(p_source_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.sources%rowtype; d uuid; duplicate boolean;
begin
  select src.* into s from public.sources src join public.workspaces w on w.id = src.workspace_id
    where src.id = p_source_id and w.owner_subject = (select auth.jwt()->>'sub') and coalesce(w.owner_subject,'') <> ''
    for update of src;
  if not found then raise exception using errcode = 'P0002', message = 'Source not found'; end if;
  if s.source_type <> 'receipt_image' then raise exception using errcode = '22023', message = 'Image source required'; end if;
  if s.status <> 'complete' then raise exception using errcode = '22023', message = 'Receipt source is incomplete'; end if;
  perform 1 from public.workspaces where id = s.workspace_id for update;
  select id into d from public.supporting_documents where source_id = p_source_id;
  duplicate := found;
  if not duplicate then
    insert into public.supporting_documents(workspace_id, source_id) values (s.workspace_id, s.id) returning id into d;
  end if;
  return jsonb_build_object('record', public.raqam_document_record(d), 'duplicate', duplicate);
end $$;

revoke all on function public.register_supporting_document(uuid) from public, anon, authenticated;
grant execute on function public.register_supporting_document(uuid) to authenticated;

commit;
