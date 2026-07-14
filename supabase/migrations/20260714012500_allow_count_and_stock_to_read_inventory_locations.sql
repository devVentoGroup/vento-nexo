drop policy if exists inventory_locations_select_permission on public.inventory_locations;

create policy inventory_locations_select_permission
on public.inventory_locations
for select
to authenticated
using (
  public.has_permission('nexo.inventory.locations', site_id)
  or public.has_permission('nexo.inventory.withdraw', site_id)
  or public.has_permission('nexo.inventory.stock', site_id)
  or public.has_permission('nexo.inventory.counts', site_id)
);
