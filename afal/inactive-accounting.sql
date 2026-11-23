-- Status changes and their reporting wave are recorded in the same transaction as the matrix edit.
alter table afal_import_trial.matrix_unification_base add column if not exists implementation_wave text;
create table if not exists afal_import_trial.procedure_inactivations(
 flow_id text primary key,wave text not null,inactivated_at timestamptz,active boolean not null default true,
 basis text not null,history jsonb not null default '[]'::jsonb
);
alter table afal_import_trial.procedure_inactivations enable row level security;
revoke all on afal_import_trial.procedure_inactivations from public,anon,authenticated;
create or replace function afal_import_trial.track_inactivation()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare current_entry afal_import_trial.procedure_inactivations;next_wave text;inactive boolean;flow_key text;
begin
 if new.key not like 'matrix:%' then return new;end if;
 flow_key:=substr(new.key,8);inactive:=lower(coalesce(new.payload->>'status',''))='inactivo';
 select * into current_entry from afal_import_trial.procedure_inactivations where flow_id=flow_key;
 next_wave:=coalesce(nullif(btrim(new.payload->>'implementationWave'),''),nullif(current_entry.wave,'Sin ola'),(select implementation_wave from afal_import_trial.matrix_unification_base where matrix_unification_base.id=flow_key),'Sin ola');
 if inactive then
  if current_entry.flow_id is null then
   insert into afal_import_trial.procedure_inactivations(flow_id,wave,inactivated_at,basis) values(flow_key,next_wave,now(),'status-change');
  elsif not current_entry.active then
   update afal_import_trial.procedure_inactivations set wave=next_wave,inactivated_at=now(),active=true,basis='status-change',
    history=history||jsonb_build_array(jsonb_build_object('action','reinactivated','at',now(),'previousWave',current_entry.wave,'previousAt',current_entry.inactivated_at)) where flow_id=flow_key;
  elsif next_wave<>current_entry.wave then
   update afal_import_trial.procedure_inactivations set wave=next_wave,
    history=history||jsonb_build_array(jsonb_build_object('action','wave-corrected','at',now(),'previousWave',current_entry.wave,'wave',next_wave)) where flow_id=flow_key;
  end if;
 elsif current_entry.active then
  update afal_import_trial.procedure_inactivations set active=false,history=history||jsonb_build_array(jsonb_build_object('action','reactivated','at',now(),'wave',current_entry.wave,'inactivatedAt',current_entry.inactivated_at)) where flow_id=flow_key;
 end if;
 return new;
end $fn$;
revoke all on function afal_import_trial.track_inactivation() from public,anon,authenticated;
drop trigger if exists afal_track_inactivation on afal_import_trial.edits;
create trigger afal_track_inactivation after insert or update of payload on afal_import_trial.edits for each row execute function afal_import_trial.track_inactivation();
create or replace function afal_import_trial.inactivation_ledger()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if afal_import_trial.access_role() is null then raise exception 'Acceso AFAL denegado' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('flowId',flow_id,'wave',wave,'at',inactivated_at,'active',active,'basis',basis) order by flow_id)
 from afal_import_trial.procedure_inactivations),'[]');
end $fn$;
revoke all on function afal_import_trial.inactivation_ledger() from public,anon;
grant execute on function afal_import_trial.inactivation_ledger() to authenticated;
create or replace function public.afal_inactivation_ledger() returns jsonb language sql stable security invoker set search_path='' as $fn$select afal_import_trial.inactivation_ledger()$fn$;
revoke all on function public.afal_inactivation_ledger() from public,anon;
grant execute on function public.afal_inactivation_ledger() to authenticated;
