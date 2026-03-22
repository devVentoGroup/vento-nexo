-- NEXO v2: asegurar área "Todos" (kind=general) en sedes satélite clave
-- para remisiones desde Vento Café, Saudo y Molka.

with target_sites as (
  select s.id
  from public.sites s
  where lower(public._vento_slugify(coalesce(s.name, ''))) in (
    'vento-cafe',
    'saudo',
    'molka-principal'
  )
)
update public.areas a
set
  code = 'todos',
  name = 'Todos',
  is_active = true
where a.site_id in (select id from target_sites)
  and a.kind = 'general';

with target_sites as (
  select s.id
  from public.sites s
  where lower(public._vento_slugify(coalesce(s.name, ''))) in (
    'vento-cafe',
    'saudo',
    'molka-principal'
  )
)
insert into public.areas (site_id, code, name, kind, is_active)
select ts.id, 'todos', 'Todos', 'general', true
from target_sites ts
where not exists (
  select 1
  from public.areas a
  where a.site_id = ts.id
    and a.kind = 'general'
);
