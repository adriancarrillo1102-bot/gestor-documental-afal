-- Vistas derivadas: el Excel original y su registro no se modifican.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gd-vistas-pdf','gd-vistas-pdf',false,31457280,array['application/pdf'])
on conflict(id) do nothing;

create policy gd_pdf_member_read on storage.objects for select to authenticated
using (
 bucket_id='gd-vistas-pdf' and (select public.gd_is_member())
 and exists(
  select 1 from public.gd_files f join public.gd_documents d on d.id=f.document_id
  where f.state='ready' and d.deleted_at is null
   and f.document_id::text=(storage.foldername(storage.objects.name))[1]
   and f.id::text=(storage.foldername(storage.objects.name))[2]
   and f.sha256||'.pdf'=storage.filename(storage.objects.name)
 )
);
-- Sin políticas de INSERT, UPDATE o DELETE para clientes.
-- La función autenticada del servidor guarda las vistas PDF.
