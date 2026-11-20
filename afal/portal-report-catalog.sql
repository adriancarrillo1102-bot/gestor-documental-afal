-- Read-only reporting source; no document or AFAL records are changed.
create or replace function afal_import_trial.report_document_catalog()
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
begin
 if afal_import_trial.access_role() is null then
  raise exception 'Acceso AFAL denegado' using errcode='42501';
 end if;
 return jsonb_build_object('checkedAt',now(),'documents',coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',d.id,'code',d.code,'name',d.name,'macro',d.macro,'type',d.type,'created_at',d.created_at,
   'meta',jsonb_build_object('wave',d.meta->'wave','owner',d.meta->'owner',
    'procedureIds',d.meta->'procedureIds','historicalDate',d.meta->'historicalDate',
    'historicalDateOrigin',d.meta->'historicalDateOrigin','historicalDateNeedsReview',d.meta->'historicalDateNeedsReview'),
   'hasFile',exists(select 1 from public.gd_files f where f.document_id=d.id and f.state='ready')
  ) order by d.code,d.id) from public.gd_documents d where d.deleted_at is null
 ),'[]'::jsonb),'links',coalesce((select jsonb_agg(jsonb_build_object('flowId',flow_id,'documentId',document_id))
 from afal_import_trial.procedure_nomenclatures),'[]'::jsonb));
end $function$;
revoke all on function afal_import_trial.report_document_catalog() from public,anon;
grant execute on function afal_import_trial.report_document_catalog() to authenticated;
create or replace function public.afal_report_document_catalog()
returns jsonb language sql stable security invoker set search_path=''
as $wrapper$ select afal_import_trial.report_document_catalog() $wrapper$;
revoke all on function public.afal_report_document_catalog() from public,anon;
grant execute on function public.afal_report_document_catalog() to authenticated;
