begin;

insert into public.inventory_movement_types (code, name, description, affects_stock)
values (
  'stock_consume_position',
  'Consumo de posicion interna',
  'Descuenta stock interno de estanterias o niveles durante un retiro operativo del LOC',
  0
)
on conflict (code) do nothing;

create or replace function public.consume_inventory_stock_from_positions(
  p_location_id uuid,
  p_product_id uuid,
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
  v_remaining numeric := coalesce(p_quantity, 0);
  v_consumed_total numeric := 0;
  v_take numeric := 0;
  v_stock_unit_code text;
  v_position_count integer := 0;
  v_row record;
begin
  if p_location_id is null or p_product_id is null then
    raise exception 'location and product are required';
  end if;

  if coalesce(p_quantity, 0) <= 0 then
    return jsonb_build_object(
      'locationId', p_location_id,
      'productId', p_product_id,
      'requestedQty', coalesce(p_quantity, 0),
      'consumedQty', 0,
      'unpositionedQty', 0,
      'positionsTouched', 0
    );
  end if;

  select loc.id, loc.site_id, loc.code
    into v_location
  from public.inventory_locations loc
  where loc.id = p_location_id
    and coalesce(loc.is_active, true) = true;

  if not found then
    raise exception 'active LOC not found';
  end if;

  if not (
    public.has_permission('nexo.inventory.withdraw', v_location.site_id)
    or public.has_permission('nexo.inventory.stock', v_location.site_id)
  ) then
    raise exception 'permission denied';
  end if;

  select p.id, p.name, p.unit, p.stock_unit_code
    into v_product
  from public.products p
  where p.id = p_product_id;

  if not found then
    raise exception 'product not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_location_id::text || ':' || p_product_id::text, 0));

  for v_row in
    select sp.position_id, sp.current_qty, pos.name, pos.code, pos.sort_order
    from public.inventory_stock_by_position sp
    join public.inventory_location_positions pos on pos.id = sp.position_id
    where pos.location_id = p_location_id
      and sp.product_id = p_product_id
      and sp.current_qty > 0
      and coalesce(pos.is_active, true) = true
    order by sp.current_qty asc, coalesce(pos.sort_order, 0) asc, pos.code asc, sp.position_id asc
    for update of sp
  loop
    exit when v_remaining <= 0;

    v_take := least(v_remaining, coalesce(v_row.current_qty, 0));
    if v_take <= 0 then
      continue;
    end if;

    update public.inventory_stock_by_position
    set current_qty = current_qty - v_take,
        updated_at = now()
    where position_id = v_row.position_id
      and product_id = p_product_id;

    v_remaining := v_remaining - v_take;
    v_consumed_total := v_consumed_total + v_take;
    v_position_count := v_position_count + 1;
  end loop;

  if v_consumed_total > 0 then
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
      'stock_consume_position',
      -v_consumed_total,
      v_consumed_total,
      v_stock_unit_code,
      1,
      v_stock_unit_code,
      coalesce(
        nullif(trim(p_note), ''),
        format(
          'Consumo interno %s: menor stock primero, %s posiciones',
          coalesce(v_location.code, p_location_id::text),
          v_position_count
        )
      ),
      p_created_by
    );
  end if;

  return jsonb_build_object(
    'locationId', p_location_id,
    'productId', p_product_id,
    'requestedQty', p_quantity,
    'consumedQty', v_consumed_total,
    'unpositionedQty', greatest(0, v_remaining),
    'positionsTouched', v_position_count,
    'rule', 'smallest_position_stock_first'
  );
end;
$$;

grant execute on function public.consume_inventory_stock_from_positions(uuid, uuid, numeric, uuid, text)
  to authenticated;

commit;
