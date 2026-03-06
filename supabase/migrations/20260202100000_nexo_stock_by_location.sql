-- NEXO: Stock real por LOC (sin LPN) + helper para deltas

begin;

-- Replace legacy view with real table
drop view if exists public.inventory_stock_by_location;

create table if not exists public.inventory_stock_by_location (
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  current_qty numeric default 0 not null,
  updated_at timestamptz default now() not null,
  primary key (location_id, product_id)
);

create index if not exists idx_inventory_stock_by_location_location
  on public.inventory_stock_by_location(location_id);

create index if not exists idx_inventory_stock_by_location_product
  on public.inventory_stock_by_location(product_id);

-- Add location to entry items (for put-away)
alter table public.inventory_entry_items
  add column if not exists location_id uuid references public.inventory_locations(id) on delete set null;

create index if not exists idx_inventory_entry_items_location
  on public.inventory_entry_items(location_id);

-- View for reporting (similar shape to legacy view)
create or replace view public.v_inventory_stock_by_location as
select
  loc.id as location_id,
  loc.code as location_code,
  loc.zone,
  loc.site_id,
  s.name as site_name,
  p.id as product_id,
  p.name as product_name,
  p.sku,
  isl.current_qty as total_quantity,
  p.unit
from public.inventory_stock_by_location isl
join public.inventory_locations loc on loc.id = isl.location_id
join public.sites s on s.id = loc.site_id
join public.products p on p.id = isl.product_id
where loc.is_active = true;

-- RLS
alter table public.inventory_stock_by_location enable row level security;

drop policy if exists "inventory_stock_by_location_select_permission" on public.inventory_stock_by_location;
create policy "inventory_stock_by_location_select_permission" on public.inventory_stock_by_location
  for select to authenticated
  using (
    exists (
      select 1
      from public.inventory_locations loc
      where loc.id = inventory_stock_by_location.location_id
        and public.has_permission('nexo.inventory.stock', loc.site_id)
    )
  );

drop policy if exists "inventory_stock_by_location_insert_permission" on public.inventory_stock_by_location;
create policy "inventory_stock_by_location_insert_permission" on public.inventory_stock_by_location
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.inventory_locations loc
      where loc.id = inventory_stock_by_location.location_id
        and (
          public.has_permission('nexo.inventory.stock', loc.site_id)
          or public.has_permission('nexo.inventory.remissions.prepare', loc.site_id)
          or public.has_permission('nexo.inventory.remissions.receive', loc.site_id)
          or public.has_permission('nexo.inventory.production_batches', loc.site_id)
          or public.has_permission('nexo.inventory.entries', loc.site_id)
          or public.has_permission('nexo.inventory.transfers', loc.site_id)
        )
    )
  );

drop policy if exists "inventory_stock_by_location_update_permission" on public.inventory_stock_by_location;
create policy "inventory_stock_by_location_update_permission" on public.inventory_stock_by_location
  for update to authenticated
  using (
    exists (
      select 1
      from public.inventory_locations loc
      where loc.id = inventory_stock_by_location.location_id
        and (
          public.has_permission('nexo.inventory.stock', loc.site_id)
          or public.has_permission('nexo.inventory.remissions.prepare', loc.site_id)
          or public.has_permission('nexo.inventory.remissions.receive', loc.site_id)
          or public.has_permission('nexo.inventory.production_batches', loc.site_id)
          or public.has_permission('nexo.inventory.entries', loc.site_id)
          or public.has_permission('nexo.inventory.transfers', loc.site_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.inventory_locations loc
      where loc.id = inventory_stock_by_location.location_id
        and (
          public.has_permission('nexo.inventory.stock', loc.site_id)
          or public.has_permission('nexo.inventory.remissions.prepare', loc.site_id)
          or public.has_permission('nexo.inventory.remissions.receive', loc.site_id)
          or public.has_permission('nexo.inventory.production_batches', loc.site_id)
          or public.has_permission('nexo.inventory.entries', loc.site_id)
          or public.has_permission('nexo.inventory.transfers', loc.site_id)
        )
    )
  );

drop policy if exists "inventory_stock_by_location_delete_permission" on public.inventory_stock_by_location;
create policy "inventory_stock_by_location_delete_permission" on public.inventory_stock_by_location
  for delete to authenticated
  using (
    exists (
      select 1
      from public.inventory_locations loc
      where loc.id = inventory_stock_by_location.location_id
        and public.has_permission('nexo.inventory.stock', loc.site_id)
    )
  );

-- Helper to apply delta (atomic add/subtract)
create or replace function public.upsert_inventory_stock_by_location(
  p_location_id uuid,
  p_product_id uuid,
  p_delta numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
begin
  select site_id into v_site_id
  from public.inventory_locations
  where id = p_location_id;

  if v_site_id is null then
    raise exception 'location not found';
  end if;

  if not (
    public.has_permission('nexo.inventory.stock', v_site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', v_site_id)
    or public.has_permission('nexo.inventory.remissions.receive', v_site_id)
    or public.has_permission('nexo.inventory.production_batches', v_site_id)
    or public.has_permission('nexo.inventory.entries', v_site_id)
    or public.has_permission('nexo.inventory.transfers', v_site_id)
  ) then
    raise exception 'permission denied';
  end if;

  insert into public.inventory_stock_by_location (location_id, product_id, current_qty, updated_at)
  values (p_location_id, p_product_id, p_delta, now())
  on conflict (location_id, product_id) do update
    set current_qty = public.inventory_stock_by_location.current_qty + excluded.current_qty,
        updated_at = now();
end;
$$;

grant execute on function public.upsert_inventory_stock_by_location(uuid, uuid, numeric) to authenticated;

commit;
