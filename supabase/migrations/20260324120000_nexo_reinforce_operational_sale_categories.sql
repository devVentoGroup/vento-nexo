begin;

-- Refuerzo v2 operativo:
-- 1) Mantener unicamente el arbol canonico de venta para operacion (global, sin domain).
-- 2) Reubicar productos venta que aun apunten a categorias legacy.
-- 3) Desactivar categorias legacy de venta para que no vuelvan a aparecer en catalogo operativo.

with root_existing as (
  select id
  from public.product_categories
  where lower(trim(name)) = 'venta'
    and parent_id is null
    and site_id is null
    and coalesce(nullif(trim(domain), ''), '') = ''
  order by id
  limit 1
),
root_inserted as (
  insert into public.product_categories (
    id,
    name,
    slug,
    parent_id,
    site_id,
    domain,
    description,
    is_active,
    applies_to_kinds
  )
  select
    gen_random_uuid(),
    'Venta',
    'venta',
    null,
    null,
    null,
    'Raiz maestra de categorias operativas de productos vendibles.',
    true,
    array['venta']::text[]
  where not exists (select 1 from root_existing)
  returning id
),
root as (
  select id from root_existing
  union all
  select id from root_inserted
),
canonical(name, slug, description, display_order) as (
  values
    ('Cafe y espresso', 'venta-cafe-y-espresso', 'Cafe, espresso y bebidas centradas en cafe.', 10),
    ('Otras bebidas calientes', 'venta-otras-bebidas-calientes', 'Infusiones y bebidas calientes no centradas en espresso.', 20),
    ('Bebidas frias', 'venta-bebidas-frias', 'Jugos, sodas, limonadas, smoothies, malteadas y bebidas frias sin alcohol.', 30),
    ('Cocteles y alcohol', 'venta-cocteles-y-alcohol', 'Cocteles, licores y bebidas alcoholicas listas para venta.', 40),
    ('Panaderia y bolleria', 'venta-panaderia-y-bolleria', 'Panaderia, bolleria y productos dulces de mostrador.', 50),
    ('Desayunos y brunch', 'venta-desayunos-y-brunch', 'Platos de desayuno, brunch, pancakes, waffles y afines.', 60),
    ('Entradas y para compartir', 'venta-entradas-y-para-compartir', 'Entradas, tapas y platos para compartir.', 70),
    ('Ensaladas y bowls', 'venta-ensaladas-y-bowls', 'Ensaladas, bowls y platos frios equivalentes.', 80),
    ('Sanduches, wraps y tostadas', 'venta-sanduches-wraps-y-tostadas', 'Sanduches, wraps, bikinis y tostadas.', 90),
    ('Platos fuertes', 'venta-platos-fuertes', 'Platos principales y sopas.', 100),
    ('Tortas y postres', 'venta-tortas-y-postres', 'Tortas, postres y reposteria final.', 110),
    ('Helados y frios dulces', 'venta-helados-y-frios-dulces', 'Helados y otras preparaciones dulces frias.', 120),
    ('Productos empacados y retail', 'venta-productos-empacados-y-retail', 'Productos terminados empacados para vitrina o retail.', 130),
    ('Otros de venta', 'venta-otros-de-venta', 'Categoria temporal para saneamiento de productos vendibles.', 140)
),
upsert_root as (
  update public.product_categories pc
  set
    slug = 'venta',
    domain = null,
    site_id = null,
    is_active = true,
    description = 'Raiz maestra de categorias operativas de productos vendibles.',
    applies_to_kinds = array['venta']::text[],
    updated_at = now()
  from root
  where pc.id = root.id
  returning pc.id
),
insert_children as (
  insert into public.product_categories (
    id,
    name,
    slug,
    parent_id,
    site_id,
    domain,
    description,
    is_active,
    applies_to_kinds,
    display_order
  )
  select
    gen_random_uuid(),
    c.name,
    c.slug,
    r.id,
    null,
    null,
    c.description,
    true,
    array['venta']::text[],
    c.display_order
  from canonical c
  cross join root r
  where not exists (
    select 1
    from public.product_categories pc
    where pc.parent_id = r.id
      and pc.site_id is null
      and coalesce(nullif(trim(pc.domain), ''), '') = ''
      and lower(trim(pc.slug)) = lower(trim(c.slug))
  )
  returning id
),
update_children as (
  update public.product_categories pc
  set
    name = c.name,
    slug = c.slug,
    parent_id = r.id,
    site_id = null,
    domain = null,
    description = c.description,
    display_order = c.display_order,
    is_active = true,
    applies_to_kinds = array['venta']::text[],
    updated_at = now()
  from canonical c
  cross join root r
  where pc.parent_id = r.id
    and lower(trim(pc.slug)) = lower(trim(c.slug))
  returning pc.id
),
keep as (
  select r.id as id from root r
  union
  select pc.id
  from public.product_categories pc
  cross join root r
  where pc.parent_id = r.id
    and pc.site_id is null
    and coalesce(nullif(trim(pc.domain), ''), '') = ''
    and lower(coalesce(pc.slug, '')) like 'venta-%'
),
mapping(legacy_name, target_slug) as (
  values
    ('BEBIDAS', 'venta-bebidas-frias'),
    ('CAFE', 'venta-cafe-y-espresso'),
    ('CAFÉ', 'venta-cafe-y-espresso'),
    ('CALIENTES', 'venta-otras-bebidas-calientes'),
    ('COCTELES', 'venta-cocteles-y-alcohol'),
    ('CON ALCOHOL', 'venta-cocteles-y-alcohol'),
    ('CROISSANTS', 'venta-panaderia-y-bolleria'),
    ('HORNEADOS', 'venta-panaderia-y-bolleria'),
    ('VITRINA', 'venta-panaderia-y-bolleria'),
    ('PAN & BRUNCH', 'venta-desayunos-y-brunch'),
    ('PANCAKES & WAFFLES', 'venta-desayunos-y-brunch'),
    ('DESAYUNOS', 'venta-desayunos-y-brunch'),
    ('ENTRADAS', 'venta-entradas-y-para-compartir'),
    ('PARA COMPARTIR', 'venta-entradas-y-para-compartir'),
    ('ENSALADAS', 'venta-ensaladas-y-bowls'),
    ('BOWLS', 'venta-ensaladas-y-bowls'),
    ('BIKINIS', 'venta-sanduches-wraps-y-tostadas'),
    ('SANDWICH', 'venta-sanduches-wraps-y-tostadas'),
    ('TOSTADAS', 'venta-sanduches-wraps-y-tostadas'),
    ('COMIDA', 'venta-platos-fuertes'),
    ('FUERTES', 'venta-platos-fuertes'),
    ('SOPAS', 'venta-platos-fuertes'),
    ('PIZZAS', 'venta-platos-fuertes'),
    ('POSTRES', 'venta-tortas-y-postres'),
    ('HELADOS', 'venta-helados-y-frios-dulces'),
    ('FRIAS', 'venta-bebidas-frias'),
    ('FRÍAS', 'venta-bebidas-frias'),
    ('JUGOS', 'venta-bebidas-frias'),
    ('LIMONADAS', 'venta-bebidas-frias'),
    ('MALTEADAS', 'venta-bebidas-frias'),
    ('SMOOTHIE', 'venta-bebidas-frias'),
    ('SODAS', 'venta-bebidas-frias'),
    ('BEBIDAS LISTAS (RTD)', 'venta-bebidas-frias'),
    ('OTROS', 'venta-otros-de-venta')
),
legacy_targets as (
  select
    legacy.id as legacy_id,
    target.id as target_id
  from public.product_categories legacy
  join mapping m
    on upper(trim(legacy.name)) = m.legacy_name
  join public.product_categories target
    on lower(trim(target.slug)) = lower(trim(m.target_slug))
  where legacy.id <> target.id
),
relinked_by_name as (
  update public.products p
  set
    category_id = lt.target_id,
    updated_at = now()
  from legacy_targets lt
  where p.category_id = lt.legacy_id
    and lower(coalesce(p.product_type, '')) = 'venta'
  returning p.id
),
fallback_target as (
  select id
  from public.product_categories
  where lower(trim(slug)) = 'venta-otros-de-venta'
    and site_id is null
    and coalesce(nullif(trim(domain), ''), '') = ''
  order by id
  limit 1
),
relinked_remaining as (
  update public.products p
  set
    category_id = ft.id,
    updated_at = now()
  from fallback_target ft
  where lower(coalesce(p.product_type, '')) = 'venta'
    and p.category_id is not null
    and p.category_id not in (select id from keep)
  returning p.id
),
deactivate_legacy as (
  update public.product_categories pc
  set
    is_active = false,
    description = case
      when coalesce(pc.description, '') ilike '[legacy comercial v1]%' then pc.description
      when nullif(trim(pc.description), '') is null
        then '[LEGACY COMERCIAL v1] Categoria heredada de venta desactivada para operacion (NEXO v2).'
      else '[LEGACY COMERCIAL v1] ' || pc.description
    end,
    updated_at = now()
  where pc.applies_to_kinds @> array['venta']::text[]
    and cardinality(pc.applies_to_kinds) = 1
    and coalesce(pc.is_active, true) = true
    and pc.id not in (select id from keep)
  returning pc.id
)
select 1;

commit;
