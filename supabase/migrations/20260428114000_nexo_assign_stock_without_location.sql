begin;

insert into public.inventory_movement_types (code, name, description, affects_stock)
values (
  'stock_assign_location',
  'Asignacion a LOC',
  'Asigna stock existente de sede a un LOC operativo sin cambiar el total de sede',
  0
)
on conflict (code) do nothing;

drop policy if exists "inventory_movements_insert_permission" on public.inventory_movements;
create policy "inventory_movements_insert_permission" on public.inventory_movements
  for insert to authenticated
  with check (
    public.has_permission('nexo.inventory.movements', site_id)
    or public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.production_batches', site_id)
    or public.has_permission('nexo.inventory.entries', site_id)
    or public.has_permission('nexo.inventory.transfers', site_id)
    or public.has_permission('nexo.inventory.withdraw', site_id)
  );

commit;
