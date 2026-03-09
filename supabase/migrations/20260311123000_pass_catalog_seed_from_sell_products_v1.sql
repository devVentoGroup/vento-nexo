begin;

create or replace view pass.sell_products_by_site as
with recipe_cost as (
  select
    r.product_id,
    sum(r.quantity * coalesce(ing.cost, 0))::numeric as recipe_total_cost
  from public.recipes r
  join public.products ing
    on ing.id = r.ingredient_product_id
  where coalesce(r.is_active, true) = true
  group by r.product_id
),
recipe_yield as (
  select
    rc.product_id,
    nullif(rc.yield_qty, 0)::numeric as yield_qty
  from public.recipe_cards rc
  where coalesce(rc.is_active, true) = true
)
select
  pss.site_id,
  p.id as product_id,
  p.name,
  p.sku,
  p.description,
  p.price as base_price,
  case
    when rc.recipe_total_cost is null then null
    when ry.yield_qty is null then greatest(rc.recipe_total_cost, 0)
    else greatest((rc.recipe_total_cost / ry.yield_qty), 0)
  end::numeric as recipe_cost_amount,
  case
    when p.price is null then null
    when rc.recipe_total_cost is null then null
    when ry.yield_qty is null then p.price - rc.recipe_total_cost
    else p.price - (rc.recipe_total_cost / ry.yield_qty)
  end::numeric as base_margin_amount,
  case
    when coalesce(p.price, 0) <= 0 then null
    when rc.recipe_total_cost is null then null
    when ry.yield_qty is null then round(((p.price - rc.recipe_total_cost) / p.price) * 100, 2)
    else round(((p.price - (rc.recipe_total_cost / ry.yield_qty)) / p.price) * 100, 2)
  end::numeric as base_margin_pct
from public.product_site_settings pss
join public.products p
  on p.id = pss.product_id
left join recipe_cost rc
  on rc.product_id = p.id
left join recipe_yield ry
  on ry.product_id = p.id
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

create or replace function pass.seed_catalog_items_from_sell_products(
  p_site_id uuid default null,
  p_only_missing boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pass
as $$
declare
  v_row record;
  v_existing_id uuid;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_slug text;
  v_code text;
  v_now timestamptz := now();
begin
  if auth.uid() is not null and not (public.is_owner() or public.is_global_manager()) then
    return jsonb_build_object('success', false, 'error', 'No autorizado.');
  end if;

  for v_row in
    select
      sps.site_id,
      sps.product_id,
      sps.name,
      sps.description,
      sps.sku,
      sps.base_price,
      sps.recipe_cost_amount,
      sps.base_margin_amount,
      sps.base_margin_pct,
      pc.name as category_name,
      p.catalog_image_url,
      p.image_url
    from pass.sell_products_by_site sps
    join public.products p
      on p.id = sps.product_id
    left join public.product_categories pc
      on pc.id = p.category_id
    where p_site_id is null or sps.site_id = p_site_id
    order by sps.site_id, sps.name
  loop
    select ci.id
      into v_existing_id
    from pass.catalog_items ci
    where ci.site_id = v_row.site_id
      and ci.product_id = v_row.product_id
    order by ci.is_active desc, ci.updated_at desc, ci.created_at desc
    limit 1;

    v_slug := lower(
      regexp_replace(
        coalesce(nullif(trim(v_row.sku), ''), nullif(trim(v_row.name), ''), 'item'),
        '[^a-zA-Z0-9]+',
        '-',
        'g'
      )
    );
    v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
    if coalesce(v_slug, '') = '' then
      v_slug := 'item';
    end if;
    v_code := v_slug || '-' || substring(replace(v_row.product_id::text, '-', '') from 1 for 6);

    if v_existing_id is null then
      insert into pass.catalog_items (
        site_id,
        product_id,
        code,
        name,
        description,
        category_label,
        image_url,
        price_amount,
        is_active,
        is_featured,
        badges,
        fulfillment_modes,
        metadata,
        sort_order
      ) values (
        v_row.site_id,
        v_row.product_id,
        v_code,
        coalesce(v_row.name, 'Producto'),
        v_row.description,
        v_row.category_name,
        coalesce(v_row.catalog_image_url, v_row.image_url),
        greatest(coalesce(v_row.base_price, 0), 0),
        true,
        false,
        '{}'::text[],
        array['delivery', 'pickup', 'on_premise']::text[],
        jsonb_strip_nulls(
          jsonb_build_object(
            'seed_source', 'products_sell',
            'seed_synced_at', v_now,
            'recipe_cost_amount', v_row.recipe_cost_amount,
            'margin_amount', v_row.base_margin_amount,
            'margin_pct', v_row.base_margin_pct
          )
        ),
        0
      );

      v_inserted := v_inserted + 1;
    elsif p_only_missing then
      v_skipped := v_skipped + 1;
    else
      update pass.catalog_items ci
      set
        site_id = v_row.site_id,
        product_id = v_row.product_id,
        category_label = coalesce(ci.category_label, v_row.category_name),
        image_url = coalesce(ci.image_url, v_row.catalog_image_url, v_row.image_url),
        price_amount = case
          when coalesce(ci.price_amount, 0) <= 0 then greatest(coalesce(v_row.base_price, 0), 0)
          else ci.price_amount
        end,
        metadata = jsonb_strip_nulls(
          coalesce(ci.metadata, '{}'::jsonb)
          || jsonb_build_object(
            'seed_source', 'products_sell',
            'seed_synced_at', v_now,
            'recipe_cost_amount', v_row.recipe_cost_amount,
            'margin_amount', case
              when coalesce(ci.price_amount, 0) > 0 and v_row.recipe_cost_amount is not null
                then ci.price_amount - v_row.recipe_cost_amount
              else v_row.base_margin_amount
            end,
            'margin_pct', case
              when coalesce(ci.price_amount, 0) > 0 and v_row.recipe_cost_amount is not null
                then round(((ci.price_amount - v_row.recipe_cost_amount) / ci.price_amount) * 100, 2)
              else v_row.base_margin_pct
            end
          )
        ),
        updated_at = v_now
      where ci.id = v_existing_id;

      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped
  );
exception
  when others then
    return jsonb_build_object(
      'success', false,
      'error', sqlerrm,
      'inserted', v_inserted,
      'updated', v_updated,
      'skipped', v_skipped
    );
end;
$$;

alter function pass.seed_catalog_items_from_sell_products(uuid, boolean) owner to postgres;
grant execute on function pass.seed_catalog_items_from_sell_products(uuid, boolean) to authenticated, service_role;

create or replace function public.seed_catalog_items_from_sell_products(
  p_site_id uuid default null,
  p_only_missing boolean default true
)
returns jsonb
language sql
security definer
set search_path = public, pass
as $$
  select pass.seed_catalog_items_from_sell_products(p_site_id, p_only_missing);
$$;

alter function public.seed_catalog_items_from_sell_products(uuid, boolean) owner to postgres;
grant execute on function public.seed_catalog_items_from_sell_products(uuid, boolean) to authenticated, service_role;

select pass.seed_catalog_items_from_sell_products(null, true);

commit;
