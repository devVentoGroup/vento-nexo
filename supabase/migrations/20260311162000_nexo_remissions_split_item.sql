-- Escape hatch v1: partir una linea de remision cuando el stock existe
-- en varios LOCs, sin abrir todavia el modelo completo multi-LOC por linea.
create or replace function public.split_restock_request_item(
  p_item_id uuid,
  p_split_quantity numeric
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_item public.restock_request_items%rowtype;
  v_request public.restock_requests%rowtype;
  v_original_quantity numeric;
  v_split_quantity numeric;
  v_split_ratio numeric;
  v_split_input_qty numeric;
  v_remaining_input_qty numeric;
  v_split_transfer_total numeric;
  v_remaining_transfer_total numeric;
  v_new_item_id uuid;
begin
  v_split_quantity := coalesce(p_split_quantity, 0);

  select *
  into v_item
  from public.restock_request_items
  where id = p_item_id;

  if v_item.id is null then
    raise exception 'Linea de remision no encontrada.';
  end if;

  select *
  into v_request
  from public.restock_requests
  where id = v_item.request_id;

  if v_request.id is null then
    raise exception 'Remision no encontrada para la linea indicada.';
  end if;

  if v_request.from_site_id is null then
    raise exception 'La remision no tiene sede origen.';
  end if;

  if v_request.status not in ('pending', 'preparing') then
    raise exception 'Solo puedes partir lineas en remisiones pendientes o preparando.';
  end if;

  if not public.has_permission('nexo.inventory.remissions.prepare', v_request.from_site_id) then
    raise exception 'No tienes permiso para partir lineas en esta remision.';
  end if;

  v_original_quantity := coalesce(v_item.quantity, 0);

  if v_original_quantity <= 0 then
    raise exception 'La linea no tiene cantidad valida para partir.';
  end if;

  if v_split_quantity <= 0 then
    raise exception 'La cantidad a partir debe ser mayor que cero.';
  end if;

  if v_split_quantity >= v_original_quantity then
    raise exception 'La cantidad a partir debe ser menor que la cantidad actual.';
  end if;

  if coalesce(v_item.prepared_quantity, 0) <> 0
     or coalesce(v_item.shipped_quantity, 0) <> 0
     or coalesce(v_item.received_quantity, 0) <> 0
     or coalesce(v_item.shortage_quantity, 0) <> 0 then
    raise exception 'Solo puedes partir lineas que todavia no tengan preparacion, envio, recepcion ni faltantes.';
  end if;

  v_split_ratio := v_split_quantity / v_original_quantity;
  v_split_input_qty := case
    when v_item.input_qty is null then null
    else v_item.input_qty * v_split_ratio
  end;
  v_remaining_input_qty := case
    when v_item.input_qty is null then null
    else v_item.input_qty - v_split_input_qty
  end;
  v_split_transfer_total := case
    when v_item.transfer_total is null then null
    else v_item.transfer_total * v_split_ratio
  end;
  v_remaining_transfer_total := case
    when v_item.transfer_total is null then null
    else v_item.transfer_total - v_split_transfer_total
  end;

  insert into public.restock_request_items (
    request_id,
    product_id,
    quantity,
    unit,
    transfer_unit_price,
    transfer_currency,
    transfer_total,
    input_qty,
    input_unit_code,
    conversion_factor_to_stock,
    stock_unit_code,
    production_area_kind,
    source_location_id,
    prepared_quantity,
    shipped_quantity,
    received_quantity,
    shortage_quantity,
    item_status,
    notes
  )
  values (
    v_item.request_id,
    v_item.product_id,
    v_split_quantity,
    v_item.unit,
    v_item.transfer_unit_price,
    v_item.transfer_currency,
    v_split_transfer_total,
    v_split_input_qty,
    v_item.input_unit_code,
    v_item.conversion_factor_to_stock,
    v_item.stock_unit_code,
    v_item.production_area_kind,
    null,
    0,
    0,
    0,
    0,
    coalesce(v_item.item_status, 'pending'),
    v_item.notes
  )
  returning id into v_new_item_id;

  update public.restock_request_items
  set
    quantity = v_original_quantity - v_split_quantity,
    input_qty = v_remaining_input_qty,
    transfer_total = v_remaining_transfer_total
  where id = v_item.id;

  return v_new_item_id;
end;
$$;

grant execute on function public.split_restock_request_item(uuid, numeric) to authenticated;
