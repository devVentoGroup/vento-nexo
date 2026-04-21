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
  'TEST NEXO CP',
  'test-nexo-cp-root',
  'Categoria temporal para validacion reversible de inventario en Centro de Produccion.',
  9980,
  true,
  'INVENTORY',
  null,
  null,
  now()
where not exists (
  select 1
  from public.product_categories
  where slug = 'test-nexo-cp-root'
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
  'TEST NEXO CP Inventario',
  'test-nexo-cp-inventario',
  'Productos dummy reversibles para validar QR, stock y retiros en Centro de Produccion.',
  9981,
  true,
  'INVENTORY',
  root.id,
  null,
  now()
from public.product_categories root
where root.slug = 'test-nexo-cp-root'
  and root.site_id is null
  and not exists (
    select 1
    from public.product_categories
    where slug = 'test-nexo-cp-inventario'
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
    ('TEST NEXO CP Bodega principal', 'Producto dummy reversible para validar stock en Bodega principal.', 'TEST-NEXO-CP-001'),
    ('TEST NEXO CP Secos', 'Producto dummy reversible para validar stock en Secos.', 'TEST-NEXO-CP-002'),
    ('TEST NEXO CP Cuarto frio', 'Producto dummy reversible para validar stock en Cuarto frio.', 'TEST-NEXO-CP-003'),
    ('TEST NEXO CP Congelados', 'Producto dummy reversible para validar stock en Congelados.', 'TEST-NEXO-CP-004'),
    ('TEST NEXO CP Nevera produccion', 'Producto dummy reversible para validar stock en Nevera produccion.', 'TEST-NEXO-CP-005'),
    ('TEST NEXO CP Nevera despacho', 'Producto dummy reversible para validar stock en Nevera despacho.', 'TEST-NEXO-CP-006'),
    ('TEST NEXO CP Multi LOC', 'Producto dummy reversible para validar un mismo producto en Bodega principal y Secos.', 'TEST-NEXO-CP-007')
) as item(name, description, sku)
join public.product_categories category
  on category.slug = 'test-nexo-cp-inventario'
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
  'ingredient',
  'un',
  false,
  false,
  'count',
  'manual'
from public.products p
where p.sku like 'TEST-NEXO-CP-%'
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
cross join lateral (
  select id
  from public.sites
  where code = 'CENTRO_PROD'
  limit 1
) s
where p.sku like 'TEST-NEXO-CP-%'
on conflict (product_id, site_id) do update set
  is_active = true,
  audience = 'BOTH',
  updated_at = now();

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
      ('TEST-NEXO-CP-001', 'LOC-CP-BOD-MAIN', 10::numeric, 'TEST NEXO CP seed stock - Bodega principal'),
      ('TEST-NEXO-CP-002', 'LOC-CP-SECOS-MAIN', 10::numeric, 'TEST NEXO CP seed stock - Secos'),
      ('TEST-NEXO-CP-003', 'LOC-CP-FRIO-MAIN', 8::numeric, 'TEST NEXO CP seed stock - Cuarto frio'),
      ('TEST-NEXO-CP-004', 'LOC-CP-CONG-MAIN', 6::numeric, 'TEST NEXO CP seed stock - Congelados'),
      ('TEST-NEXO-CP-005', 'LOC-CP-N2P-MAIN', 4::numeric, 'TEST NEXO CP seed stock - Nevera produccion'),
      ('TEST-NEXO-CP-006', 'LOC-CP-N3P-MAIN', 3::numeric, 'TEST NEXO CP seed stock - Nevera despacho'),
      ('TEST-NEXO-CP-007', 'LOC-CP-BOD-MAIN', 5::numeric, 'TEST NEXO CP seed stock - Multi LOC tramo Bodega principal'),
      ('TEST-NEXO-CP-007', 'LOC-CP-SECOS-MAIN', 7::numeric, 'TEST NEXO CP seed stock - Multi LOC tramo Secos')
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
      ('TEST-NEXO-CP-001', 10::numeric),
      ('TEST-NEXO-CP-002', 10::numeric),
      ('TEST-NEXO-CP-003', 8::numeric),
      ('TEST-NEXO-CP-004', 6::numeric),
      ('TEST-NEXO-CP-005', 4::numeric),
      ('TEST-NEXO-CP-006', 3::numeric),
      ('TEST-NEXO-CP-007', 12::numeric)
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
      ('TEST-NEXO-CP-001', 'LOC-CP-BOD-MAIN', 10::numeric),
      ('TEST-NEXO-CP-002', 'LOC-CP-SECOS-MAIN', 10::numeric),
      ('TEST-NEXO-CP-003', 'LOC-CP-FRIO-MAIN', 8::numeric),
      ('TEST-NEXO-CP-004', 'LOC-CP-CONG-MAIN', 6::numeric),
      ('TEST-NEXO-CP-005', 'LOC-CP-N2P-MAIN', 4::numeric),
      ('TEST-NEXO-CP-006', 'LOC-CP-N3P-MAIN', 3::numeric),
      ('TEST-NEXO-CP-007', 'LOC-CP-BOD-MAIN', 5::numeric),
      ('TEST-NEXO-CP-007', 'LOC-CP-SECOS-MAIN', 7::numeric)
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
