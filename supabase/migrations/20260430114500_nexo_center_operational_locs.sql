begin;

-- LOCs operativos del Centro de Produccion para retiros desde quiosco.
-- Son destinos reales de traslado, no posiciones internas de bodega.

with target_site as (
  select id
  from public.sites
  where lower(name) in ('centro de produccion', 'centro de producción')
  order by created_at nulls last, id
  limit 1
),
area_seed(code, name, kind) as (
  values
    ('REPOSTERIA', 'Reposteria', 'reposteria'),
    ('PAN-GALL', 'Galleteria y panaderia', 'panaderia'),
    ('COC-CAL', 'Cocina caliente', 'cocina_caliente')
)
insert into public.areas (site_id, code, name, kind, is_active)
select
  target_site.id,
  area_seed.code,
  area_seed.name,
  area_seed.kind,
  true
from target_site
cross join area_seed
where not exists (
  select 1
  from public.areas a
  where a.site_id = target_site.id
    and upper(a.code) = area_seed.code
);

with target_site as (
  select id
  from public.sites
  where lower(name) in ('centro de produccion', 'centro de producción')
  order by created_at nulls last, id
  limit 1
),
loc_seed(code, zone, location_type, description, area_code) as (
  values
    ('LOC-CP-PROD-REP-01', 'REP', 'production', 'Reposteria', 'REPOSTERIA'),
    ('LOC-CP-PROD-PAN-01', 'PAN', 'production', 'Galleteria y panaderia', 'PAN-GALL'),
    ('LOC-CP-PROD-COC-01', 'COC', 'production', 'Cocina caliente', 'COC-CAL')
)
insert into public.inventory_locations (
  site_id,
  area_id,
  code,
  zone,
  description,
  is_active,
  location_type,
  created_at,
  updated_at
)
select
  target_site.id,
  area.id,
  loc_seed.code,
  loc_seed.zone,
  loc_seed.description,
  true,
  loc_seed.location_type,
  now(),
  now()
from target_site
join loc_seed on true
join public.areas area
  on area.site_id = target_site.id
 and upper(area.code) = loc_seed.area_code
on conflict (code) do update
set
  site_id = excluded.site_id,
  area_id = excluded.area_id,
  zone = excluded.zone,
  description = excluded.description,
  is_active = true,
  location_type = excluded.location_type,
  updated_at = now();

commit;
