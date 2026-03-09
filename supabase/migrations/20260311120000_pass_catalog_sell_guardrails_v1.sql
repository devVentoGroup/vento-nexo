begin;

create or replace function pass.validate_catalog_item_product_site()
returns trigger
language plpgsql
security definer
set search_path = public, pass
as $$
declare
  v_product record;
begin
  if new.product_id is null then
    return new;
  end if;

  select
    p.id,
    p.name,
    p.description,
    p.sku,
    p.price,
    lower(coalesce(p.product_type, '')) as product_type,
    p.is_active
  into v_product
  from public.products p
  where p.id = new.product_id;

  if not found then
    raise exception 'Producto % no existe.', new.product_id;
  end if;

  if coalesce(v_product.is_active, true) = false then
    raise exception 'Producto % esta inactivo.', new.product_id;
  end if;

  if v_product.product_type not in ('venta', 'sale') then
    raise exception 'Solo se permiten productos de venta.';
  end if;

  perform 1
  from public.product_site_settings pss
  where pss.product_id = new.product_id
    and pss.site_id = new.site_id
    and coalesce(pss.is_active, true) = true;

  if not found then
    raise exception 'Producto % no esta habilitado para la sede %.', new.product_id, new.site_id;
  end if;

  if coalesce(trim(new.name), '') = '' then
    new.name := coalesce(v_product.name, 'Producto');
  end if;

  if coalesce(trim(new.description), '') = '' then
    new.description := v_product.description;
  end if;

  if coalesce(trim(new.code), '') = '' then
    new.code := lower(
      regexp_replace(
        coalesce(v_product.sku, v_product.name, 'item'),
        '[^a-zA-Z0-9]+',
        '-',
        'g'
      )
    );
    new.code := regexp_replace(new.code, '(^-+|-+$)', '', 'g');
    if coalesce(new.code, '') = '' then
      new.code := 'item';
    end if;
  end if;

  if coalesce(new.price_amount, 0) = 0 and v_product.price is not null and v_product.price > 0 then
    new.price_amount := v_product.price;
  end if;

  if new.category_label is null then
    select pc.name
      into new.category_label
    from public.products p
    left join public.product_categories pc on pc.id = p.category_id
    where p.id = new.product_id;
  end if;

  return new;
end;
$$;

alter function pass.validate_catalog_item_product_site() owner to postgres;
grant execute on function pass.validate_catalog_item_product_site() to authenticated, service_role;

drop trigger if exists pass_catalog_items_validate_product_site on pass.catalog_items;
create trigger pass_catalog_items_validate_product_site
before insert or update on pass.catalog_items
for each row
execute function pass.validate_catalog_item_product_site();

with ranked as (
  select
    id,
    row_number() over (
      partition by site_id, product_id
      order by coalesce(updated_at, created_at, now()) desc, id desc
    ) as rn
  from pass.catalog_items
  where product_id is not null
    and is_active = true
)
update pass.catalog_items ci
set is_active = false,
    metadata = coalesce(ci.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'deduped_at', now(),
        'deduped_reason', 'active_duplicate_site_product'
      ),
    updated_at = now()
from ranked r
where ci.id = r.id
  and r.rn > 1;

create unique index if not exists pass_catalog_items_site_product_active_uidx
  on pass.catalog_items (site_id, product_id)
  where product_id is not null and is_active = true;

create or replace view pass.sell_products_by_site as
select
  pss.site_id,
  p.id as product_id,
  p.name,
  p.sku,
  p.description,
  p.price as base_price
from public.product_site_settings pss
join public.products p on p.id = pss.product_id
where coalesce(pss.is_active, true) = true
  and coalesce(p.is_active, true) = true
  and lower(coalesce(p.product_type, '')) in ('venta', 'sale');

grant select on pass.sell_products_by_site to authenticated, service_role;

create or replace view public.sell_products_by_site
with (security_invoker = true)
as
select * from pass.sell_products_by_site;

comment on view public.sell_products_by_site is 'Compat view. Canonical view lives in pass.sell_products_by_site.';

grant select on public.sell_products_by_site to authenticated, service_role;

commit;
