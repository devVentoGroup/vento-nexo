begin;

-- LOCs operativos definitivos para satelites.
-- No se elimina historia: los LOCs genericos previos solo se desactivan si no tienen stock.

with site_map as (
  select id, code, name
  from public.sites
  where code in ('VCF', 'SAU', 'MOL')
     or lower(name) like '%vento caf%'
     or lower(name) like '%saudo%'
     or lower(name) like '%molka%'
),
seed(site_code, site_name_pattern, code, zone, location_type, description) as (
  values
    ('VCF', '%vento caf%', 'LOC-VCF-MOS-MAIN', 'MOS', 'picking', 'Mostrador'),
    ('VCF', '%vento caf%', 'LOC-VCF-BAR-MAIN', 'BAR', 'picking', 'Barra'),
    ('VCF', '%vento caf%', 'LOC-VCF-COC-MAIN', 'COC', 'production', 'Cocina'),

    ('SAU', '%saudo%', 'LOC-SAU-OPS-MAIN', 'OPS', 'picking', 'Operacion principal'),
    ('MOL', '%molka%', 'LOC-MOL-OPS-MAIN', 'OPS', 'picking', 'Operacion principal')
),
resolved_seed as (
  select
    sm.id as site_id,
    sd.code,
    sd.zone,
    sd.location_type,
    sd.description
  from seed sd
  join site_map sm
    on sm.code = sd.site_code
    or lower(sm.name) like sd.site_name_pattern
)
insert into public.inventory_locations (
  site_id,
  code,
  zone,
  description,
  is_active,
  location_type,
  created_at,
  updated_at
)
select
  rs.site_id,
  rs.code,
  rs.zone,
  rs.description,
  true,
  rs.location_type,
  now(),
  now()
from resolved_seed rs
where not exists (
  select 1
  from public.inventory_locations existing
  where existing.code = rs.code
);

-- Reactivar/normalizar LOCs finales si ya existian.
with desired(code, zone, location_type, description) as (
  values
    ('LOC-VCF-MOS-MAIN', 'MOS', 'picking', 'Mostrador'),
    ('LOC-VCF-BAR-MAIN', 'BAR', 'picking', 'Barra'),
    ('LOC-VCF-COC-MAIN', 'COC', 'production', 'Cocina'),
    ('LOC-SAU-OPS-MAIN', 'OPS', 'picking', 'Operacion principal'),
    ('LOC-MOL-OPS-MAIN', 'OPS', 'picking', 'Operacion principal')
)
update public.inventory_locations loc
set
  zone = desired.zone,
  location_type = desired.location_type,
  description = desired.description,
  is_active = true,
  updated_at = now()
from desired
where loc.code = desired.code;

-- Desactivar LOCs genericos antiguos si estan vacios para no duplicar opciones operativas.
with legacy(code) as (
  values
    ('LOC-VC-REC-01'),
    ('LOC-VC-STO-01'),
    ('LOC-VC-OPS-01'),
    ('LOC-SAU-REC-01'),
    ('LOC-SAU-STO-01'),
    ('LOC-SAU-OPS-01'),
    ('LOC-MOL-REC-01'),
    ('LOC-MOL-STO-01'),
    ('LOC-MOL-OPS-01')
)
update public.inventory_locations loc
set
  is_active = false,
  description = coalesce(nullif(loc.description, ''), loc.code) || ' (legacy sin stock)',
  updated_at = now()
from legacy
where loc.code = legacy.code
  and loc.is_active = true
  and not exists (
    select 1
    from public.inventory_stock_by_location stock
    where stock.location_id = loc.id
      and abs(coalesce(stock.current_qty, 0)) > 0.000001
  );

commit;
