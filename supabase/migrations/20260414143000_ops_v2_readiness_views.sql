begin;

create or replace view public.v_ops_site_readiness as
with active_sites as (
  select s.id, s.code, s.name, s.site_type
  from public.sites s
  where s.is_active = true
    and s.site_type in ('production_center', 'satellite')
),
loc_metrics as (
  select l.site_id,
         count(*) filter (where l.is_active = true) as loc_total,
         count(*) filter (where l.is_active = true and l.location_type = 'receiving') as loc_receiving,
         count(*) filter (where l.is_active = true and l.location_type = 'production') as loc_production,
         count(*) filter (where l.is_active = true and l.location_type in ('storage', 'picking', 'staging')) as loc_storage
  from public.inventory_locations l
  group by l.site_id
),
area_metrics as (
  select a.site_id,
         count(*) filter (where a.is_active = true) as area_total
  from public.areas a
  group by a.site_id
),
catalog_metrics as (
  select pss.site_id,
         count(*) filter (where pss.is_active = true) as catalog_products,
         count(*) filter (where pss.is_active = true and pss.default_area_kind is not null) as catalog_products_with_area
  from public.product_site_settings pss
  group by pss.site_id
),
recipe_metrics as (
  select rc.site_id,
         count(*) as recipe_cards_total,
         count(*) filter (where rc.status = 'published') as recipe_cards_published
  from public.recipe_cards rc
  where rc.site_id is not null
  group by rc.site_id
),
remission_outbound as (
  select r.from_site_id as site_id,
         count(*) as remissions_out_last_30d
  from public.restock_requests r
  where r.created_at >= now() - interval '30 day'
    and r.from_site_id is not null
  group by r.from_site_id
),
remission_inbound as (
  select r.to_site_id as site_id,
         count(*) as remissions_in_last_30d
  from public.restock_requests r
  where r.created_at >= now() - interval '30 day'
    and r.to_site_id is not null
  group by r.to_site_id
),
production_metrics as (
  select pb.site_id,
         count(*) as production_batches_last_30d
  from public.production_batches pb
  where pb.created_at >= now() - interval '30 day'
  group by pb.site_id
),
movement_metrics as (
  select m.site_id,
         count(*) as inventory_movements_last_30d
  from public.inventory_movements m
  where m.created_at >= now() - interval '30 day'
  group by m.site_id
)
select
  s.id as site_id,
  s.code as site_code,
  s.name as site_name,
  s.site_type,
  coalesce(lm.loc_total, 0) as loc_total,
  coalesce(lm.loc_receiving, 0) as loc_receiving,
  coalesce(lm.loc_storage, 0) as loc_storage,
  coalesce(lm.loc_production, 0) as loc_production,
  coalesce(am.area_total, 0) as area_total,
  coalesce(cm.catalog_products, 0) as catalog_products,
  coalesce(cm.catalog_products_with_area, 0) as catalog_products_with_area,
  case
    when coalesce(cm.catalog_products, 0) = 0 then 0
    else round((coalesce(cm.catalog_products_with_area, 0)::numeric / cm.catalog_products::numeric) * 100, 2)
  end as catalog_area_coverage_pct,
  coalesce(rm.recipe_cards_total, 0) as recipe_cards_total,
  coalesce(rm.recipe_cards_published, 0) as recipe_cards_published,
  coalesce(ro.remissions_out_last_30d, 0) as remissions_out_last_30d,
  coalesce(ri.remissions_in_last_30d, 0) as remissions_in_last_30d,
  coalesce(pm.production_batches_last_30d, 0) as production_batches_last_30d,
  coalesce(mm.inventory_movements_last_30d, 0) as inventory_movements_last_30d,
  (
    (case when coalesce(lm.loc_total, 0) >= 3 then 1 else 0 end)
    + (case when coalesce(am.area_total, 0) >= 1 then 1 else 0 end)
    + (case when coalesce(cm.catalog_products, 0) >= 1 then 1 else 0 end)
    + (case
        when coalesce(cm.catalog_products, 0) = 0 then 0
        when (coalesce(cm.catalog_products_with_area, 0)::numeric / nullif(cm.catalog_products::numeric, 0)) >= 0.80 then 1
        else 0
      end)
    + (case when coalesce(mm.inventory_movements_last_30d, 0) >= 1 then 1 else 0 end)
    + (case
        when s.site_type = 'production_center' and coalesce(rm.recipe_cards_published, 0) >= 1 then 1
        when s.site_type = 'satellite' then 1
        else 0
      end)
  ) as readiness_score_0_6
from active_sites s
left join loc_metrics lm on lm.site_id = s.id
left join area_metrics am on am.site_id = s.id
left join catalog_metrics cm on cm.site_id = s.id
left join recipe_metrics rm on rm.site_id = s.id
left join remission_outbound ro on ro.site_id = s.id
left join remission_inbound ri on ri.site_id = s.id
left join production_metrics pm on pm.site_id = s.id
left join movement_metrics mm on mm.site_id = s.id
order by s.site_type, s.name;

comment on view public.v_ops_site_readiness is
'Vista de readiness operativo por sede para la fase NEXO + ORIGO + FOGO.';

create or replace view public.v_ops_restock_product_gaps as
select
  s.id as site_id,
  s.code as site_code,
  s.name as site_name,
  p.id as product_id,
  p.sku,
  p.name as product_name,
  p.product_type,
  pip.inventory_kind,
  pss.default_area_kind,
  case
    when pss.default_area_kind is null then 'missing_default_area_kind'
    when pip.product_id is null then 'missing_inventory_profile'
    when coalesce(pip.track_inventory, false) = false then 'track_inventory_disabled'
    when coalesce(pip.default_unit, '') = '' then 'missing_default_unit'
    else null
  end as gap_code
from public.product_site_settings pss
join public.sites s on s.id = pss.site_id
join public.products p on p.id = pss.product_id
left join public.product_inventory_profiles pip on pip.product_id = p.id
where s.is_active = true
  and s.site_type = 'satellite'
  and pss.is_active = true
  and p.is_active = true
  and (
    pss.default_area_kind is null
    or pip.product_id is null
    or coalesce(pip.track_inventory, false) = false
    or coalesce(pip.default_unit, '') = ''
  )
order by s.name, p.name;

comment on view public.v_ops_restock_product_gaps is
'Brechas de configuracion producto-sede para remision operativa en sedes satelite.';

grant select on public.v_ops_site_readiness to authenticated, service_role;
grant select on public.v_ops_restock_product_gaps to authenticated, service_role;

commit;
