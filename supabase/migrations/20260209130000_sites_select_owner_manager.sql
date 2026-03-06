-- Propietarios y gerentes generales pueden ver todas las sedes.
-- Útil cuando employee_sites aún no está poblado o el usuario no tiene sedes asignadas.

create policy "sites_select_owner_manager"
  on public.sites
  for select
  to authenticated
  using (public.is_owner() or public.is_global_manager());
