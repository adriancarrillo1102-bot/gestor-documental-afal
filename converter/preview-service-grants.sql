-- Autorizado por el propietario para el convertidor privado de PDF.
-- No concede escritura en el catálogo ni acceso anónimo.
grant select on public.gd_members, public.gd_documents, public.gd_files to service_role;
grant insert on public.gd_audit to service_role;
