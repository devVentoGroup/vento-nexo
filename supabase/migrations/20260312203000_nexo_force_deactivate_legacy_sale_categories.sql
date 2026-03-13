begin;

-- Regla operativa dura para v1:
-- categorias de venta activas = solo la raiz canonica "Venta" y sus hijas maestras globales con slug venta-*.

with canonical_root as (
  select id
  from public.product_categories
  where lower(trim(name)) = 'venta'
    and parent_id is null
    and site_id is null
    and coalesce(nullif(trim(domain), ''), '') = ''
  order by id
  limit 1
),
canonical_keep as (
  select pc.id
  from public.product_categories pc
  cross join canonical_root root
  where pc.id = root.id

  union

  select pc.id
  from public.product_categories pc
  cross join canonical_root root
  where pc.parent_id = root.id
    and pc.site_id is null
    and coalesce(nullif(trim(pc.domain), ''), '') = ''
    and lower(coalesce(pc.slug, '')) like 'venta-%'
),
legacy_sale_categories as (
  select pc.id
  from public.product_categories pc
  where pc.applies_to_kinds @> array['venta']::text[]
    and cardinality(pc.applies_to_kinds) = 1
    and pc.id not in (select id from canonical_keep)
    and coalesce(pc.is_active, true) = true
)
update public.product_categories pc
set
  is_active = false,
  description = case
    when coalesce(pc.description, '') ilike '[legacy comercial v1]%' then pc.description
    when nullif(trim(pc.description), '') is null
      then '[LEGACY COMERCIAL v1] Categoria heredada de venta desactivada en v1 para reservarla a la migracion comercial de v2.'
    else '[LEGACY COMERCIAL v1] ' || pc.description
  end,
  updated_at = now()
from legacy_sale_categories legacy
where pc.id = legacy.id;

commit;
