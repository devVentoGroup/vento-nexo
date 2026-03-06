-- Proveedores: solo propietarios y gerentes pueden crear, actualizar y eliminar.
-- Cualquier empleado sigue pudiendo leer (employees_read_suppliers).

drop policy if exists "suppliers_insert_origo_access" on public.suppliers;
drop policy if exists "suppliers_update_origo_access" on public.suppliers;
drop policy if exists "suppliers_delete_origo_access" on public.suppliers;

create policy "suppliers_insert_owner_manager" on public.suppliers
  for insert to authenticated
  with check (
    public.is_owner()
    or public.is_global_manager()
    or public.is_manager()
  );

create policy "suppliers_update_owner_manager" on public.suppliers
  for update to authenticated
  using (
    public.is_owner()
    or public.is_global_manager()
    or public.is_manager()
  )
  with check (
    public.is_owner()
    or public.is_global_manager()
    or public.is_manager()
  );

create policy "suppliers_delete_owner_manager" on public.suppliers
  for delete to authenticated
  using (
    public.is_owner()
    or public.is_global_manager()
    or public.is_manager()
  );
