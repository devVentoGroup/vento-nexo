begin;

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

with missing_site_stock as (
  select cp.id as site_id, prod.id as product_id, seed.qty
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
    select id
    from public.sites
    where code = 'CENTRO_PROD'
    limit 1
  ) cp
)
insert into public.inventory_stock_by_site (site_id, product_id, current_qty, updated_at)
select site_id, product_id, qty, now()
from missing_site_stock
where not exists (
  select 1
  from public.inventory_stock_by_site existing
  where existing.site_id = missing_site_stock.site_id
    and existing.product_id = missing_site_stock.product_id
)
on conflict (site_id, product_id) do nothing;

with missing_loc_stock as (
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
from missing_loc_stock
where not exists (
  select 1
  from public.inventory_stock_by_location existing
  where existing.location_id = missing_loc_stock.location_id
    and existing.product_id = missing_loc_stock.product_id
)
on conflict (location_id, product_id) do nothing;

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
  cp.id,
  prod.id,
  'receipt_in',
  seed.qty,
  seed.note,
  now(),
  seed.qty,
  'un',
  1,
  'un',
  0,
  0
from (
  values
    ('SBXV1-INS-001', 12::numeric, 'SANDBOX V1 seed stock - Caso A harina'),
    ('SBXV1-VTA-002', 12::numeric, 'SANDBOX V1 seed stock - Caso A gaseosa'),
    ('SBXV1-VTA-001', 7::numeric, 'SANDBOX V1 seed stock - Caso B multi loc'),
    ('SBXV1-PRE-001', 10::numeric, 'SANDBOX V1 seed stock - Caso C parcial')
) as seed(sku, qty, note)
join public.products prod
  on prod.sku = seed.sku
cross join lateral (
  select id
  from public.sites
  where code = 'CENTRO_PROD'
  limit 1
) cp
where not exists (
  select 1
  from public.inventory_movements m
  where m.product_id = prod.id
    and m.note = seed.note
);

commit;
