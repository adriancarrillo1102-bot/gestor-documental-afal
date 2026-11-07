create table if not exists afal_import_trial.organization_directory (
 id text primary key,
 name text not null,
 parent_id text references afal_import_trial.organization_directory(id) deferrable initially deferred,
 role_name text not null,
 unit_name text not null default '',
 source_date date not null default date '2026-11-07',
 check (id<>parent_id)
);
alter table afal_import_trial.organization_directory enable row level security;
revoke all on afal_import_trial.organization_directory from public,anon,authenticated;

create or replace function public.afal_organization_read(p_offset integer default 0,p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or coalesce(afal_import_trial.access_role(),'') not in ('manager','admin','viewer') then
  raise exception 'Tu cuenta no tiene acceso a AFAL' using errcode='42501';
 end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>500 then
  raise exception 'Ventana de consulta no válida' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into result
 from (select id,name,parent_id,role_name,unit_name from afal_import_trial.organization_directory order by id offset p_offset limit p_limit) r;
 return jsonb_build_object('rows',result,'total',(select count(*) from afal_import_trial.organization_directory));
end $$;
revoke all on function public.afal_organization_read(integer,integer) from public,anon;
grant execute on function public.afal_organization_read(integer,integer) to authenticated;
