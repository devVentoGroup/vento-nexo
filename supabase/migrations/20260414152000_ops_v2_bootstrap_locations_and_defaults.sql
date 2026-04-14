begin;

-- 1) Asegurar area operativa para Molka (solicitud remision: Mostrador)
insert into public.areas (site_id, code, name, kind, is_active)
select s.id, 'MOSTRADOR', 'Mostrador', 'mostrador', true
from public.sites s
where s.name = 'Molka Principal'
  and not exists (
    select 1
    from public.areas a
    where a.site_id = s.id
      and upper(a.code) = 'MOSTRADOR'
  );

-- 2) Bootstrap LOC minimo operativo por sede (sin tocar LOC existentes)
with site_map as (
  select id, name
  from public.sites
  where name in ('Centro de Producción', 'Vento Café', 'Saudo', 'Molka Principal')
),
seed(site_name, code, zone, location_type, description) as (
  values
    ('Centro de Producción', 'LOC-CP-REC-01', 'REC',  'receiving', 'Recepcion de proveedor'),
    ('Centro de Producción', 'LOC-CP-PROD-01','PROD', 'production','Produccion interna'),
    ('Centro de Producción', 'LOC-CP-DESP-01','DESP', 'staging',   'Staging despacho satelites'),
    ('Centro de Producción', 'LOC-CP-DEV-01', 'DEV',  'staging',   'Devoluciones e incidencias'),

    ('Vento Café',           'LOC-VC-REC-01', 'REC',  'receiving', 'Recepcion interna satelite'),
    ('Vento Café',           'LOC-VC-STO-01', 'STO',  'storage',   'Stock operativo satelite'),
    ('Vento Café',           'LOC-VC-OPS-01', 'OPS',  'picking',   'Picking operativo'),

    ('Saudo',                'LOC-SAU-REC-01','REC',  'receiving', 'Recepcion interna satelite'),
    ('Saudo',                'LOC-SAU-STO-01','STO',  'storage',   'Stock operativo satelite'),
    ('Saudo',                'LOC-SAU-OPS-01','OPS',  'picking',   'Picking operativo'),

    ('Molka Principal',      'LOC-MOL-REC-01','REC',  'receiving', 'Recepcion interna satelite'),
    ('Molka Principal',      'LOC-MOL-STO-01','STO',  'storage',   'Stock operativo satelite'),
    ('Molka Principal',      'LOC-MOL-OPS-01','OPS',  'picking',   'Picking operativo')
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
  sm.id,
  sd.code,
  sd.zone,
  sd.description,
  true,
  sd.location_type,
  now(),
  now()
from seed sd
join site_map sm on sm.name = sd.site_name
where not exists (
  select 1
  from public.inventory_locations l
  where l.code = sd.code
);

-- 3) Completar area sugerida faltante en catalogo satelite
update public.product_site_settings pss
set
  default_area_kind = case s.name
    when 'Saudo' then 'cocina_bar'
    when 'Molka Principal' then 'mostrador'
    when 'Vento Café' then 'mostrador'
    else 'general'
  end,
  updated_at = now()
from public.sites s
where pss.site_id = s.id
  and s.site_type = 'satellite'
  and pss.is_active = true
  and pss.default_area_kind is null;

commit;
