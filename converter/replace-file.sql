alter table public.gd_files add column if not exists replaced_by uuid references public.gd_files(id);

create or replace function public.gd_publish_replacement(p_file uuid)
returns table(bucket text, path text)
language plpgsql security definer set search_path='' as $$
declare f public.gd_files; d public.gd_documents;
begin
 if not coalesce(public.gd_is_admin(),false) then raise exception 'Se requiere un administrador'; end if;
 select * into f from public.gd_files where id=p_file;
 select * into d from public.gd_documents where id=f.document_id and deleted_at is null for update;
 if d.id is null then raise exception 'Documento no disponible'; end if;
 select * into f from public.gd_files where id=p_file and state='ready';
 if f.id is null then raise exception 'El archivo ya fue reemplazado o todavía no está confirmado'; end if;
 if d.type='PRO' and (f.name !~* '\.(xlsx?|xlsm)$' or not exists(
   select 1 from public.gd_pdf_consultations p
   join storage.objects o on o.bucket_id='gd-vistas-pdf' and o.name=p.storage_path
   where p.source_id=f.id and p.version=f.version
   and p.storage_path=f.document_id::text||'/'||f.id::text||'/'||f.sha256||'.pdf'
 )) then return; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='gd-documentos' and o.name=f.storage_path)
 then raise exception 'El original no está disponible'; end if;
 if exists(select 1 from public.gd_files old where old.document_id=d.id and old.state='ready'
   and (old.created_at,old.id)>(f.created_at,f.id)
   and (d.type<>'PRO' or exists(select 1 from public.gd_pdf_consultations p where p.source_id=old.id)))
 then raise exception 'Ya existe un reemplazo posterior'; end if;
 update public.gd_files old set state='archived',replaced_by=f.id where old.document_id=d.id and old.state='ready'
   and (old.created_at,old.id)<(f.created_at,f.id);
 if found then
   insert into public.gd_audit(document_id,action,reason,actor)
   values(d.id,'Archivo vigente reemplazado',f.id::text,auth.uid());
 end if;
 update public.gd_documents set meta=jsonb_set(meta,'{version}',to_jsonb(f.version)),
   revision=revision+1,updated_at=now()
 where id=d.id and meta->>'version' is distinct from f.version;
 return query
 select o.bucket_id::text,o.name::text
 from public.gd_files old
 join storage.objects o on
   (o.bucket_id='gd-documentos' and o.name=old.storage_path)
   or (o.bucket_id='gd-vistas-pdf' and starts_with(o.name,old.document_id::text||'/'||old.id::text||'/'))
 where old.document_id=d.id and old.state='archived' and old.replaced_by is not null;
end;
$$;
revoke all on function public.gd_publish_replacement(uuid) from public,anon;
grant execute on function public.gd_publish_replacement(uuid) to authenticated;
