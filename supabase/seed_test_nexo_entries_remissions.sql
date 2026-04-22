begin;

insert into public.product_categories (
  name,
  slug,
  description,
  display_order,
  is_active,
  domain,
  parent_id,
  site_id,
  updated_at
)
select
  'TEST NEXO OPS',
  'test-nexo-ops-root',
  'Categoria temporal para validar entradas y remisiones en NEXO.',
  9970,
  true,
  'INVENTORY',
  null,
  null,
  now()
where not exists (
  select 1
  from public.product_categories
  where slug = 'test-nexo-ops-root'
    and site_id is null
);

insert into public.product_categories (
  name,
  slug,
  description,
  display_order,
  is_active,
  domain,
  parent_id,
  site_id,
  updated_at
)
select
  'TEST NEXO OPS Inventario',
  'test-nexo-ops-inventario',
  'Productos dummy para validar entradas y remisiones.',
  9971,
  true,
  'INVENTORY',
  root.id,
  null,
  now()
from public.product_categories root
where root.slug = 'test-nexo-ops-root'
  and root.site_id is null
  and not exists (
    select 1
    from public.product_categories
    where slug = 'test-nexo-ops-inventario'
      and site_id is null
  );

insert into public.products (
  name,
  description,
  sku,
  price,
  cost,
  is_active,
  product_type,
  category_id,
  unit,
  stock_unit_code
)
select
  item.name,
  item.description,
  item.sku,
  0::numeric,
  0::numeric,
  true,
  'insumo',
  category.id,
  'un',
  'un'
from (
  values
    ('TEST NEXO OPS Entrada secos', 'Producto dummy para validar entradas en secos.', 'TEST-NEXO-OPS-ENT-001'),
    ('TEST NEXO OPS Entrada frio', 'Producto dummy para validar entradas en frio.', 'TEST-NEXO-OPS-ENT-002'),
    ('TEST NEXO OPS Remision bodega', 'Producto dummy para validar solicitud y preparacion desde bodega principal.', 'TEST-NEXO-OPS-REM-001'),
    ('TEST NEXO OPS Remision nevera', 'Producto dummy para validar solicitud y preparacion desde nevera de produccion.', 'TEST-NEXO-OPS-REM-002'),
    ('TEST NEXO OPS Remision multi LOC', 'Producto dummy para validar preparacion con mas de un LOC origen.', 'TEST-NEXO-OPS-REM-003')
) as item(name, description, sku)
join public.product_categories category
  on category.slug = 'test-nexo-ops-inventario'
 and category.site_id is null
where not exists (
  select 1
  from public.products existing
  where existing.sku = item.sku
);

insert into public.suppliers (
  name,
  is_active
)
select
  'TEST NEXO OPS Proveedor',
  true
where not exists (
  select 1
  from public.suppliers
  where name = 'TEST NEXO OPS Proveedor'
);

insert into public.product_inventory_profiles (
  product_id,
  track_inventory,
  inventory_kind,
  default_unit,
  lot_tracking,
  expiry_tracking,
  unit_family,
  costing_mode
)
select
  p.id,
  true,
  'ingredient',
  'un',
  false,
  false,
  'count',
  'manual'
from public.products p
where p.sku like 'TEST-NEXO-OPS-%'
on conflict (product_id) do update set
  track_inventory = excluded.track_inventory,
  inventory_kind = excluded.inventory_kind,
  default_unit = excluded.default_unit,
  lot_tracking = excluded.lot_tracking,
  expiry_tracking = excluded.expiry_tracking,
  unit_family = excluded.unit_family,
  costing_mode = excluded.costing_mode,
  updated_at = now();

insert into public.product_site_settings (
  product_id,
  site_id,
  is_active,
  default_area_kind,
  audience
)
select
  p.id,
  s.id,
  true,
  null,
  'BOTH'
from public.products p
join public.sites s
  on s.is_active = true
where p.sku like 'TEST-NEXO-OPS-%'
on conflict (product_id, site_id) do update set
  is_active = true,
  audience = 'BOTH',
  updated_at = now();

insert into public.product_suppliers (
  product_id,
  supplier_id,
  is_primary,
  purchase_pack_qty,
  purchase_pack_unit_code,
  purchase_price,
  purchase_price_net,
  purchase_price_includes_tax,
  purchase_tax_rate
)
select
  p.id,
  s.id,
  true,
  1,
  'un',
  case
    when p.sku = 'TEST-NEXO-OPS-ENT-001' then 1200
    when p.sku = 'TEST-NEXO-OPS-ENT-002' then 1800
    when p.sku = 'TEST-NEXO-OPS-REM-001' then 2200
    when p.sku = 'TEST-NEXO-OPS-REM-002' then 2600
    else 1400
  end,
  case
    when p.sku = 'TEST-NEXO-OPS-ENT-001' then 1200
    when p.sku = 'TEST-NEXO-OPS-ENT-002' then 1800
    when p.sku = 'TEST-NEXO-OPS-REM-001' then 2200
    when p.sku = 'TEST-NEXO-OPS-REM-002' then 2600
    else 1400
  end,
  false,
  0
from public.products p
cross join lateral (
  select id
  from public.suppliers
  where name = 'TEST NEXO OPS Proveedor'
  limit 1
) s
where p.sku like 'TEST-NEXO-OPS-%'
  and not exists (
    select 1
    from public.product_suppliers ps
    where ps.product_id = p.id
      and ps.supplier_id = s.id
  );

insert into public.inventory_movement_types (code, name, description, affects_stock)
values ('receipt_in', 'Entrada', 'Entrada de inventario por recepcion', 1)
on conflict (code) do nothing;

with seed_rows as (
  select
    site.id as site_id,
    loc.id as location_id,
    prod.id as product_id,
    seed.qty,
    seed.note
  from (
    values
      ('TEST-NEXO-OPS-REM-001', 'LOC-CP-BOD-MAIN', 18::numeric, 'TEST NEXO OPS seed stock - Remision bodega'),
      ('TEST-NEXO-OPS-REM-002', 'LOC-CP-N2P-MAIN', 9::numeric, 'TEST NEXO OPS seed stock - Remision nevera'),
      ('TEST-NEXO-OPS-REM-003', 'LOC-CP-BOD-MAIN', 7::numeric, 'TEST NEXO OPS seed stock - Remision multi tramo bodega'),
      ('TEST-NEXO-OPS-REM-003', 'LOC-CP-SECOS1-MAIN', 5::numeric, 'TEST NEXO OPS seed stock - Remision multi tramo secos')
  ) as seed(sku, location_code, qty, note)
  join public.products prod
    on prod.sku = seed.sku
  join public.inventory_locations loc
    on loc.code = seed.location_code
  cross join lateral (
    select id
    from public.sites
    where code = 'CENTRO_PROD'
    limit 1
  ) site
)
insert into public.inventory_movements (
  site_id,
  product_id,
  movement_type,
  quantity,
  note,
  created_at,
  input_qty,
  input_unit_code,
  conversion_factor_to_stock,
  stock_unit_code,
  unit_cost,
  line_total_cost
)
select
  site_id,
  product_id,
  'receipt_in',
  qty,
  note,
  now(),
  qty,
  'un',
  1,
  'un',
  0,
  0
from seed_rows;

with site_rows as (
  select
    site.id as site_id,
    prod.id as product_id,
    sum(seed.qty) as qty
  from (
    values
      ('TEST-NEXO-OPS-REM-001', 18::numeric),
      ('TEST-NEXO-OPS-REM-002', 9::numeric),
      ('TEST-NEXO-OPS-REM-003', 12::numeric)
  ) as seed(sku, qty)
  join public.products prod
    on prod.sku = seed.sku
  cross join lateral (
    select id
    from public.sites
    where code = 'CENTRO_PROD'
    limit 1
  ) site
  group by site.id, prod.id
)
insert into public.inventory_stock_by_site (site_id, product_id, current_qty, updated_at)
select site_id, product_id, qty, now()
from site_rows
on conflict (site_id, product_id) do update
set current_qty = public.inventory_stock_by_site.current_qty + excluded.current_qty,
    updated_at = now();

with location_rows as (
  select
    loc.id as location_id,
    prod.id as product_id,
    seed.qty
  from (
    values
      ('TEST-NEXO-OPS-REM-001', 'LOC-CP-BOD-MAIN', 18::numeric),
      ('TEST-NEXO-OPS-REM-002', 'LOC-CP-N2P-MAIN', 9::numeric),
      ('TEST-NEXO-OPS-REM-003', 'LOC-CP-BOD-MAIN', 7::numeric),
      ('TEST-NEXO-OPS-REM-003', 'LOC-CP-SECOS1-MAIN', 5::numeric)
  ) as seed(sku, location_code, qty)
  join public.products prod
    on prod.sku = seed.sku
  join public.inventory_locations loc
    on loc.code = seed.location_code
)
insert into public.inventory_stock_by_location (location_id, product_id, current_qty, updated_at)
select location_id, product_id, qty, now()
from location_rows
on conflict (location_id, product_id) do update
set current_qty = public.inventory_stock_by_location.current_qty + excluded.current_qty,
    updated_at = now();

commit;
