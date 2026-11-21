-- Separation is an atomic operation; archived tracking never enters active hour totals.
create table if not exists afal_import_trial.procedure_separations(
 id uuid primary key,actor uuid not null,created_at timestamptz not null default now(),
 source_id text not null,source_ids text[] not null,remaining_anchor text not null,
 before_state jsonb not null,final_state jsonb not null
);
alter table afal_import_trial.procedure_separations enable row level security;
revoke all on afal_import_trial.procedure_separations from public,anon,authenticated;
create or replace function afal_import_trial.separation_preview(p_source text,p_anchor text)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare p jsonb;available jsonb;events jsonb;
begin
 if afal_import_trial.access_role() is null then raise exception 'Acceso AFAL denegado' using errcode='42501';end if;
 p:=public.afal_procedure_preview(array[p_source]);
 if jsonb_array_length(p->'ids')<2 or not (p->'ids')?p_anchor then raise exception 'Elige un procedimiento de una unificación vigente' using errcode='PT422';end if;
 if exists(select 1 from afal_import_trial.edits e where e.key like 'implementation:%' and substr(e.key,16)<>p_anchor and (p->'ids')?substr(e.key,16)
  and case when left(e.payload->'unifiedDocumentationTeam'->>'signature',1)='[' and right(e.payload->'unifiedDocumentationTeam'->>'signature',1)=']'
   then (e.payload->'unifiedDocumentationTeam'->>'signature')::jsonb->1=p->'ids' else false end) then
  raise exception 'Cambió el procedimiento de referencia. Recarga la ficha antes de separar.' using errcode='PT409';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'code',d.code,'name',d.name,'macro',d.macro,'revision',d.revision) order by d.code),'[]') into available
 from public.gd_documents d where d.type='PRO' and d.deleted_at is null
 and not exists(select 1 from afal_import_trial.procedure_identity_rows() e where e.document_id=d.id or (e.code<>'' and e.code=d.code));
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'sourceId',source_id,'createdAt',created_at) order by id),'[]') into events
 from afal_import_trial.procedure_separations where source_ids && array(select jsonb_array_elements_text(p->'ids'));
 return p||jsonb_build_object('sourceId',p_source,'anchor',p_anchor,'availableDocuments',available,'canRegister',public.gd_is_admin(),'priorSeparations',events,
 'separationFingerprint',md5(p::text||p_anchor||events::text));
end $fn$;
create or replace function afal_import_trial.separation_history()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if afal_import_trial.access_role() is null then raise exception 'Acceso AFAL denegado' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,'sourceId',source_id,'sourceIds',source_ids,
 'remainingAnchor',remaining_anchor,'before',jsonb_build_object('sources',before_state->'sources','tracking',before_state->'tracking','anchor',before_state->>'anchor'),
 'final',final_state-'request'-'versions') order by created_at) from afal_import_trial.procedure_separations),'[]');
end $fn$;
create or replace function afal_import_trial.confirm_separation(p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fn$

#variable_conflict use_column
declare
 event_id uuid:=(p_request->>'requestId')::uuid; source text:=p_request->>'sourceId';anchor text:=p_request->>'anchor';remaining text:=p_request->>'remainingAnchor';
 final_name text:=btrim(p_request->>'name');code_mode text:=p_request->>'codeMode';final_code text:='';
 new_lead text:=p_request->>'leadId';remaining_lead text:=p_request->>'remainingLeadId';companion text:=coalesce(p_request->>'companionId','');
 p jsonb;ids text[];rem_ids text[];old_code text;old_name text;old_anchor jsonb;effective jsonb;tracking jsonb:='{}';
 reset jsonb;team jsonb;group_signature text;identity text;edit_key text;patch jsonb;v bigint;versions jsonb:='{}';f_id text;related_id text;
 existing afal_import_trial.procedure_separations;document public.gd_documents;related public.gd_documents;
 new_doc uuid;macro text:=p_request->>'macro';retained_doc uuid;remaining_companion text:=coalesce(p_request->>'remainingCompanionId','');
 result jsonb;request_clean jsonb:=p_request-'fingerprint';
begin
 if coalesce(afal_import_trial.access_role(),'') not in ('admin','manager') then raise exception 'Sólo administradores pueden separar' using errcode='42501';end if;
 if octet_length(p_request::text)>2000000 then raise exception 'La revisión supera el límite permitido' using errcode='PT422';end if;
 perform pg_advisory_xact_lock(2116120421);
 select * into existing from afal_import_trial.procedure_separations where id=event_id;
 if found then
  if existing.actor<>auth.uid() or existing.final_state->'request' is distinct from request_clean then raise exception 'La solicitud ya fue utilizada' using errcode='PT409';end if;
  return jsonb_build_object('eventId',event_id,'versions',existing.final_state->'versions','replayed',true);
 end if;
 begin p:=afal_import_trial.separation_preview(source,anchor);
 exception when sqlstate 'PT422' then raise exception 'La unificación cambió o ya fue separada. Actualiza la revisión.' using errcode='PT409';end;
 for identity in select distinct family from (
  select d->>'macro'||'|PRO' family from jsonb_array_elements(p->'documents') d where d->>'type'='PRO'
  union select macro||'|PRO' where code_mode='new'
 ) families order by family loop perform pg_advisory_xact_lock(hashtextextended(identity,0));end loop;
 perform 1 from public.gd_documents d where d.id::text in (select x->>'id' from jsonb_array_elements(p->'documents')x)
  or (code_mode='existing' and d.id::text=p_request->>'documentId') order by d.id for update;
 p:=afal_import_trial.separation_preview(source,anchor);
 if p->>'separationFingerprint' is distinct from p_request->>'fingerprint' then raise exception 'Cambió la unificación o el Gestor. Revisa nuevamente antes de separar.' using errcode='PT409';end if;
 select array_agg(x order by x) into ids from jsonb_array_elements_text(p->'ids') x;
 select array_agg(x order by x) into rem_ids from unnest(ids) x where x<>source;
 if not remaining=any(rem_ids) or remaining is null or final_name is null or length(final_name) not between 1 and 300 or code_mode not in ('pending','existing','new') or code_mode is null then
  raise exception 'Define el origen, el destino restante, el nombre y el tratamiento del código' using errcode='PT422';end if;
 if not exists(select 1 from afal_import_trial.assignment_people where id=new_lead) or not exists(select 1 from afal_import_trial.assignment_people where id=remaining_lead)
 or (companion<>'' and (companion=new_lead or not exists(select 1 from afal_import_trial.assignment_people where id=companion)))
 or (remaining_companion<>'' and (remaining_companion=remaining_lead or not exists(select 1 from afal_import_trial.assignment_people where id=remaining_companion))) then
  raise exception 'Confirma los titulares y acompañantes válidos de ambos procedimientos' using errcode='PT422';end if;
 if not coalesce((p_request->>'acknowledge')::boolean,false) then raise exception 'Confirma el tratamiento del historial y los archivos' using errcode='PT422';end if;
 if exists(select 1 from afal_import_trial.procedure_identity_rows() e where e.id<>source and
  afal_import_trial.matrix_unification_identity(e.title)=afal_import_trial.matrix_unification_identity(final_name)) then
  raise exception 'El nombre independiente ya pertenece a otro procedimiento. Define un nombre distinto.' using errcode='PT422';end if;
 select s->>'code',s->>'title',nullif(s->>'document_id','')::uuid into old_code,old_name,retained_doc from jsonb_array_elements(p->'sources') s where s->>'id'=anchor;
 -- A baseline snapshot remains immutable. Archive the effective displayed tracking as well as authoritative overlay versions.
 if jsonb_typeof(p_request->'tracking') is distinct from 'object' or exists(select 1 from unnest(ids) id where jsonb_typeof(p_request->'tracking'->id) is distinct from 'object') then
  raise exception 'Falta el historial completo de los orígenes. Vuelve a abrir la revisión.' using errcode='PT422';end if;
 for f_id in select unnest(ids) loop
  select payload into patch from afal_import_trial.edits where key='implementation:'||f_id;
  effective:=(p_request->'tracking'->f_id)||coalesce(patch,'{}');
  effective:=jsonb_set(effective,'{sections}',coalesce(p_request->'tracking'->f_id->'sections','{}')||coalesce(patch->'sections','{}'));
  tracking:=tracking||jsonb_build_object(f_id,effective);
 end loop;
 old_anchor:=tracking->anchor;
 if exists(select 1 from jsonb_array_elements(p->'files') f where f->>'state'='pending') then raise exception 'Hay una carga en curso. Finalízala antes de separar.' using errcode='PT409';end if;
 if code_mode='existing' then
  select * into document from public.gd_documents where id=(p_request->>'documentId')::uuid and type='PRO' and deleted_at is null for update;
  if not found or document.revision is distinct from (p_request->>'documentRevision')::integer
   or not exists(select 1 from jsonb_array_elements(p->'availableDocuments') d where d->>'id'=document.id::text)
   or document.name is distinct from final_name then raise exception 'El código elegido ya cambió, está vinculado o su nombre no coincide. Actualiza la revisión.' using errcode='PT409';end if;
  new_doc:=document.id;final_code:=document.code;
 elsif code_mode='new' then
  if not public.gd_is_admin() then raise exception 'Generar nomenclatura requiere acceso de administrador del Gestor. Puedes dejar el código pendiente.' using errcode='42501';end if;
  if not exists(select 1 from public.gd_macros where id=macro) or coalesce(p_request->>'emissionDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Selecciona el macroproceso y la fecha de emisión del nuevo registro' using errcode='PT422';end if;
  perform (p_request->>'emissionDate')::date;
  new_doc:=gd_private.register(macro,'PRO',final_name,jsonb_build_object('version','01','date',p_request->>'emissionDate','wave',case when p_request->>'wave' ~ '^(Ola )?[0-9]+$' then to_jsonb(regexp_replace(p_request->>'wave','^Ola ','')::integer) when lower(p_request->>'wave')='piloto' then to_jsonb('Piloto'::text) else 'null'::jsonb end,'notes','Separado de una unificación AFAL; carga pendiente'),event_id);
  select code into final_code from public.gd_documents where id=new_doc;
 end if;
 if final_code<>'' and exists(select 1 from afal_import_trial.procedure_identity_rows() e where e.id<>source and e.code=final_code) then
  raise exception 'El código ya corresponde a otro procedimiento' using errcode='PT409';end if;
 if jsonb_typeof(coalesce(p_request->'relatedDocuments','[]')) is distinct from 'array' then raise exception 'Documentos relacionados inválidos' using errcode='PT422';end if;
 if new_doc is null and jsonb_array_length(coalesce(p_request->'relatedDocuments','[]'))>0 then raise exception 'Asigna un código antes de vincular documentos del Gestor' using errcode='PT422';end if;
 for related_id in select jsonb_array_elements_text(coalesce(p_request->'relatedDocuments','[]')) loop
  if not exists(select 1 from jsonb_array_elements(p->'documents') d where d->>'id'=related_id and d->>'type'<>'PRO') then raise exception 'Documento fuera de esta unificación' using errcode='PT422';end if;
  select * into related from public.gd_documents where id=related_id::uuid and deleted_at is null for update;
  if not found then raise exception 'Cambió un documento relacionado. Actualiza la revisión.' using errcode='PT409';end if;
  update public.gd_documents set meta=jsonb_set(meta,'{procedureIds}',(select jsonb_agg(distinct x) from jsonb_array_elements(coalesce(meta->'procedureIds','[]')||jsonb_build_array(new_doc::text))x)),revision=revision+1,updated_at=now() where id=related.id;
  insert into public.gd_audit(document_id,action,reason,actor) values(related.id,'Vinculado también al procedimiento separado',event_id::text,auth.uid());
 end loop;
 delete from afal_import_trial.procedure_nomenclatures where flow_id=source;
 if new_doc is not null then insert into afal_import_trial.procedure_nomenclatures(flow_id,document_id) values(source,new_doc);
  delete from public.gd_free where macro=document.macro and type='PRO' and number=document.number;
  insert into public.gd_audit(document_id,action,reason,actor) values(new_doc,'Vínculo por separación AFAL',event_id::text,auth.uid());end if;
 -- The old code, document, files and all other associations remain on the surviving group.
 for f_id in select unnest(ids) loop
  if f_id=source then patch:=jsonb_build_object('procedureNumber',final_code,'procedureFinal',final_name,'status','No Iniciado','completedDate','',
    'documenterName',coalesce(p_request->>'leadName',''),'documenterRole',coalesce(p_request->>'leadRole',''),
    'companionDocumenterName',coalesce(p_request->>'companionName',''),'companionDocumenterRole',coalesce(p_request->>'companionRole',''));
  else patch:=jsonb_build_object('documenterName',coalesce(p_request->>'remainingLeadName',''),'documenterRole',coalesce(p_request->>'remainingLeadRole',''),
    'companionDocumenterName',coalesce(p_request->>'remainingCompanionName',''),'companionDocumenterRole',coalesce(p_request->>'remainingCompanionRole',''));end if;
  edit_key:='matrix:'||f_id;
  insert into afal_import_trial.edits as edits(key,version,payload,actor) values(edit_key,1,patch,auth.uid())
   on conflict(key) do update set version=edits.version+1,payload=edits.payload||excluded.payload,actor=auth.uid(),updated_at=now() returning version into v;
  versions:=versions||jsonb_build_object(edit_key,v);
 end loop;
 reset:=jsonb_build_object('sections',(select jsonb_object_agg(x,'No iniciado') from unnest(array['cover','participants','definitions','policies','flowchart','procedure','relatedDocs','changeControl'])x),
  'sessions','{}'::jsonb,'sessionsByWave','{}'::jsonb,'sessionWaves','{}'::jsonb,'comments','[]'::jsonb,'team','','releasedBy','','completedDate','',
  'additionalCompanions','{}'::jsonb,'unifiedDocumentationTeam','{}'::jsonb,'separationId',event_id,'updatedAt',now());
 identity:='matrix-final:'||'['||to_json(afal_import_trial.matrix_unification_identity(old_code))::text||','||to_json(afal_import_trial.matrix_unification_identity(old_name))::text||']';
 if old_code='' then identity:='explicit-final:'||event_id::text;end if;
 group_signature:='['||to_json(identity)::text||',['||(select string_agg(to_json(i)::text,',' order by i) from unnest(rem_ids)i)||']]';
 team:=jsonb_build_object('signature',group_signature,'leadId',remaining_lead,'companionId',remaining_companion,'confirmedAt',now());
 for f_id in select unnest(ids) loop
  edit_key:='implementation:'||f_id;
  if f_id=source then patch:=reset;
  elsif f_id=remaining then patch:=old_anchor||jsonb_build_object('unifiedDocumentationTeam',case when cardinality(rem_ids)>1 then team else '{}'::jsonb end,'updatedAt',now());
  else patch:=jsonb_build_object('unifiedDocumentationTeam','{}'::jsonb);end if;
  insert into afal_import_trial.edits as edits(key,version,payload,actor) values(edit_key,1,patch,auth.uid())
   on conflict(key) do update set version=edits.version+1,payload=edits.payload||excluded.payload,actor=auth.uid(),updated_at=now() returning version into v;
  versions:=versions||jsonb_build_object(edit_key,v);
 end loop;
 update afal_import_trial.assignment_flows set anchor=case when id=source or cardinality(rem_ids)=1 then null else remaining end,
  signature=case when id=source or cardinality(rem_ids)=1 then null else group_signature end,lead=case when id=source then new_lead else remaining_lead end where id=any(ids);
 result:=jsonb_build_object('name',final_name,'code',final_code,'leadId',new_lead,'documentId',new_doc,'remainingName',old_name,'remainingCode',old_code,
  'remainingIds',rem_ids,'remainingLeadId',remaining_lead,'remainingKey',identity,'signature',group_signature,'relatedDocuments',coalesce(p_request->'relatedDocuments','[]'));
 insert into afal_import_trial.procedure_separations(id,actor,source_id,source_ids,remaining_anchor,before_state,final_state)
 values(event_id,auth.uid(),source,ids,remaining,p||jsonb_build_object('anchor',anchor,'tracking',tracking),result||jsonb_build_object('request',request_clean,'versions',versions));
 return jsonb_build_object('eventId',event_id,'versions',versions,'sourceId',source,'documentId',new_doc,'code',final_code);
end $fn$;
revoke all on function afal_import_trial.separation_preview(text,text),afal_import_trial.separation_history(),afal_import_trial.confirm_separation(jsonb) from public,anon;
grant execute on function afal_import_trial.separation_preview(text,text),afal_import_trial.separation_history(),afal_import_trial.confirm_separation(jsonb) to authenticated;
create or replace function public.afal_separation_preview(p_source text,p_anchor text) returns jsonb language sql stable security invoker set search_path='' as $fn$select afal_import_trial.separation_preview(p_source,p_anchor)$fn$;
create or replace function public.afal_separation_history() returns jsonb language sql stable security invoker set search_path='' as $fn$select afal_import_trial.separation_history()$fn$;
create or replace function public.afal_confirm_separation(p_request jsonb) returns jsonb language sql security invoker set search_path='' as $fn$select afal_import_trial.confirm_separation(p_request)$fn$;
revoke all on function public.afal_separation_preview(text,text),public.afal_separation_history(),public.afal_confirm_separation(jsonb) from public,anon;
grant execute on function public.afal_separation_preview(text,text),public.afal_separation_history(),public.afal_confirm_separation(jsonb) to authenticated;
