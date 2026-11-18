-- Explicit, reviewed unification. Existing flow histories remain on their source IDs.
create table if not exists afal_import_trial.unification_events (
 id uuid primary key,
 actor uuid not null,
 created_at timestamptz not null default now(),
 mode text not null check (mode in ('unify','rename')),
 destination text not null,
 source_ids text[] not null,
 before_state jsonb not null,
 final_state jsonb not null
);
alter table afal_import_trial.unification_events enable row level security;
revoke all on afal_import_trial.unification_events from public, anon, authenticated;

create or replace function afal_import_trial.procedure_identity_rows()
returns table(id text, code text, title text, document_id uuid, matrix_version bigint, implementation_version bigint)
language sql stable security definer set search_path='' as $$
 select b.id, coalesce(e.payload->>'procedureNumber',d.code,b.code),
   coalesce(e.payload->>'procedureFinal',b.title),n.document_id,
   coalesce(e.version,0),coalesce(i.version,0)
 from afal_import_trial.matrix_unification_base b
 left join afal_import_trial.edits e on e.key='matrix:'||b.id
 left join afal_import_trial.edits i on i.key='implementation:'||b.id
 left join afal_import_trial.procedure_nomenclatures n on n.flow_id=b.id
 left join public.gd_documents d on d.id=n.document_id and d.deleted_at is null
$$;
revoke all on function afal_import_trial.procedure_identity_rows() from public,anon,authenticated;

create or replace function public.afal_procedure_preview(p_ids text[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ids text[]; sources jsonb; documents jsonb; files jsonb; links jsonb; snapshot jsonb;
begin
 if afal_import_trial.access_role() is null then
  raise exception 'Acceso AFAL denegado' using errcode='42501';
 end if;
 if coalesce(cardinality(p_ids),0) not between 1 and 90
   or exists(select 1 from unnest(p_ids) s where not exists(select 1 from afal_import_trial.procedure_identity_rows() f where f.id=s)) then
  raise exception 'Selecciona procedimientos existentes' using errcode='PT422';
 end if;
 -- Include every origin of any existing final procedure selected by the user.
 select array_agg(distinct e.id order by e.id) into ids
 from afal_import_trial.procedure_identity_rows() e
 where e.id=any(p_ids) or exists (
  select 1 from afal_import_trial.procedure_identity_rows() s
  where s.id=any(p_ids) and s.code<>'' and s.title<>''
  and afal_import_trial.matrix_unification_identity(e.code)=afal_import_trial.matrix_unification_identity(s.code)
  and afal_import_trial.matrix_unification_identity(e.title)=afal_import_trial.matrix_unification_identity(s.title)
 ) or exists (
  select 1 from afal_import_trial.unification_events event
  join afal_import_trial.procedure_identity_rows() selected on selected.id=any(p_ids)
  where selected.id=any(event.source_ids) and e.id=any(event.source_ids)
   and e.code=event.final_state->>'code' and e.title=event.final_state->>'name'
   and selected.code=e.code and selected.title=e.title
 );
 if cardinality(ids)>90 then raise exception 'La selección supera 90 filas de origen' using errcode='PT422'; end if;
 select jsonb_agg(to_jsonb(e)||jsonb_build_object('matrix',coalesce(m.payload,'{}'),
   'implementation',coalesce(i.payload,'{}')) order by e.id) into sources
 from afal_import_trial.procedure_identity_rows() e
 left join afal_import_trial.edits m on m.key='matrix:'||e.id
 left join afal_import_trial.edits i on i.key='implementation:'||e.id
 where e.id=any(ids);
 select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') into documents
 from public.gd_documents d where d.deleted_at is null and (
  d.id in (select n.document_id from afal_import_trial.procedure_nomenclatures n where n.flow_id=any(ids))
  or (d.type='PRO' and d.code in (select e.code from afal_import_trial.procedure_identity_rows() e where e.id=any(ids)))
  or exists(select 1 from jsonb_array_elements_text(coalesce(d.meta->'procedureIds','[]')) r
    where r in (select p.id::text from public.gd_documents p where p.deleted_at is null and p.type='PRO'
     and (p.code in (select e.code from afal_import_trial.procedure_identity_rows() e where e.id=any(ids))
      or p.id in (select n.document_id from afal_import_trial.procedure_nomenclatures n where n.flow_id=any(ids)))))
 );
 select coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]') into files
 from public.gd_files f where f.document_id::text in (select d->>'id' from jsonb_array_elements(documents) d);
 select coalesce(jsonb_agg(to_jsonb(n) order by n.flow_id),'[]') into links
 from afal_import_trial.procedure_nomenclatures n
 where n.document_id::text in (select d->>'id' from jsonb_array_elements(documents) d);
 snapshot:=jsonb_build_object('ids',ids,'sources',sources,'documents',documents,'files',files,'links',links);
 return snapshot||jsonb_build_object('fingerprint',md5(snapshot::text));
end $$;
revoke all on function public.afal_procedure_preview(text[]) from public,anon;
grant execute on function public.afal_procedure_preview(text[]) to authenticated;

create or replace function public.afal_procedure_history()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if afal_import_trial.access_role() is null then raise exception 'Acceso AFAL denegado' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'destination',destination,'sourceIds',source_ids,
  'createdAt',created_at,'mode',mode,'before',jsonb_build_object('sources',
   (select jsonb_agg(jsonb_build_object('id',s->>'id','code',s->>'code','title',s->>'title'))
    from jsonb_array_elements(before_state->'sources') s)),
  'final',final_state-'request'-'versions') order by created_at)
  from afal_import_trial.unification_events),'[]');
end $$;
revoke all on function public.afal_procedure_history() from public,anon;
grant execute on function public.afal_procedure_history() to authenticated;

create or replace function public.afal_confirm_procedure(p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 preview jsonb; ids text[]; target text:=p_request->>'destination'; final_name text:=btrim(p_request->>'name');
 final_code text:=btrim(p_request->>'code'); lead_id text:=p_request->>'leadId'; companion_id text:=coalesce(p_request->>'companionId','');
 event_id uuid:=(p_request->>'requestId')::uuid; mode text:=p_request->>'mode'; existing afal_import_trial.unification_events;
 kept public.gd_documents; retired public.gd_documents; related public.gd_documents; doc jsonb; changes jsonb:='[]'; versions jsonb;
 source jsonb; signature text; team jsonb; old_ids uuid[]; related_ids jsonb; identity text; release_codes boolean:=coalesce((p_request->>'releaseCodes')::boolean,false);
begin
 if coalesce(afal_import_trial.access_role(),'') not in ('manager','admin') then
  raise exception 'Sólo administradores pueden confirmar' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(2116120421);
 select * into existing from afal_import_trial.unification_events where id=event_id;
 if found then
  if existing.actor<>auth.uid() or existing.final_state->'request' is distinct from (p_request-'fingerprint') then
   raise exception 'La solicitud ya se utilizó con otros datos' using errcode='PT409';
  end if;
  return jsonb_build_object('eventId',event_id,'versions',existing.final_state->'versions','replayed',true);
 end if;
 if mode is null or mode not in ('unify','rename') or final_name is null or length(final_name) not between 1 and 300
   or final_code is null or length(final_code)>80 then
  raise exception 'Define el nombre y el código final' using errcode='PT422';
 end if;
 select array_agg(value) into ids from jsonb_array_elements_text(p_request->'ids');
 preview:=public.afal_procedure_preview(ids);
 -- Lock only the involved document families, using the allocator's lock order.
 for identity in select distinct d.macro||'|'||d.type from public.gd_documents d
  where d.type='PRO' and d.id::text in (select x->>'id' from jsonb_array_elements(preview->'documents') x) order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended(identity,0));
 end loop;
 perform 1 from public.gd_documents d where d.id::text in
  (select x->>'id' from jsonb_array_elements(preview->'documents') x) order by d.id for update;
 preview:=public.afal_procedure_preview(ids);
 if preview->>'fingerprint' is distinct from p_request->>'fingerprint' then
  raise exception 'Cambió la arquitectura o el Gestor. Revisa de nuevo antes de confirmar.' using errcode='PT409';
 end if;
 select array_agg(value) into ids from jsonb_array_elements_text(preview->'ids');
 if target is null or not target=any(ids) or (mode='unify' and cardinality(ids)<2) then
  raise exception 'Selecciona un destino de los procedimientos que se integran' using errcode='PT422';
 end if;
 if not exists(select 1 from jsonb_array_elements(preview->'sources') s where s->>'code'=final_code) then
  raise exception 'Elige uno de los códigos de origen' using errcode='PT422';
 end if;
 if cardinality(ids)>1 and (not exists(select 1 from afal_import_trial.assignment_people where id=lead_id)
  or (companion_id<>'' and (companion_id=lead_id or not exists(select 1 from afal_import_trial.assignment_people where id=companion_id)))) then
  raise exception 'Confirma el documentador titular y un acompañante distinto si corresponde' using errcode='PT422';
 end if;
 if exists(select 1 from afal_import_trial.procedure_identity_rows() e where not e.id=any(ids)
  and ((final_code<>'' and afal_import_trial.matrix_unification_identity(e.code)=afal_import_trial.matrix_unification_identity(final_code))
    or afal_import_trial.matrix_unification_identity(e.title)=afal_import_trial.matrix_unification_identity(final_name))) then
  raise exception 'Existe otro procedimiento con ese código o nombre. Inclúyelo en la selección y revisa la unificación.' using errcode='PT422';
 end if;
 select * into kept from public.gd_documents where code=final_code and type='PRO' and deleted_at is null;
 if exists(select 1 from jsonb_array_elements(preview->'documents') d where d->>'type'='PRO' and d->>'code'<>final_code) and kept.id is null then
  raise exception 'El código elegido debe tener registro en el Gestor para reasignar los documentos de origen' using errcode='PT422';
 end if;
 if exists(select 1 from jsonb_array_elements(preview->'files') f where f->>'state'='pending') then
  raise exception 'Hay una carga de archivo en curso. Termínala antes de confirmar.' using errcode='PT409';
 end if;
 if jsonb_array_length(preview->'files')>0 and not coalesce((p_request->>'acknowledgeFiles')::boolean,false) then
  raise exception 'Confirma la revisión de nomenclatura de los archivos' using errcode='PT422';
 end if;
 if exists(select 1 from jsonb_array_elements(preview->'links') n where not (n->>'flow_id')=any(ids)) then
  raise exception 'Un registro del Gestor está vinculado a otras filas de AFAL. Inclúyelas antes de confirmar.' using errcode='PT422';
 end if;
 select coalesce(array_agg((d->>'id')::uuid),'{}') into old_ids from jsonb_array_elements(preview->'documents') d
  where d->>'type'='PRO' and d->>'code'<>final_code;
 if exists(select 1 from afal_import_trial.procedure_identity_rows() e
  where not e.id=any(ids) and e.code in (select code from public.gd_documents where id=any(old_ids))) then
  raise exception 'Un código anterior todavía aparece en otras filas de AFAL. Inclúyelas antes de retirarlo.' using errcode='PT422';
 end if;
 -- Reassign related documents by ID, retaining every other existing association.
 for related in select * from public.gd_documents where deleted_at is null and exists(
  select 1 from jsonb_array_elements_text(coalesce(meta->'procedureIds','[]')) r where r::uuid=any(old_ids)) loop
  select jsonb_agg(x order by x) into related_ids from (
   select distinct case when r::uuid=any(old_ids) then kept.id::text else r end x
   from jsonb_array_elements_text(related.meta->'procedureIds') r
  ) associations;
  update public.gd_documents set meta=jsonb_set(meta,'{procedureIds}',related_ids),revision=revision+1,updated_at=now() where id=related.id;
  insert into public.gd_audit(document_id,action,reason,actor) values(related.id,'Vínculos reasignados por unificación',event_id::text,auth.uid());
 end loop;
 for retired in select * from public.gd_documents where id=any(old_ids) order by id loop
  update public.gd_documents set deleted_at=now(),delete_reason='Unificado en '||final_code,
    meta=meta||jsonb_build_object('unifiedInto',kept.id,'unificationEvent',event_id),revision=revision+1,updated_at=now() where id=retired.id;
  update public.gd_files set state='archived' where document_id=retired.id and state='ready';
  if release_codes then
   insert into public.gd_free(macro,type,number) values(retired.macro,retired.type,retired.number) on conflict do nothing;
  else
   delete from public.gd_free where macro=retired.macro and type=retired.type and number=retired.number;
  end if;
  insert into public.gd_audit(document_id,action,reason,actor) values(retired.id,
   case when release_codes then 'Unificado; número liberado' else 'Unificado; número reservado' end,final_code,auth.uid());
 end loop;
 if kept.id is not null then
  delete from public.gd_free where macro=kept.macro and type=kept.type and number=kept.number;
  update public.gd_documents set name=final_name,revision=revision+1,updated_at=now() where id=kept.id;
  insert into public.gd_audit(document_id,action,reason,actor) values(kept.id,'Identificación confirmada desde AFAL',event_id::text,auth.uid());
  insert into afal_import_trial.procedure_nomenclatures(flow_id,document_id) select unnest(ids),kept.id
   on conflict(flow_id) do update set document_id=excluded.document_id;
 end if;
 for source in select value from jsonb_array_elements(preview->'sources') loop
  changes:=changes||jsonb_build_array(jsonb_build_object('key','matrix:'||(source->>'id'),'version',(source->>'matrix_version')::bigint,
   'payload',jsonb_build_object('procedureNumber',final_code,'procedureFinal',final_name)));
 end loop;
 identity:='matrix-final:'||'['||to_json(afal_import_trial.matrix_unification_identity(final_code))::text||','||to_json(afal_import_trial.matrix_unification_identity(final_name))::text||']';
 if cardinality(ids)>1 then
  if final_code='' then identity:='explicit-final:'||event_id::text; end if;
  -- Match JavaScript's compact JSON signature.
  signature:='['||to_json(identity)::text||',['||(select string_agg(to_json(i)::text,',' order by i) from unnest(ids) i)||']]';
  team:=jsonb_build_object('signature',signature,'leadId',lead_id,'companionId',companion_id,'confirmedAt',now());
  if final_code<>'' then
   changes:=changes||jsonb_build_array(jsonb_build_object('key','implementation:'||target,'version',
    (select (s->>'implementation_version')::bigint from jsonb_array_elements(preview->'sources') s where s->>'id'=target),
    'operation','team','payload',jsonb_build_object('unifiedDocumentationTeam',team)));
  end if;
 end if;
 -- Retire a previous final-team confirmation if the destination changes.
 -- Its full payload remains in before_state and the source's documentation history.
 update afal_import_trial.edits set payload=jsonb_set(payload,'{unifiedDocumentationTeam,signature}',
   to_jsonb((payload->'unifiedDocumentationTeam'->>'signature')||'|retired:'||event_id::text)),
   version=version+1,updated_at=now(),actor=auth.uid()
 where key like 'implementation:%' and substr(key,16)=any(ids) and key<>'implementation:'||target
  and payload->'unifiedDocumentationTeam'->>'signature'=signature;
 versions:=afal_import_trial.write_edits(changes);
 if cardinality(ids)>1 and final_code='' then
  -- Explicit groups without an issued code have a stable event identity.
  insert into afal_import_trial.edits(key,version,payload,actor)
  values('implementation:'||target,1,jsonb_build_object('unifiedDocumentationTeam',team),auth.uid())
  on conflict(key) do update set version=afal_import_trial.edits.version+1,
   payload=afal_import_trial.edits.payload||excluded.payload,updated_at=now(),actor=auth.uid();
 end if;
 select versions||coalesce(jsonb_object_agg(key,version),'{}') into versions
 from afal_import_trial.edits where key like 'implementation:%' and substr(key,16)=any(ids);
 insert into afal_import_trial.unification_events(id,actor,mode,destination,source_ids,before_state,final_state)
 values(event_id,auth.uid(),mode,target,ids,preview,jsonb_build_object('name',final_name,'code',final_code,'leadId',lead_id,
  'companionId',companion_id,'releaseCodes',release_codes,'documentId',kept.id,'versions',versions,'request',p_request-'fingerprint'));
 return jsonb_build_object('eventId',event_id,'versions',versions,'changes',changes);
end $$;
revoke all on function public.afal_confirm_procedure(jsonb) from public,anon;
grant execute on function public.afal_confirm_procedure(jsonb) to authenticated;

-- A stale Gestor form must not attach a document to a procedure already retired.
create or replace function gd_private.check_procedure_references()
returns trigger language plpgsql set search_path='' as $$
declare reference text;
begin
 if new.deleted_at is not null or not (new.meta ? 'procedureIds') then return new; end if;
 if jsonb_typeof(new.meta->'procedureIds') is distinct from 'array' then
  raise exception 'Selecciona procedimientos válidos del catálogo' using errcode='PT422';
 end if;
 for reference in select distinct value from jsonb_array_elements_text(new.meta->'procedureIds') order by value loop
  perform 1 from public.gd_documents where id::text=reference and type='PRO' and deleted_at is null for share;
  if not found then raise exception 'Un procedimiento relacionado cambió o fue unificado. Actualiza el catálogo y vuelve a seleccionarlo.' using errcode='PT409'; end if;
 end loop;
 return new;
end $$;
revoke all on function gd_private.check_procedure_references() from public,anon,authenticated;
drop trigger if exists gd_procedure_references on public.gd_documents;
create trigger gd_procedure_references before insert or update of meta on public.gd_documents
 for each row execute function gd_private.check_procedure_references();
