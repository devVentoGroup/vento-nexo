-- Allow create-only catalog writes for inventory operators (e.g. bodeguero)
-- without granting edit/delete on product master data.

-- products: allow INSERT if user has inventory stock permission in active site context.
drop policy if exists products_insert_inventory_operator on public.products;
create policy products_insert_inventory_operator
  on public.products
  for insert
  with check (
    public.has_permission('nexo.inventory.stock', public.current_employee_site_id())
  );

-- product inventory profile (used right after product creation).
drop policy if exists product_inventory_profiles_insert_inventory_operator on public.product_inventory_profiles;
create policy product_inventory_profiles_insert_inventory_operator
  on public.product_inventory_profiles
  for insert
  with check (
    public.has_permission('nexo.inventory.stock', public.current_employee_site_id())
  );

-- product suppliers: create-only for purchase setup on new products.
drop policy if exists product_suppliers_insert_inventory_operator on public.product_suppliers;
create policy product_suppliers_insert_inventory_operator
  on public.product_suppliers
  for insert
  with check (
    public.has_permission('nexo.inventory.stock', public.current_employee_site_id())
  );

-- product site settings: INSERT scoped by row site.
drop policy if exists product_site_settings_insert_inventory_operator on public.product_site_settings;
create policy product_site_settings_insert_inventory_operator
  on public.product_site_settings
  for insert
  with check (
    public.has_permission('nexo.inventory.stock', site_id)
  );

-- asset technical profile and event logs for new equipment creation.
drop policy if exists product_asset_profiles_insert_inventory_operator on public.product_asset_profiles;
create policy product_asset_profiles_insert_inventory_operator
  on public.product_asset_profiles
  for insert
  with check (
    public.has_permission('nexo.inventory.stock', public.current_employee_site_id())
  );

drop policy if exists product_asset_maintenance_events_insert_inventory_operator on public.product_asset_maintenance_events;
create policy product_asset_maintenance_events_insert_inventory_operator
  on public.product_asset_maintenance_events
  for insert
  with check (
    public.has_permission('nexo.inventory.stock', public.current_employee_site_id())
  );

drop policy if exists product_asset_transfer_events_insert_inventory_operator on public.product_asset_transfer_events;
create policy product_asset_transfer_events_insert_inventory_operator
  on public.product_asset_transfer_events
  for insert
  with check (
    public.has_permission('nexo.inventory.stock', public.current_employee_site_id())
  );
