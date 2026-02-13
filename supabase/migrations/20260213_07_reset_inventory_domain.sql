create or replace function public.run_nexo_inventory_reset(p_confirm text default '')
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_expected constant text := 'RESET_NEXO_INVENTORY';
begin
  if p_confirm <> v_expected then
    raise exception 'Confirmacion invalida. Ejecuta run_nexo_inventory_reset(''%s'') para continuar.', v_expected;
  end if;

  create temporary table if not exists tmp_reset_products (
    product_id uuid primary key
  ) on commit drop;

  truncate table tmp_reset_products;

  insert into tmp_reset_products(product_id)
  select distinct pip.product_id
  from public.product_inventory_profiles pip;

  delete from public.inventory_movements;
  delete from public.inventory_stock_by_location;
  delete from public.inventory_stock_by_site;

  delete from public.inventory_entry_items;
  delete from public.inventory_entries;

  delete from public.inventory_transfer_items;
  delete from public.inventory_transfers;

  delete from public.restock_request_items;
  delete from public.restock_requests;

  delete from public.inventory_count_lines;
  delete from public.inventory_count_sessions;

  delete from public.production_batches;

  delete from public.product_suppliers
  where product_id in (select product_id from tmp_reset_products);

  delete from public.product_site_settings
  where product_id in (select product_id from tmp_reset_products);

  delete from public.recipes
  where product_id in (select product_id from tmp_reset_products)
     or ingredient_product_id in (select product_id from tmp_reset_products);

  delete from public.recipe_steps
  where recipe_card_id in (
    select rc.id
    from public.recipe_cards rc
    where rc.product_id in (select product_id from tmp_reset_products)
  );

  delete from public.recipe_cards
  where product_id in (select product_id from tmp_reset_products);

  delete from public.product_inventory_profiles
  where product_id in (select product_id from tmp_reset_products);

  delete from public.products
  where id in (select product_id from tmp_reset_products);
end;
$$;

comment on function public.run_nexo_inventory_reset(text) is
  'Reset controlado del dominio de inventario Nexo. Requiere confirmacion exacta: RESET_NEXO_INVENTORY.';
