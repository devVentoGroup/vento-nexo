begin;

-- Corrige falsos positivos del follow-up anterior:
-- nombres como "Ginger" u "Original" no deben caer en alcohol por substring.

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
    ) as cocteles_id
),
reclassified_products as (
  update public.products p
  set
    category_id = target_categories.bebidas_frias_id,
    updated_at = now()
  from target_categories
  where lower(coalesce(p.product_type, '')) = 'venta'
    and p.category_id = target_categories.cocteles_id
    and target_categories.bebidas_frias_id is not null
    and not (
      lower(coalesce(p.name, '')) ~ '(^|[^a-z])(cerveza|heineken|coronita|corona|vino|whisky|whiskey|ron|vodka|tequila|licor|aperol|campari|vermouth|brandy|ginebra)($|[^a-z])'
    )
  returning p.id, p.name
)
select count(*) from reclassified_products;

commit;
