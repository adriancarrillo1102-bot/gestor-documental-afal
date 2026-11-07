CREATE OR REPLACE FUNCTION afal_import_trial.write_edits(p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c jsonb; k text; expected bigint; current_version bigint; result jsonb:='{}'::jsonb;
begin
 if coalesce(afal_import_trial.access_role(),'') not in ('manager','admin') then raise exception 'Sólo administradores pueden guardar' using errcode='42501'; end if; perform pg_advisory_xact_lock(2116120421);
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 100 or octet_length(p_changes::text)>1000000 then raise exception 'Lote AFAL no válido'; end if;
 for c in select value from jsonb_array_elements(p_changes) order by value->>'key' loop
  k:=c->>'key'; expected:=(c->>'version')::bigint;
  if k is null or length(k)>350 or k !~ '^(implementation:|attendance:|matrix:|agenda:|calendar-sessions:|portal-catalog$)' or expected is null or expected<0 or jsonb_typeof(c->'payload') is distinct from 'object' or result?k then raise exception 'Cambio AFAL no válido'; end if;
  if k='portal-catalog' and (c->'payload'->>'format' is distinct from 'afal-portal-catalog-1' or jsonb_typeof(c->'payload'->'rows') is distinct from 'array' or jsonb_typeof(c->'payload'->'mapping') is distinct from 'object') then raise exception 'Catálogo AFAL no válido' using errcode='PT422'; end if;
  if k like 'calendar-sessions:%' then
   if jsonb_typeof(c->'payload'->'sessions') is distinct from 'array'
      or (c->'payload')-'sessions'<>'{}'::jsonb
      or exists(select from jsonb_array_elements(c->'payload'->'sessions') s where coalesce(s->>'id','')='')
      or exists(select from jsonb_array_elements(c->'payload'->'sessions') s group by s->>'id' having count(*)>1)
   then raise exception 'Sesiones de calendario no válidas' using errcode='PT422'; end if;
  end if;
  if k like 'agenda:%' then
   if jsonb_typeof(substr(k,8)::jsonb) is distinct from 'array'
     or jsonb_array_length(substr(k,8)::jsonb)<>2
     or jsonb_typeof(c->'payload'->'agendaClosed') is distinct from 'boolean'
     or jsonb_typeof(c->'payload'->'closedParticipants') is distinct from 'array'
     or jsonb_typeof(c->'payload'->'agendaClosedAt') is distinct from 'string'
     or (c->'payload')-array['agendaClosed','closedParticipants','agendaClosedAt']<>'{}'::jsonb
   then raise exception 'Estado de agenda inválido' using errcode='PT422'; end if;
  end if;
  if k like 'matrix:%' then
   if not exists(select 1 from afal_import_trial.assignment_flows where id=substr(k,8))
      or c->'payload'='{}'::jsonb
      or exists(select 1 from jsonb_each(c->'payload') f where f.key not in ('mpNumber','macroOriginal','mpFinalNumber','macroFinal','processOriginal','processNumber','processFinal','procedureOriginal','procedureNumber','procedureFinal','implementationWave','status','completedDate','responsibleRole','responsibleName','documenterRole','documenterName','companionDocumenterRole','companionDocumenterName') or jsonb_typeof(f.value)<>'string' or length(f.value#>>'{}')>case when f.key in ('procedureNumber','mpNumber','mpFinalNumber','processNumber','completedDate') then 80 else 1000 end)
   then raise exception 'Campo de matriz no admitido' using errcode='PT422'; end if;
  end if;
  if k like 'implementation:%' then perform afal_import_trial.validate_implementation(c); end if; insert into afal_import_trial.edits(key,version,payload,actor) values(k,1,c->'payload',auth.uid())
  on conflict(key) do update set version=afal_import_trial.edits.version+1,payload=case when k like 'implementation:%' or k like 'matrix:%' then afal_import_trial.edits.payload || excluded.payload else excluded.payload end,actor=excluded.actor,updated_at=now()
  where afal_import_trial.edits.version=expected
  returning version into current_version;
  if current_version is null or current_version<>expected+1 then raise exception 'Otro guardado cambió este registro. Recarga AFAL antes de reintentar.' using errcode='PT409'; end if;
  result:=result||jsonb_build_object(k,current_version);
 end loop;
 return result;
end $function$
