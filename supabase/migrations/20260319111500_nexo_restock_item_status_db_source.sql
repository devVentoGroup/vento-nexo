create or replace function public.compute_restock_item_status(
  p_requested_qty numeric,
  p_prepared_qty numeric,
  p_shipped_qty numeric,
  p_received_qty numeric,
  p_shortage_qty numeric
)
returns text
language plpgsql
immutable
as $$
declare
  v_requested_qty numeric := round(coalesce(p_requested_qty, 0)::numeric, 2);
  v_prepared_qty numeric := round(coalesce(p_prepared_qty, 0)::numeric, 2);
  v_shipped_qty numeric := round(coalesce(p_shipped_qty, 0)::numeric, 2);
  v_received_qty numeric := round(coalesce(p_received_qty, 0)::numeric, 2);
  v_shortage_qty numeric := round(coalesce(p_shortage_qty, 0)::numeric, 2);
  v_accounted_qty numeric := round(coalesce(p_received_qty, 0)::numeric + coalesce(p_shortage_qty, 0)::numeric, 2);
begin
  if v_shipped_qty > 0 then
    if v_accounted_qty >= v_shipped_qty then
      return 'received';
    end if;
    if v_accounted_qty > 0 then
      return 'partial';
    end if;
    return 'in_transit';
  end if;

  if v_prepared_qty > 0 then
    return 'preparing';
  end if;

  if v_requested_qty > 0 then
    return 'pending';
  end if;

  return 'pending';
end;
$$;

create or replace function public.sync_restock_item_status_trigger()
returns trigger
language plpgsql
as $$
begin
  new.item_status := public.compute_restock_item_status(
    new.quantity,
    new.prepared_quantity,
    new.shipped_quantity,
    new.received_quantity,
    new.shortage_quantity
  );
  return new;
end;
$$;

drop trigger if exists trg_sync_restock_item_status on public.restock_request_items;

create trigger trg_sync_restock_item_status
before insert or update of quantity, prepared_quantity, shipped_quantity, received_quantity, shortage_quantity
on public.restock_request_items
for each row
execute function public.sync_restock_item_status_trigger();

update public.restock_request_items
set item_status = public.compute_restock_item_status(
  quantity,
  prepared_quantity,
  shipped_quantity,
  received_quantity,
  shortage_quantity
);

grant execute on function public.compute_restock_item_status(numeric, numeric, numeric, numeric, numeric) to authenticated;
