begin;

insert into public.inventory_movement_types (code, name, description, affects_stock)
values ('receipt_in', 'Entrada', 'Entrada de inventario por recepcion', 1)
on conflict (code) do nothing;

insert into public.site_supply_routes (requesting_site_id, fulfillment_site_id, is_active)
select sau.id, cp.id, true
from public.sites sau
cross join public.sites cp
where sau.code = 'SAUDO'
  and cp.code = 'CENTRO_PROD'
  and not exists (
    select 1
    from public.site_supply_routes r
    where r.requesting_site_id = sau.id
      and r.fulfillment_site_id = cp.id
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
  'SANDBOX V1',
  'sbx-v1-root',
  'Categorias temporales para validar NEXO v1 sin tocar datos reales.',
  9990,
  true,
  'INVENTORY',
  null,
  null,
  now()
where not exists (
  select 1
  from public.product_categories
  where slug = 'sbx-v1-root'
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
  child.name,
  child.slug,
  child.description,
  child.display_order,
  true,
  'INVENTORY',
  root.id,
  null,
  now()
from (
  values
    ('SANDBOX V1 Insumos', 'sbx-v1-insumos', 'Insumos temporales para pruebas v1.', 9991),
    ('SANDBOX V1 Preparaciones', 'sbx-v1-preparaciones', 'Preparaciones temporales para pruebas v1.', 9992),
    ('SANDBOX V1 Venta', 'sbx-v1-venta', 'Productos de venta temporales para pruebas v1.', 9993)
) as child(name, slug, description, display_order)
cross join lateral (
  select id
  from public.product_categories
  where slug = 'sbx-v1-root'
    and site_id is null
  limit 1
) root
where not exists (
  select 1
  from public.product_categories existing
  where existing.slug = child.slug
    and existing.site_id is null
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
  item.price,
  item.cost,
  true,
  item.product_type,
  category.id,
  'un',
  'un'
from (
  values
    ('SANDBOX V1 Harina normal', 'Producto temporal para Caso A de remisiones.', 'SBXV1-INS-001', 'insumo', 'sbx-v1-insumos', 0::numeric, 0::numeric),
    ('SANDBOX V1 Base blanca parcial', 'Producto temporal para Caso C de remisiones.', 'SBXV1-PRE-001', 'preparacion', 'sbx-v1-preparaciones', 0::numeric, 0::numeric),
    ('SANDBOX V1 Croissant multi loc', 'Producto temporal para Caso B de remisiones.', 'SBXV1-VTA-001', 'venta', 'sbx-v1-venta', 8500::numeric, 0::numeric),
    ('SANDBOX V1 Gaseosa normal', 'Producto temporal para Caso A de remisiones.', 'SBXV1-VTA-002', 'venta', 'sbx-v1-venta', 6000::numeric, 0::numeric)
) as item(name, description, sku, product_type, category_slug, price, cost)
join public.product_categories category
  on category.slug = item.category_slug
 and category.site_id is null
where not exists (
  select 1
  from public.products existing
  where existing.sku = item.sku
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
  case
    when p.product_type = 'venta' then 'finished'
    else 'ingredient'
  end,
  'un',
  false,
  false,
  'count',
  'manual'
from public.products p
where p.sku like 'SBXV1-%'
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
cross join public.sites s
where p.sku like 'SBXV1-%'
  and s.code in ('CENTRO_PROD', 'SAUDO')
on conflict (product_id, site_id) do update set
  is_active = true,
  audience = 'BOTH',
  updated_at = now();

insert into public.inventory_locations (
  site_id,
  code,
  zone,
  aisle,
  level,
  description,
  is_active,
  capacity_units,
  location_type,
  created_at,
  updated_at
)
select
  cp.id,
  loc.code,
  loc.zone,
  loc.aisle,
  loc.level,
  loc.description,
  true,
  100,
  'storage',
  now(),
  now()
from (
  values
    ('LOC-CP-SBX-A1-01', 'SBX-A', 'A1', '01', 'Sandbox v1 - picking principal'),
    ('LOC-CP-SBX-B1-01', 'SBX-B', 'B1', '01', 'Sandbox v1 - soporte multi loc'),
    ('LOC-CP-SBX-C1-01', 'SBX-C', 'C1', '01', 'Sandbox v1 - respaldo parcial')
) as loc(code, zone, aisle, level, description)
cross join lateral (
  select id
  from public.sites
  where code = 'CENTRO_PROD'
  limit 1
) cp
where not exists (
  select 1
  from public.inventory_locations existing
  where existing.code = loc.code
);

with seed_rows as (
  select cp.id as site_id, loc.id as location_id, prod.id as product_id, seed.qty, seed.note
  from (
    values
      ('SBXV1-INS-001', 'LOC-CP-SBX-A1-01', 12::numeric, 'SANDBOX V1 seed stock - Caso A harina'),
      ('SBXV1-VTA-002', 'LOC-CP-SBX-A1-01', 12::numeric, 'SANDBOX V1 seed stock - Caso A gaseosa'),
      ('SBXV1-VTA-001', 'LOC-CP-SBX-B1-01', 3::numeric, 'SANDBOX V1 seed stock - Caso B multi loc tramo 1'),
      ('SBXV1-VTA-001', 'LOC-CP-SBX-C1-01', 4::numeric, 'SANDBOX V1 seed stock - Caso B multi loc tramo 2'),
      ('SBXV1-PRE-001', 'LOC-CP-SBX-C1-01', 10::numeric, 'SANDBOX V1 seed stock - Caso C parcial')
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
  ) cp
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
  select site_id, prod.id as product_id, sum(qty) as qty
  from (
    values
      ('SBXV1-INS-001', 12::numeric),
      ('SBXV1-VTA-002', 12::numeric),
      ('SBXV1-VTA-001', 7::numeric),
      ('SBXV1-PRE-001', 10::numeric)
  ) as seed(sku, qty)
  join public.products prod
    on prod.sku = seed.sku
  cross join lateral (
    select id as site_id
    from public.sites
    where code = 'CENTRO_PROD'
    limit 1
  ) cp
  group by site_id, prod.id
)
insert into public.inventory_stock_by_site (site_id, product_id, current_qty, updated_at)
select site_id, product_id, qty, now()
from site_rows
on conflict (site_id, product_id) do update
set current_qty = public.inventory_stock_by_site.current_qty + excluded.current_qty,
    updated_at = now();

with location_rows as (
  select loc.id as location_id, prod.id as product_id, seed.qty
  from (
    values
      ('SBXV1-INS-001', 'LOC-CP-SBX-A1-01', 12::numeric),
      ('SBXV1-VTA-002', 'LOC-CP-SBX-A1-01', 12::numeric),
      ('SBXV1-VTA-001', 'LOC-CP-SBX-B1-01', 3::numeric),
      ('SBXV1-VTA-001', 'LOC-CP-SBX-C1-01', 4::numeric),
      ('SBXV1-PRE-001', 'LOC-CP-SBX-C1-01', 10::numeric)
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


