create or replace function public.run_nexo_inventory_reset(p_confirm text default '')
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_expected constant text := 'RESET_NEXO_INVENTORY';
  v_deleted_products integer := 0;
  v_preserved_products integer := 0;
  r record;
begin
  if p_confirm <> v_expected then
    raise exception 'Confirmacion invalida. Ejecuta run_nexo_inventory_reset(''%s'') para continuar.', v_expected;
  end if;

  create temporary table if not exists tmp_preserve_products (
    product_id uuid primary key
  ) on commit drop;
  truncate table tmp_preserve_products;

  create temporary table if not exists tmp_reset_products (
    product_id uuid primary key
  ) on commit drop;
  truncate table tmp_reset_products;

  /*
    Preserve products used by Vento Pass reward redemption.
    - If loyalty_rewards.metadata stores product_id in known paths, keep those ids.
    - If metadata stores sku/code, keep products that match by sku.
  */
  if to_regclass('public.loyalty_rewards') is not null then
    insert into tmp_preserve_products(product_id)
    select distinct raw_product_id::uuid
    from (
      select trim(v.raw_value) as raw_product_id
      from public.loyalty_rewards lr
      cross join lateral (
        values
          (lr.metadata ->> 'product_id'),
          (lr.metadata ->> 'inventory_product_id'),
          (lr.metadata ->> 'catalog_product_id'),
          (lr.metadata ->> 'product_uuid'),
          (lr.metadata ->> 'productId'),
          (lr.metadata ->> 'product_id_uuid'),
          (lr.metadata -> 'product' ->> 'id'),
          (lr.metadata -> 'item' ->> 'product_id')
      ) as v(raw_value)
    ) candidates
    where raw_product_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    on conflict (product_id) do nothing;

    insert into tmp_preserve_products(product_id)
    select distinct p.id
    from public.products p
    join public.loyalty_rewards lr
      on lower(coalesce(p.sku, '')) in (
        lower(coalesce(lr.code, '')),
        lower(coalesce(lr.metadata ->> 'sku', '')),
        lower(coalesce(lr.metadata ->> 'product_sku', ''))
      )
    where p.sku is not null
      and btrim(p.sku) <> ''
    on conflict (product_id) do nothing;
  end if;

  /*
    Products to delete: everything in products except reward-redemption preserves.
    This leaves Nexo inventory fully clean.
  */
  insert into tmp_reset_products(product_id)
  select p.id
  from public.products p
  where not exists (
    select 1
    from tmp_preserve_products keep
    where keep.product_id = p.id
  );

  select count(*) into v_preserved_products from tmp_preserve_products;

  -- Inventory transactional cleanup.
  if to_regclass('public.inventory_movements') is not null then
    delete from public.inventory_movements;
  end if;
  if to_regclass('public.inventory_stock_by_location') is not null then
    delete from public.inventory_stock_by_location;
  end if;
  if to_regclass('public.inventory_stock_by_site') is not null then
    delete from public.inventory_stock_by_site;
  end if;
  if to_regclass('public.inventory_entry_items') is not null then
    delete from public.inventory_entry_items;
  end if;
  if to_regclass('public.inventory_entries') is not null then
    delete from public.inventory_entries;
  end if;
  if to_regclass('public.inventory_transfer_items') is not null then
    delete from public.inventory_transfer_items;
  end if;
  if to_regclass('public.inventory_transfers') is not null then
    delete from public.inventory_transfers;
  end if;
  if to_regclass('public.restock_request_items') is not null then
    delete from public.restock_request_items;
  end if;
  if to_regclass('public.restock_requests') is not null then
    delete from public.restock_requests;
  end if;
  if to_regclass('public.inventory_count_lines') is not null then
    delete from public.inventory_count_lines;
  end if;
  if to_regclass('public.inventory_count_sessions') is not null then
    delete from public.inventory_count_sessions;
  end if;
  if to_regclass('public.production_batches') is not null then
    delete from public.production_batches;
  end if;

  -- Cleanup all FK dependencies that point to products(id) for target product ids.
  for r in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      a.attname as column_name
    from pg_constraint fk
    join pg_class c
      on c.oid = fk.conrelid
    join pg_namespace n
      on n.oid = c.relnamespace
    join unnest(fk.conkey) with ordinality as ck(attnum, ord)
      on true
    join unnest(fk.confkey) with ordinality as rk(attnum, ord)
      on rk.ord = ck.ord
    join pg_attribute a
      on a.attrelid = fk.conrelid
     and a.attnum = ck.attnum
    where fk.contype = 'f'
      and fk.confrelid = 'public.products'::regclass
      and n.nspname = 'public'
      and array_length(fk.conkey, 1) = 1
  loop
    execute format(
      'delete from %I.%I where %I in (select product_id from tmp_reset_products)',
      r.schema_name,
      r.table_name,
      r.column_name
    );
  end loop;

  delete from public.products p
  using tmp_reset_products t
  where p.id = t.product_id;

  get diagnostics v_deleted_products = row_count;

  raise notice 'Inventory reset done. Deleted products: %, preserved reward products: %.',
    v_deleted_products,
    v_preserved_products;
end;
$$;

comment on function public.run_nexo_inventory_reset(text) is
  'Reset for Nexo inventory domain. Preserves products linked to Vento Pass reward redemption. Requires exact confirmation: RESET_NEXO_INVENTORY.';
