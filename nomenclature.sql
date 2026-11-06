create or replace function public.gd_assign_existing_code(
 p_id uuid, p_revision integer, p_code text, p_name text,
 p_meta jsonb, p_request uuid, p_reason text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
 parts text[];
 target_number integer;
 current_doc public.gd_documents;
 result_id uuid;
 old_lock bigint;
 target_lock bigint;
begin
 if auth.uid() is null or not coalesce(public.gd_is_general_admin(),false)
    or not coalesce(public.gd_is_member(),false) then
  raise exception 'Solo el Administrador general puede asignar una nomenclatura existente' using errcode='42501';
 end if;
 parts := pg_catalog.regexp_match(p_code,'^(GA-[A-Z]{2}[0-9]{2,3})-([A-Z0-9]+)-([0-9]{3,9})$');
 if parts is null or parts[3]::integer < 1 then
  raise exception 'Escribe un código válido, por ejemplo GA-PS01-PRO-022';
 end if;
 target_number := parts[3]::integer;
 if parts[3] <> lpad(target_number::text,greatest(3,length(target_number::text)),'0') then
  raise exception 'El código debe usar el formato de numeración del catálogo';
 end if;
 if length(coalesce(btrim(p_reason),'')) not between 3 and 500 then
  raise exception 'Indica un motivo de entre 3 y 500 caracteres';
 end if;
 target_lock := pg_catalog.hashtextextended(parts[1]||'|'||parts[2],0);
 if p_id is not null then
  select * into current_doc from public.gd_documents where id=p_id and deleted_at is null;
  if not found or current_doc.revision is distinct from p_revision then
   raise exception 'La ficha cambió. Vuelve a abrirla para continuar';
  end if;
  if (current_doc.type='PRO') <> (parts[2]='PRO') then
   raise exception 'La corrección debe conservar la clasificación como procedimiento o documento relacionado';
  end if;
  if current_doc.code=p_code then raise exception 'La nomenclatura ya es la misma'; end if;
  old_lock := pg_catalog.hashtextextended(current_doc.macro||'|'||current_doc.type,0);
  perform pg_catalog.pg_advisory_xact_lock(least(old_lock,target_lock));
  if old_lock<>target_lock then perform pg_catalog.pg_advisory_xact_lock(greatest(old_lock,target_lock)); end if;
 else
  if p_request is null then raise exception 'Falta el identificador de la solicitud'; end if;
  perform pg_catalog.pg_advisory_xact_lock(target_lock);
  select id into result_id from public.gd_documents where request_id=p_request;
  if found then return result_id; end if;
  perform gd_private.check_meta(p_meta);
 end if;
 if not exists(select 1 from public.gd_macros where id=parts[1])
    or not exists(select 1 from public.gd_types where id=parts[2]) then
  raise exception 'El macroproceso o tipo documental no existe en el catálogo';
 end if;
 if exists(select 1 from public.gd_documents where code=p_code and deleted_at is null) then
  raise exception 'El código % ya pertenece a otra ficha activa',p_code;
 end if;
 insert into public.gd_counters(macro,type,high) values(parts[1],parts[2],target_number)
 on conflict(macro,type) do update set high=greatest(public.gd_counters.high,excluded.high);
 delete from public.gd_free where macro=parts[1] and type=parts[2] and number=target_number;
 if p_id is null then
  insert into public.gd_documents(request_id,macro,type,number,code,name,meta,created_by)
  values(p_request,parts[1],parts[2],target_number,p_code,btrim(p_name),p_meta,auth.uid())
  returning id into result_id;
 else
  update public.gd_documents set macro=parts[1],type=parts[2],number=target_number,
   code=p_code,revision=revision+1,updated_at=now()
  where id=p_id and revision=p_revision and deleted_at is null returning id into result_id;
  if not found then raise exception 'La ficha cambió. Vuelve a abrirla para continuar'; end if;
  delete from public.gd_free where macro=current_doc.macro and type=current_doc.type and number=current_doc.number;
 end if;
 insert into public.gd_audit(document_id,action,reason,actor)
 values(result_id,case when p_id is null then 'Alta con código existente: '||p_code
                       else 'Nomenclatura corregida: '||current_doc.code||' → '||p_code end,
        btrim(p_reason),auth.uid());
 return result_id;
end;
$$;
revoke all on function public.gd_assign_existing_code(uuid,integer,text,text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.gd_assign_existing_code(uuid,integer,text,text,jsonb,uuid,text) to authenticated;
