create or replace function public.afal_document_alignment_catalog()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if afal_import_trial.access_role() is null then raise exception 'Acceso AFAL denegado' using errcode='42501'; end if;
 return jsonb_build_object('documents',coalesce((select jsonb_agg(jsonb_build_object(
  'id',id,'code',code,'name',name,'macro',macro,'revision',revision,'deletedAt',deleted_at) order by code,id)
  from public.gd_documents where type='PRO'),'[]'),
  'links',coalesce((select jsonb_agg(jsonb_build_object('flowId',flow_id,'documentId',document_id))
   from afal_import_trial.procedure_nomenclatures),'[]'),'checkedAt',now());
end $$;
revoke all on function public.afal_document_alignment_catalog() from public,anon;
grant execute on function public.afal_document_alignment_catalog() to authenticated;

create or replace function public.afal_alignment_preview(p_ids text[],p_document uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare architecture jsonb; document jsonb; files jsonb; ids text[]; snapshot jsonb;
begin
 architecture:=public.afal_procedure_preview(p_ids);
 if p_document is not null then
  select to_jsonb(d) into document from public.gd_documents d where id=p_document and type='PRO' and deleted_at is null;
  if document is null then raise exception 'El procedimiento del Gestor cambió o está retirado. Actualiza la comparación.' using errcode='PT409'; end if;
  select array_agg(distinct id order by id) into ids from (
   select value id from jsonb_array_elements_text(architecture->'ids')
   union select flow_id from afal_import_trial.procedure_nomenclatures where document_id=p_document
  ) sources;
  architecture:=public.afal_procedure_preview(ids);
  if exists(select 1 from jsonb_array_elements(architecture->'sources') s
    join public.gd_documents d on d.id::text=s->>'document_id'
    where d.deleted_at is null and d.id<>p_document) then
   raise exception 'La selección ya está vinculada a otro registro vigente del Gestor. Revisa los procedimientos desde Unificar procedimientos.' using errcode='PT422';
  end if;
  select coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]') into files from public.gd_files f where document_id=p_document;
 end if;
 snapshot:=jsonb_build_object('architecture',architecture,'document',document,'files',coalesce(files,'[]'));
 return snapshot||jsonb_build_object('fingerprint',md5(snapshot::text));
end $$;
revoke all on function public.afal_alignment_preview(text[],uuid) from public,anon;
grant execute on function public.afal_alignment_preview(text[],uuid) to authenticated;

create or replace function public.afal_confirm_alignment(p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 event_id uuid:=(p_request->>'requestId')::uuid; document_id uuid:=(p_request->>'documentId')::uuid;
 existing afal_import_trial.unification_events; preview jsonb; architecture jsonb; ids text[];
 final_code text:=upper(btrim(p_request->>'code')); final_name text:=btrim(p_request->>'name');
 code_parts text[]; final_macro text; final_number integer; old_document public.gd_documents;
 target text:=p_request->>'destination'; lead_id text:=p_request->>'leadId'; companion_id text:=coalesce(p_request->>'companionId','');
 scope text; source jsonb; changes jsonb:='[]'; versions jsonb; identity text; signature text;
 release_old boolean:=coalesce((p_request->>'releaseOldCode')::boolean,false);
begin
 if coalesce(afal_import_trial.access_role(),'') not in ('manager','admin') then
  raise exception 'Sólo administradores pueden conciliar los registros' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(2116120421);
 select * into existing from afal_import_trial.unification_events where id=event_id;
 if found then
  if existing.actor<>auth.uid() or existing.final_state->'request' is distinct from p_request-'fingerprint' then
   raise exception 'La solicitud ya se utilizó con otros datos' using errcode='PT409';
  end if;
  return jsonb_build_object('versions',existing.final_state->'versions','replayed',true);
 end if;
 if final_name is null or length(final_name) not between 1 and 300 then raise exception 'Define el nombre final' using errcode='PT422'; end if;
 code_parts:=regexp_match(final_code,'^(.+)-PRO-([0-9]{3,9})$');
 if code_parts is null then raise exception 'Usa un código de procedimiento válido, por ejemplo GA-PS02-PRO-004' using errcode='PT422'; end if;
 final_macro:=code_parts[1]; final_number:=code_parts[2]::integer;
 if final_number<1 or final_code<>final_macro||'-PRO-'||lpad(final_number::text,greatest(3,length(final_number::text)),'0')
  or not exists(select 1 from public.gd_macros where id=final_macro) then
  raise exception 'El código no corresponde a una nomenclatura válida del Gestor' using errcode='PT422';
 end if;
 select * into old_document from public.gd_documents where id=document_id and type='PRO' and deleted_at is null;
 if not found then raise exception 'El registro del Gestor cambió. Actualiza la comparación.' using errcode='PT409'; end if;
 for scope in select distinct value from unnest(array[old_document.macro||'|PRO',final_macro||'|PRO']) value order by value loop
  perform pg_advisory_xact_lock(hashtextextended(scope,0));
 end loop;
 perform 1 from public.gd_documents where id=document_id for update;
 select array_agg(value) into ids from jsonb_array_elements_text(p_request->'ids');
 preview:=public.afal_alignment_preview(ids,document_id);
 if preview->>'fingerprint' is distinct from p_request->>'fingerprint' then
  raise exception 'Cambió AFAL o el Gestor. Actualiza la comparación antes de confirmar.' using errcode='PT409';
 end if;
 architecture:=preview->'architecture';
 select array_agg(value order by value) into ids from jsonb_array_elements_text(architecture->'ids');
 if target is null or not target=any(ids) then raise exception 'Selecciona un destino válido' using errcode='PT422'; end if;
 if cardinality(ids)>1 and (not exists(select 1 from afal_import_trial.assignment_people where id=lead_id)
  or (companion_id<>'' and (companion_id=lead_id or not exists(select 1 from afal_import_trial.assignment_people where id=companion_id)))) then
  raise exception 'Confirma al titular final y un acompañante distinto si corresponde' using errcode='PT422';
 end if;
 if exists(select 1 from public.gd_documents where type='PRO' and code=final_code and deleted_at is null and id<>document_id) then
  raise exception 'Ese código ya pertenece a otro registro del Gestor. Usa Unificar procedimientos para revisar ambos.' using errcode='PT422';
 end if;
 if exists(select 1 from afal_import_trial.procedure_identity_rows() e where not e.id=any(ids)
  and (afal_import_trial.matrix_unification_identity(e.code)=afal_import_trial.matrix_unification_identity(final_code)
   or afal_import_trial.matrix_unification_identity(e.title)=afal_import_trial.matrix_unification_identity(final_name))) then
  raise exception 'Existen otras filas de AFAL con esa identidad. Revisa su unificación antes de conciliar.' using errcode='PT422';
 end if;
 if exists(select 1 from jsonb_array_elements(preview->'files') f where f->>'state'='pending') then
  raise exception 'Hay una carga de archivo en curso. Termínala antes de conciliar.' using errcode='PT409';
 end if;
 if jsonb_array_length(preview->'files')>0 and not coalesce((p_request->>'acknowledgeFiles')::boolean,false) then
  raise exception 'Confirma la revisión del contenido de los archivos' using errcode='PT422';
 end if;
 update public.gd_documents set macro=final_macro,number=final_number,code=final_code,name=final_name,
  revision=revision+1,updated_at=now() where id=document_id;
 insert into public.gd_counters(macro,type,high) values(final_macro,'PRO',final_number)
  on conflict(macro,type) do update set high=greatest(public.gd_counters.high,excluded.high);
 delete from public.gd_free where macro=final_macro and type='PRO' and number=final_number;
 if old_document.code<>final_code then
  if release_old then
   insert into public.gd_free(macro,type,number) values(old_document.macro,'PRO',old_document.number) on conflict do nothing;
  else
   delete from public.gd_free where macro=old_document.macro and type='PRO' and number=old_document.number;
  end if;
 end if;
 insert into public.gd_audit(document_id,action,reason,actor) values(document_id,'Código y nombre conciliados con AFAL',
  old_document.code||' · '||old_document.name||' → '||final_code||' · '||final_name,auth.uid());
 insert into afal_import_trial.procedure_nomenclatures(flow_id,document_id) select unnest(ids),document_id
  on conflict(flow_id) do update set document_id=excluded.document_id;
 for source in select value from jsonb_array_elements(architecture->'sources') loop
  changes:=changes||jsonb_build_array(jsonb_build_object('key','matrix:'||(source->>'id'),
   'version',(source->>'matrix_version')::bigint,'payload',jsonb_build_object('procedureNumber',final_code,'procedureFinal',final_name)));
 end loop;
 if cardinality(ids)>1 then
  identity:='matrix-final:'||'['||to_json(afal_import_trial.matrix_unification_identity(final_code))::text||','||to_json(afal_import_trial.matrix_unification_identity(final_name))::text||']';
  signature:='['||to_json(identity)::text||',['||(select string_agg(to_json(id)::text,',' order by id) from unnest(ids) id)||']]';
  update afal_import_trial.edits set payload=jsonb_set(payload,'{unifiedDocumentationTeam,signature}',
   to_jsonb((payload->'unifiedDocumentationTeam'->>'signature')||'|retired:'||event_id::text)),version=version+1,updated_at=now(),actor=auth.uid()
   where key like 'implementation:%' and substr(key,16)=any(ids) and key<>'implementation:'||target
    and payload->'unifiedDocumentationTeam'->>'signature'=signature;
  changes:=changes||jsonb_build_array(jsonb_build_object('key','implementation:'||target,
   'version',(select (s->>'implementation_version')::bigint from jsonb_array_elements(architecture->'sources') s where s->>'id'=target),
   'operation','team','payload',jsonb_build_object('unifiedDocumentationTeam',jsonb_build_object('signature',signature,
    'leadId',lead_id,'companionId',companion_id,'confirmedAt',now()))));
 end if;
 versions:=afal_import_trial.write_edits(changes);
 insert into afal_import_trial.unification_events(id,actor,mode,destination,source_ids,before_state,final_state)
 values(event_id,auth.uid(),'rename',target,ids,architecture||jsonb_build_object('alignmentDocument',preview->'document'),
  jsonb_build_object('operation','alignment','name',final_name,'code',final_code,'documentId',document_id,
   'leadId',lead_id,'companionId',companion_id,'releaseCodes',release_old,'versions',versions,'request',p_request-'fingerprint'));
 return jsonb_build_object('versions',versions,'eventId',event_id);
end $$;
revoke all on function public.afal_confirm_alignment(jsonb) from public,anon;
grant execute on function public.afal_confirm_alignment(jsonb) to authenticated;
