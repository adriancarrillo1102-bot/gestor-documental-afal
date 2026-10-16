-- El PDF final se conserva como vista privada del original, sin consumir otro registro/version.
create table public.gd_pdf_consultations(
 source_id uuid primary key references public.gd_files(id),
 storage_path text not null unique,
 version text not null,
 pdf_sha256 text not null check(pdf_sha256 ~ '^[a-f0-9]{64}$'),
 size bigint not null check(size between 1 and 31457280),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.gd_pdf_consultations enable row level security;
revoke all on public.gd_pdf_consultations from public,anon,authenticated;
grant select on public.gd_pdf_consultations to authenticated;
create policy gd_manual_pdf_read on public.gd_pdf_consultations for select to authenticated using((select public.gd_is_member()) and exists(select 1 from public.gd_files f join public.gd_documents d on d.id=f.document_id where f.id=source_id and f.state='ready' and d.deleted_at is null));
create policy gd_manual_pdf_upload on storage.objects for insert to authenticated with check(
 bucket_id='gd-vistas-pdf' and (select public.gd_is_admin()) and exists(
 select 1 from public.gd_files f join public.gd_documents d on d.id=f.document_id
 where d.type='PRO' and d.deleted_at is null and f.state='ready' and lower(f.name) not like '%.pdf'
 and storage.objects.name=f.document_id::text||'/'||f.id::text||'/'||f.sha256||'.pdf'
 ));
create function gd_private.finish_consultation(p_source uuid,p_hash text) returns void language plpgsql security definer set search_path='' as $$
declare f public.gd_files;path text;bytes bigint;
begin
 perform gd_private.require_member();
 select s.* into f from public.gd_files s join public.gd_documents d on d.id=s.document_id where s.id=p_source and s.state='ready' and d.deleted_at is null and d.type='PRO' and lower(s.name) not like '%.pdf';
 if f.id is null then raise exception 'Original de procedimiento no disponible';end if;
 perform 1 from public.gd_documents where id=f.document_id and deleted_at is null for update;
 if not found then raise exception 'Registro cancelado';end if;
 path=f.document_id::text||'/'||f.id::text||'/'||f.sha256||'.pdf';
 select (o.metadata->>'size')::bigint into bytes from storage.objects o where o.bucket_id='gd-vistas-pdf' and o.name=path and o.metadata->>'mimetype'='application/pdf';
 if bytes is null or bytes<1 or bytes>31457280 then raise exception 'El PDF no terminó de cargarse';end if;
 insert into public.gd_pdf_consultations(source_id,storage_path,version,pdf_sha256,size,created_by)
 values(f.id,path,f.version,p_hash,bytes,auth.uid()) on conflict(source_id) do nothing;
 if not exists(select 1 from public.gd_pdf_consultations where source_id=f.id and pdf_sha256=p_hash) then raise exception 'Esta versión ya tiene otro PDF final';end if;
 insert into public.gd_audit(document_id,action,reason,actor) values(f.document_id,'PDF final vinculado a versión original',f.id::text||' / v'||f.version,auth.uid());
end $$;
create function public.gd_finish_consultation(p_source uuid,p_hash text) returns void language sql security invoker set search_path='' as $$select gd_private.finish_consultation(p_source,p_hash)$$;
revoke all on function gd_private.finish_consultation(uuid,text),public.gd_finish_consultation(uuid,text) from public,anon;
grant execute on function gd_private.finish_consultation(uuid,text),public.gd_finish_consultation(uuid,text) to authenticated;
