begin;

-- Arbol maestro v1 para productos de venta.
-- No elimina categorias heredadas; solo crea el arbol canonico y reasigna productos.

with existing_root as (
  select pc.id
  from public.product_categories pc
  where pc.site_id is null
    and pc.parent_id is null
    and coalesce(nullif(trim(pc.domain), ''), '') = ''
    and lower(trim(pc.name)) = 'venta'
  order by pc.id
  limit 1
),
inserted_root as (
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
    'Raiz maestra para categorias operativas de productos vendibles.',
    true,
    array['venta']::text[]
  where not exists (select 1 from existing_root)
  returning id
),
root as (
  select id from existing_root
  union all
  select id from inserted_root
)
update public.product_categories pc
set
  slug = coalesce(nullif(trim(pc.slug), ''), 'venta'),
  description = 'Raiz maestra para categorias operativas de productos vendibles.',
  is_active = true,
  domain = null,
  applies_to_kinds = array['venta']::text[],
  updated_at = now()
from root
where pc.id = root.id;

with root as (
  select pc.id
  from public.product_categories pc
  where pc.site_id is null
    and pc.parent_id is null
    and coalesce(nullif(trim(pc.domain), ''), '') = ''
    and lower(trim(pc.name)) = 'venta'
  order by pc.id
  limit 1
),
desired_categories(name, slug, description, sort_order) as (
  values
    ('Cafe y espresso', 'venta-cafe-y-espresso', 'Cafe, espresso y bebidas centradas en cafe.', 10),
    ('Otras bebidas calientes', 'venta-otras-bebidas-calientes', 'Infusiones, chocolate y bebidas calientes no centradas en espresso.', 20),
    ('Bebidas frias', 'venta-bebidas-frias', 'Jugos, sodas, limonadas, smoothies, malteadas y bebidas frias sin alcohol.', 30),
    ('Cocteles y alcohol', 'venta-cocteles-y-alcohol', 'Cocteles, licores y bebidas alcoholicas listas para venta.', 40),
    ('Panaderia y bolleria', 'venta-panaderia-y-bolleria', 'Croissants, panaderia, bolleria y productos dulces de mostrador.', 50),
    ('Desayunos y brunch', 'venta-desayunos-y-brunch', 'Platos de desayuno, brunch, pancakes, waffles y afines.', 60),
    ('Entradas y para compartir', 'venta-entradas-y-para-compartir', 'Entradas, tapas y platos pensados para compartir.', 70),
    ('Ensaladas y bowls', 'venta-ensaladas-y-bowls', 'Ensaladas, bowls y platos frios equivalentes.', 80),
    ('Sanduches, wraps y tostadas', 'venta-sanduches-wraps-y-tostadas', 'Sanduches, bikinis, wraps, tostadas y formatos similares.', 90),
    ('Platos fuertes', 'venta-platos-fuertes', 'Platos principales, sopas y comida completa.', 100),
    ('Tortas y postres', 'venta-tortas-y-postres', 'Tortas, postres y reposteria final.', 110),
    ('Helados y frios dulces', 'venta-helados-y-frios-dulces', 'Helados y otras preparaciones dulces frias.', 120),
    ('Productos empacados y retail', 'venta-productos-empacados-y-retail', 'Productos terminados empacados para vitrina o retail.', 130),
    ('Otros de venta', 'venta-otros-de-venta', 'Categoria temporal para productos vendibles que aun requieren afinacion.', 140)
),
inserted_children as (
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
    desired_categories.name,
    desired_categories.slug,
    root.id,
    null,
    null,
    desired_categories.description,
    true,
    array['venta']::text[]
  from desired_categories
  cross join root
  where not exists (
    select 1
    from public.product_categories pc
    where pc.parent_id = root.id
      and pc.site_id is null
      and coalesce(nullif(trim(pc.domain), ''), '') = ''
      and lower(trim(pc.name)) = lower(trim(desired_categories.name))
  )
  returning id
)
select count(*) from inserted_children;

with root as (
  select pc.id
  from public.product_categories pc
  where pc.site_id is null
    and pc.parent_id is null
    and coalesce(nullif(trim(pc.domain), ''), '') = ''
    and lower(trim(pc.name)) = 'venta'
  order by pc.id
  limit 1
),
desired_categories(name, slug, description) as (
  values
    ('Cafe y espresso', 'venta-cafe-y-espresso', 'Cafe, espresso y bebidas centradas en cafe.'),
    ('Otras bebidas calientes', 'venta-otras-bebidas-calientes', 'Infusiones, chocolate y bebidas calientes no centradas en espresso.'),
    ('Bebidas frias', 'venta-bebidas-frias', 'Jugos, sodas, limonadas, smoothies, malteadas y bebidas frias sin alcohol.'),
    ('Cocteles y alcohol', 'venta-cocteles-y-alcohol', 'Cocteles, licores y bebidas alcoholicas listas para venta.'),
    ('Panaderia y bolleria', 'venta-panaderia-y-bolleria', 'Croissants, panaderia, bolleria y productos dulces de mostrador.'),
    ('Desayunos y brunch', 'venta-desayunos-y-brunch', 'Platos de desayuno, brunch, pancakes, waffles y afines.'),
    ('Entradas y para compartir', 'venta-entradas-y-para-compartir', 'Entradas, tapas y platos pensados para compartir.'),
    ('Ensaladas y bowls', 'venta-ensaladas-y-bowls', 'Ensaladas, bowls y platos frios equivalentes.'),
    ('Sanduches, wraps y tostadas', 'venta-sanduches-wraps-y-tostadas', 'Sanduches, bikinis, wraps, tostadas y formatos similares.'),
    ('Platos fuertes', 'venta-platos-fuertes', 'Platos principales, sopas y comida completa.'),
    ('Tortas y postres', 'venta-tortas-y-postres', 'Tortas, postres y reposteria final.'),
    ('Helados y frios dulces', 'venta-helados-y-frios-dulces', 'Helados y otras preparaciones dulces frias.'),
    ('Productos empacados y retail', 'venta-productos-empacados-y-retail', 'Productos terminados empacados para vitrina o retail.'),
    ('Otros de venta', 'venta-otros-de-venta', 'Categoria temporal para productos vendibles que aun requieren afinacion.')
)
update public.product_categories pc
set
  slug = desired_categories.slug,
  description = desired_categories.description,
  is_active = true,
  domain = null,
  applies_to_kinds = array['venta']::text[],
  updated_at = now()
from desired_categories
cross join root
where pc.parent_id = root.id
  and pc.site_id is null
  and lower(trim(pc.name)) = lower(trim(desired_categories.name));

with root as (
  select pc.id
  from public.product_categories pc
  where pc.site_id is null
    and pc.parent_id is null
    and coalesce(nullif(trim(pc.domain), ''), '') = ''
    and lower(trim(pc.name)) = 'venta'
  order by pc.id
  limit 1
),
target_categories as (
  select pc.id, pc.name
  from public.product_categories pc
  cross join root
  where pc.parent_id = root.id
    and pc.site_id is null
    and coalesce(nullif(trim(pc.domain), ''), '') = ''
),
legacy_mapping(legacy_name, target_name) as (
  values
    ('BEBIDAS', 'Bebidas frias'),
    ('CAFE', 'Cafe y espresso'),
    ('CAFÉ', 'Cafe y espresso'),
    ('CALIENTES', 'Otras bebidas calientes'),
    ('COCTELES', 'Cocteles y alcohol'),
    ('CON ALCOHOL', 'Cocteles y alcohol'),
    ('CROISSANTS', 'Panaderia y bolleria'),
    ('PAN & BRUNCH', 'Desayunos y brunch'),
    ('PANCAKES & WAFFLES', 'Desayunos y brunch'),
    ('DESAYUNOS', 'Desayunos y brunch'),
    ('ENTRADAS', 'Entradas y para compartir'),
    ('PARA COMPARTIR', 'Entradas y para compartir'),
    ('ENSALADAS', 'Ensaladas y bowls'),
    ('BOWLS', 'Ensaladas y bowls'),
    ('BIKINIS', 'Sanduches, wraps y tostadas'),
    ('SANDWICH', 'Sanduches, wraps y tostadas'),
    ('TOSTADAS', 'Sanduches, wraps y tostadas'),
    ('COMIDA', 'Platos fuertes'),
    ('FUERTES', 'Platos fuertes'),
    ('SOPAS', 'Platos fuertes'),
    ('PIZZAS', 'Platos fuertes'),
    ('POSTRES', 'Tortas y postres'),
    ('HELADOS', 'Helados y frios dulces'),
    ('FRIAS', 'Bebidas frias'),
    ('FRÍAS', 'Bebidas frias'),
    ('JUGOS', 'Bebidas frias'),
    ('LIMONADAS', 'Bebidas frias'),
    ('MALTEADAS', 'Bebidas frias'),
    ('SMOOTHIE', 'Bebidas frias'),
    ('SODAS', 'Bebidas frias'),
    ('OTROS', 'Otros de venta')
),
category_targets as (
  select
    source.id as source_category_id,
    target.id as target_category_id
  from public.product_categories source
  join legacy_mapping map
    on upper(trim(source.name)) = map.legacy_name
  join target_categories target
    on lower(trim(target.name)) = lower(trim(map.target_name))
  where source.id <> target.id
),
updated_products as (
  update public.products p
  set
    category_id = category_targets.target_category_id,
    updated_at = now()
  from category_targets
  where p.category_id = category_targets.source_category_id
    and lower(coalesce(p.product_type, '')) = 'venta'
  returning p.id
)
select count(*) from updated_products;

commit;
