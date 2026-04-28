begin;

create table if not exists public.inventory_stock_by_position (
  position_id uuid not null references public.inventory_location_positions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  current_qty numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (position_id, product_id)
);

create index if not exists idx_inventory_stock_by_position_position
  on public.inventory_stock_by_position(position_id);

create index if not exists idx_inventory_stock_by_position_product
  on public.inventory_stock_by_position(product_id);

alter table public.inventory_stock_by_position enable row level security;

drop policy if exists "inventory_stock_by_position_select_permission"
  on public.inventory_stock_by_position;
create policy "inventory_stock_by_position_select_permission"
  on public.inventory_stock_by_position
  for select
  using (
    exists (
      select 1
      from public.inventory_location_positions pos
      where pos.id = inventory_stock_by_position.position_id
        and public.can_access_site(pos.site_id)
    )
  );

drop policy if exists "inventory_stock_by_position_write_permission"
  on public.inventory_stock_by_position;
create policy "inventory_stock_by_position_write_permission"
  on public.inventory_stock_by_position
  for all
  using (
    exists (
      select 1
      from public.inventory_location_positions pos
      where pos.id = inventory_stock_by_position.position_id
        and public.has_permission('nexo.inventory.stock', pos.site_id)
    )
  )
  with check (
    exists (
      select 1
      from public.inventory_location_positions pos
      where pos.id = inventory_stock_by_position.position_id
        and public.has_permission('nexo.inventory.stock', pos.site_id)
    )
  );

grant all on table public.inventory_stock_by_position to anon;
grant all on table public.inventory_stock_by_position to authenticated;
grant all on table public.inventory_stock_by_position to service_role;

insert into public.inventory_movement_types (code, name, description, affects_stock)
values (
  'stock_assign_position',
  'Asignacion a posicion interna',
  'Asigna stock existente de un LOC a una estanteria, nivel o posicion interna sin cambiar el total del LOC',
  0
)
on conflict (code) do nothing;

create or replace function public.assign_inventory_stock_to_position(
  p_location_id uuid,
  p_product_id uuid,
  p_position_id uuid,
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
  v_position record;
  v_product record;
  v_location_qty numeric := 0;
  v_positioned_qty numeric := 0;
  v_available_qty numeric := 0;
  v_stock_unit_code text;
begin
  if p_location_id is null or p_product_id is null or p_position_id is null then
    raise exception 'location, product and position are required';
  end if;

  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'quantity must be greater than zero';
  end if;

  select loc.id, loc.site_id, loc.code
    into v_location
  from public.inventory_locations loc
  where loc.id = p_location_id
    and coalesce(loc.is_active, true) = true;

  if not found then
    raise exception 'active LOC not found';
  end if;

  if not public.has_permission('nexo.inventory.stock', v_location.site_id) then
    raise exception 'permission denied';
  end if;

  select pos.id, pos.location_id, pos.site_id, pos.code, pos.name
    into v_position
  from public.inventory_location_positions pos
  where pos.id = p_position_id
    and pos.location_id = p_location_id
    and coalesce(pos.is_active, true) = true;

  if not found then
    raise exception 'active internal position not found for LOC';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_location_id::text || ':' || p_product_id::text, 0));

  select p.id, p.name, p.unit, p.stock_unit_code
    into v_product
  from public.products p
  where p.id = p_product_id;

  if not found then
    raise exception 'product not found';
  end if;

  select coalesce(s.current_qty, 0)
    into v_location_qty
  from public.inventory_stock_by_location s
  where s.location_id = p_location_id
    and s.product_id = p_product_id
  for update;

  v_location_qty := coalesce(v_location_qty, 0);

  select coalesce(sum(coalesce(sp.current_qty, 0)), 0)
    into v_positioned_qty
  from public.inventory_stock_by_position sp
  join public.inventory_location_positions pos on pos.id = sp.position_id
  where pos.location_id = p_location_id
    and sp.product_id = p_product_id;

  v_available_qty := greatest(0, v_location_qty - coalesce(v_positioned_qty, 0));

  if p_quantity > v_available_qty + 0.000001 then
    raise exception 'only % is available without internal position', v_available_qty;
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
    v_location.site_id,
    p_product_id,
    'stock_assign_position',
    p_quantity,
    p_quantity,
    v_stock_unit_code,
    1,
    v_stock_unit_code,
    coalesce(
      nullif(trim(p_note), ''),
      format('Asignacion interna %s > %s: %s', v_location.code, v_position.name, v_product.name)
    ),
    p_created_by
  );

  insert into public.inventory_stock_by_position (position_id, product_id, current_qty, updated_at)
  values (p_position_id, p_product_id, p_quantity, now())
  on conflict (position_id, product_id) do update
    set current_qty = public.inventory_stock_by_position.current_qty + excluded.current_qty,
        updated_at = now();

  return jsonb_build_object(
    'locationId', p_location_id,
    'positionId', p_position_id,
    'productId', p_product_id,
    'assignedQty', p_quantity,
    'availableBefore', v_available_qty,
    'availableAfter', greatest(0, v_available_qty - p_quantity)
  );
end;
$$;

grant execute on function public.assign_inventory_stock_to_position(uuid, uuid, uuid, numeric, uuid, text)
  to authenticated;

commit;
