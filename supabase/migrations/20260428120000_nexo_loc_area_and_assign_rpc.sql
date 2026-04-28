begin;

-- LOCs belong to an area, areas belong to a site, and internal positions belong to a LOC.
-- This keeps the operational LOC visible while allowing shelves/levels as internal detail.

insert into public.areas (site_id, code, name, kind, is_active)
select s.id, 'OPERACION', 'Operacion', 'general', true
from public.sites s
where not exists (
  select 1
  from public.areas a
  where a.site_id = s.id
    and coalesce(a.is_active, true) = true
);

alter table public.inventory_locations
  add column if not exists area_id uuid references public.areas(id) on delete restrict;

update public.inventory_locations loc
set area_id = (
  select a.id
  from public.areas a
  where a.site_id = loc.site_id
    and coalesce(a.is_active, true) = true
  order by
    case
      when upper(a.code) = upper(coalesce(loc.zone, '')) then 0
      when lower(a.name) = lower(coalesce(loc.description, '')) then 1
      when a.kind = coalesce(loc.location_type, '') then 2
      when a.kind = 'general' then 3
      else 4
    end,
    a.created_at,
    a.id
  limit 1
)
where loc.area_id is null;

alter table public.inventory_locations
  alter column area_id set not null;

create index if not exists idx_inv_locations_area
  on public.inventory_locations(area_id);

create or replace function public.enforce_inventory_location_area_site()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_area_site_id uuid;
begin
  select a.site_id
    into v_area_site_id
  from public.areas a
  where a.id = new.area_id;

  if v_area_site_id is null then
    raise exception 'area not found for LOC';
  end if;

  if v_area_site_id <> new.site_id then
    raise exception 'LOC area must belong to the same site';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_inventory_location_area_site
  on public.inventory_locations;
create trigger enforce_inventory_location_area_site
  before insert or update of site_id, area_id on public.inventory_locations
  for each row
  execute function public.enforce_inventory_location_area_site();

create or replace function public.enforce_inventory_location_position_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_location_site_id uuid;
  v_parent_location_id uuid;
begin
  select loc.site_id
    into v_location_site_id
  from public.inventory_locations loc
  where loc.id = new.location_id;

  if v_location_site_id is null then
    raise exception 'LOC not found for internal position';
  end if;

  new.site_id := v_location_site_id;

  if new.parent_position_id is not null then
    select parent.location_id
      into v_parent_location_id
    from public.inventory_location_positions parent
    where parent.id = new.parent_position_id;

    if v_parent_location_id is null then
      raise exception 'parent position not found';
    end if;

    if v_parent_location_id <> new.location_id then
      raise exception 'parent position must belong to the same LOC';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_inventory_location_position_scope
  on public.inventory_location_positions;
create trigger enforce_inventory_location_position_scope
  before insert or update of site_id, location_id, parent_position_id
  on public.inventory_location_positions
  for each row
  execute function public.enforce_inventory_location_position_scope();

create or replace function public.assign_inventory_stock_to_location(
  p_site_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_created_by uuid default auth.uid(),
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_location record;
  v_product record;
  v_site_qty numeric := 0;
  v_assigned_qty numeric := 0;
  v_available_qty numeric := 0;
  v_stock_unit_code text;
begin
  if p_site_id is null or p_product_id is null or p_location_id is null then
    raise exception 'site, product and location are required';
  end if;

  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'quantity must be greater than zero';
  end if;

  if not public.has_permission('nexo.inventory.stock', p_site_id) then
    raise exception 'permission denied';
  end if;

  select loc.id, loc.code, loc.site_id
    into v_location
  from public.inventory_locations loc
  where loc.id = p_location_id
    and loc.site_id = p_site_id
    and coalesce(loc.is_active, true) = true
  for update;

  if not found then
    raise exception 'active LOC not found for site';
  end if;

  select p.id, p.name, p.unit, p.stock_unit_code
    into v_product
  from public.products p
  where p.id = p_product_id;

  if not found then
    raise exception 'product not found';
  end if;

  select coalesce(s.current_qty, 0)
    into v_site_qty
  from public.inventory_stock_by_site s
  where s.site_id = p_site_id
    and s.product_id = p_product_id
  for update;

  v_site_qty := coalesce(v_site_qty, 0);

  select coalesce(sum(coalesce(s.current_qty, 0)), 0)
    into v_assigned_qty
  from public.inventory_stock_by_location s
  join public.inventory_locations loc on loc.id = s.location_id
  where loc.site_id = p_site_id
    and coalesce(loc.is_active, true) = true
    and s.product_id = p_product_id;

  v_available_qty := greatest(0, v_site_qty - coalesce(v_assigned_qty, 0));

  if p_quantity > v_available_qty + 0.000001 then
    raise exception 'only % is available without LOC', v_available_qty;
  end if;

  v_stock_unit_code := coalesce(nullif(v_product.stock_unit_code, ''), nullif(v_product.unit, ''), 'un');

  insert into public.inventory_movements (
    site_id,
    product_id,
    movement_type,
    quantity,
    input_qty,
    input_unit_code,
    conversion_factor_to_stock,
    stock_unit_code,
    note,
    created_by
  )
  values (
    p_site_id,
    p_product_id,
    'stock_assign_location',
    p_quantity,
    p_quantity,
    v_stock_unit_code,
    1,
    v_stock_unit_code,
    coalesce(
      nullif(trim(p_note), ''),
      format('Asignacion de stock sin area a %s: %s', v_location.code, v_product.name)
    ),
    p_created_by
  );

  insert into public.inventory_stock_by_location (location_id, product_id, current_qty, updated_at)
  values (p_location_id, p_product_id, p_quantity, now())
  on conflict (location_id, product_id) do update
    set current_qty = public.inventory_stock_by_location.current_qty + excluded.current_qty,
        updated_at = now();

  return jsonb_build_object(
    'siteId', p_site_id,
    'productId', p_product_id,
    'locationId', p_location_id,
    'assignedQty', p_quantity,
    'availableBefore', v_available_qty,
    'availableAfter', greatest(0, v_available_qty - p_quantity)
  );
end;
$$;

grant execute on function public.assign_inventory_stock_to_location(uuid, uuid, uuid, numeric, uuid, text)
  to authenticated;

commit;
