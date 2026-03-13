begin;

-- v1: apagar categorias heredadas de venta para que la operacion solo use el arbol maestro.
-- No se borran; quedan preservadas para una futura migracion a categorias comerciales en v2.

with recursive canonical_tree as (
  select pc.id
  from public.product_categories pc
  where lower(trim(pc.name)) = 'venta'
    and pc.parent_id is null
    and pc.site_id is null

  union all

  select child.id
  from public.product_categories child
  join canonical_tree tree
    on child.parent_id = tree.id
),
legacy_sale_categories as (
  select pc.id
  from public.product_categories pc
  where pc.applies_to_kinds @> array['venta']::text[]
    and pc.id not in (select id from canonical_tree)
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
