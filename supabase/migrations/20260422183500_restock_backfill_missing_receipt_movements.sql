-- Backfill one-time:
-- Some remissions reached status "received" through item-sync flows without
-- generating destination movements (transfer_in). This script repairs those
-- rows directly (movement + stock by site), without relying on session permissions.

with missing_lines as (
  select
    r.id as request_id,
    r.to_site_id as site_id,
    i.product_id,
    round(coalesce(i.received_quantity, 0)::numeric, 2) as qty
  from public.restock_requests r
  join public.restock_request_items i on i.request_id = r.id
  where r.status = 'received'
    and r.to_site_id is not null
    and round(coalesce(i.received_quantity, 0)::numeric, 2) > 0
    and not exists (
      select 1
      from public.inventory_movements m
      where m.related_restock_request_id = r.id
        and m.movement_type = 'transfer_in'
        and m.site_id = r.to_site_id
        and m.product_id = i.product_id
    )
),
inserted_movements as (
  insert into public.inventory_movements (
    site_id,
    product_id,
    movement_type,
    quantity,
    note,
    related_restock_request_id
  )
  select
    ml.site_id,
    ml.product_id,
    'transfer_in',
    ml.qty,
    'Backfill recepcion remision ' || ml.request_id::text,
    ml.request_id
  from missing_lines ml
  returning site_id, product_id, quantity
),
agg as (
  select
    site_id,
    product_id,
    round(sum(quantity)::numeric, 2) as qty
  from inserted_movements
  group by site_id, product_id
)
insert into public.inventory_stock_by_site (site_id, product_id, current_qty, updated_at)
select
  a.site_id,
  a.product_id,
  a.qty,
  now()
from agg a
on conflict (site_id, product_id)
do update set
  current_qty = public.inventory_stock_by_site.current_qty + excluded.current_qty,
  updated_at = now();
