begin;

-- Follow-up de migracion v1:
-- corrige categorias heredadas activas detectadas despues de la primera corrida.

with venta_root as (
  select id
  from public.product_categories
  where lower(trim(name)) = 'venta'
    and parent_id is null
    and site_id is null
  order by id
  limit 1
),
target_categories as (
  select
    (
      select pc.id
      from public.product_categories pc
      where pc.parent_id = (select id from venta_root)
        and lower(trim(pc.name)) = 'bebidas frias'
      order by pc.id
      limit 1
    ) as bebidas_frias_id,
    (
      select pc.id
      from public.product_categories pc
      where pc.parent_id = (select id from venta_root)
        and lower(trim(pc.name)) = 'cocteles y alcohol'
      order by pc.id
      limit 1
    ) as cocteles_id,
    (
      select pc.id
      from public.product_categories pc
      where pc.parent_id = (select id from venta_root)
        and lower(trim(pc.name)) = 'panaderia y bolleria'
      order by pc.id
      limit 1
    ) as panaderia_id
),
panaderia_fix as (
  update public.products p
  set
    category_id = target_categories.panaderia_id,
    updated_at = now()
  from public.product_categories source, target_categories
  where p.category_id = source.id
    and lower(coalesce(p.product_type, '')) = 'venta'
    and upper(trim(source.name)) in ('HORNEADOS', 'VITRINA')
    and target_categories.panaderia_id is not null
  returning p.id
),
alcohol_fix as (
  update public.products p
  set
    category_id = target_categories.cocteles_id,
    updated_at = now()
  from public.product_categories source, target_categories
  where p.category_id = source.id
    and lower(coalesce(p.product_type, '')) = 'venta'
    and lower(trim(source.name)) = 'bebidas listas (rtd)'
    and target_categories.cocteles_id is not null
    and (
      lower(coalesce(p.name, '')) like '%cerveza%'
      or lower(coalesce(p.name, '')) like '%heineken%'
      or lower(coalesce(p.name, '')) like '%coronita%'
      or lower(coalesce(p.name, '')) like '%corona%'
      or lower(coalesce(p.name, '')) like '%vino%'
      or lower(coalesce(p.name, '')) like '%whisky%'
      or lower(coalesce(p.name, '')) like '%ron%'
      or lower(coalesce(p.name, '')) like '%vodka%'
      or lower(coalesce(p.name, '')) like '%gin%'
      or lower(coalesce(p.name, '')) like '%tequila%'
    )
  returning p.id
),
bebidas_fix as (
  update public.products p
  set
    category_id = target_categories.bebidas_frias_id,
    updated_at = now()
  from public.product_categories source, target_categories
  where p.category_id = source.id
    and lower(coalesce(p.product_type, '')) = 'venta'
    and lower(trim(source.name)) = 'bebidas listas (rtd)'
    and target_categories.bebidas_frias_id is not null
  returning p.id
)
select
  (select count(*) from panaderia_fix) as panaderia_fix_count,
  (select count(*) from alcohol_fix) as alcohol_fix_count,
  (select count(*) from bebidas_fix) as bebidas_fix_count;

commit;
