begin;

with root as (
  select id
  from public.product_categories
  where lower(trim(name)) = 'venta'
    and parent_id is null
    and site_id is null
    and coalesce(nullif(trim(domain), ''), '') = ''
  order by id
  limit 1
)
insert into public.product_categories (
  id,
  name,
  slug,
  parent_id,
  site_id,
  domain,
  description,
  display_order,
  is_active,
  applies_to_kinds
)
select
  gen_random_uuid(),
  'Temporada',
  'venta-temporada',
  root.id,
  null,
  null,
  'Productos de venta temporales por temporada (mes/fecha especial) para no mezclarlos con la linea fija.',
  145,
  true,
  array['venta']::text[]
from root
where not exists (
  select 1
  from public.product_categories pc
  where pc.parent_id = root.id
    and pc.site_id is null
    and coalesce(nullif(trim(pc.domain), ''), '') = ''
    and (
      lower(trim(coalesce(pc.slug, ''))) = 'venta-temporada'
      or lower(trim(pc.name)) = 'temporada'
    )
);

-- Asegurar forma canonica si ya existia por nombre/slug
with root as (
  select id
  from public.product_categories
  where lower(trim(name)) = 'venta'
    and parent_id is null
    and site_id is null
    and coalesce(nullif(trim(domain), ''), '') = ''
  order by id
  limit 1
)
update public.product_categories pc
set
  name = 'Temporada',
  slug = 'venta-temporada',
  parent_id = root.id,
  site_id = null,
  domain = null,
  description = 'Productos de venta temporales por temporada (mes/fecha especial) para no mezclarlos con la linea fija.',
  display_order = 145,
  is_active = true,
  applies_to_kinds = array['venta']::text[],
  updated_at = now()
from root
where pc.parent_id = root.id
  and (
    lower(trim(coalesce(pc.slug, ''))) = 'venta-temporada'
    or lower(trim(pc.name)) = 'temporada'
  );

commit;
