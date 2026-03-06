-- Conteo inicial / inventario físico: permisos para nexo.inventory.counts
-- El tipo de movimiento ya existe en la BD: initial_count (affects_stock=1).
-- El wizard de Conteo inicial usa movement_type='initial_count'.

-- Permitir que roles con nexo.inventory.counts, nexo.inventory.adjustments puedan insertar movimientos
-- (p. ej. initial_count, adjustment) y actualizar inventory_stock_by_site.
drop policy if exists "inventory_movements_insert_permission" on public.inventory_movements;
create policy "inventory_movements_insert_permission" on public.inventory_movements
  for insert to authenticated
  with check (
    public.has_permission('nexo.inventory.movements', site_id)
    or public.has_permission('nexo.inventory.counts', site_id)
    or public.has_permission('nexo.inventory.adjustments', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.production_batches', site_id)
  );

drop policy if exists "inventory_stock_insert_permission" on public.inventory_stock_by_site;
create policy "inventory_stock_insert_permission" on public.inventory_stock_by_site
  for insert to authenticated
  with check (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.counts', site_id)
    or public.has_permission('nexo.inventory.adjustments', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.production_batches', site_id)
  );

drop policy if exists "inventory_stock_update_permission" on public.inventory_stock_by_site;
create policy "inventory_stock_update_permission" on public.inventory_stock_by_site
  for update to authenticated
  using (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.counts', site_id)
    or public.has_permission('nexo.inventory.adjustments', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.production_batches', site_id)
  )
  with check (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.counts', site_id)
    or public.has_permission('nexo.inventory.adjustments', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.production_batches', site_id)
  );
