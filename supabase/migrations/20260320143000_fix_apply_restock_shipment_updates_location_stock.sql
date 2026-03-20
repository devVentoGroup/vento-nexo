-- Ensure shipment decreases inventory_stock_by_location as well.
-- Otherwise UI shows stale LOC quantities during "Preparar salida".

create or replace function public.apply_restock_shipment(p_request_id uuid) returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_request record;
  v_item record;
  v_qty numeric;
begin
  select *
  into v_request
  from public.restock_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'restock_request not found: %', p_request_id;
  end if;

  if v_request.from_site_id is null then
    raise exception 'from_site_id requerido para salida de remision';
  end if;

  if not public.has_permission('nexo.inventory.remissions.prepare', v_request.from_site_id) then
    raise exception 'permission denied: remissions.prepare';
  end if;

  for v_item in
    select *
    from public.restock_request_items
    where request_id = p_request_id
  loop
    v_qty := coalesce(v_item.shipped_quantity, 0);
    if v_qty <= 0 then
      continue;
    end if;

    insert into public.inventory_movements (
      site_id,
      product_id,
      movement_type,
      quantity,
      note,
      related_restock_request_id
    )
    values (
      v_request.from_site_id,
      v_item.product_id,
      'transfer_out',
      v_qty,
      'Salida remision ' || p_request_id::text,
      p_request_id
    );

    -- Totales por sede
    insert into public.inventory_stock_by_site (site_id, product_id, current_qty, updated_at)
    values (v_request.from_site_id, v_item.product_id, -v_qty, now())
    on conflict (site_id, product_id)
    do update set
      current_qty = public.inventory_stock_by_site.current_qty + excluded.current_qty,
      updated_at = now();

    -- Totales por LOC (si ya existe source_location_id para la línea)
    if v_item.source_location_id is not null then
      perform public.upsert_inventory_stock_by_location(v_item.source_location_id, v_item.product_id, -v_qty);
    end if;
  end loop;
end;
$$;

-- keep grants from the original function if needed (not re-granting here intentionally)

