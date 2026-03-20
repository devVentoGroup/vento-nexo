-- Fix: no conciliar automáticamente como "received" cuando se registra shortage
-- por un "receive parcial". El shortage se guarda como alerta/faltante,
-- pero el request debe quedar en estado "partial" hasta cierre manual.

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
    -- "received" solo cuando lo recibido alcanza el enviado.
    if v_received_qty >= v_shipped_qty then
      return 'received';
    end if;

    -- Si ya se registró algo (received y/o shortage) pero no se completó,
    -- entonces queda como "partial" (no conciliado/closed).
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

grant execute on function public.compute_restock_item_status(numeric, numeric, numeric, numeric, numeric) to authenticated;

create or replace function public.sync_restock_request_status_from_items(
  p_request_id uuid
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request public.restock_requests%rowtype;
  v_has_items boolean := false;
  v_any_prepared boolean := false;
  v_any_shipped boolean := false;
  v_any_accounted boolean := false;
  v_all_shipped_fully_received boolean := true;
  v_next_status text := 'pending';
begin
  select *
  into v_request
  from public.restock_requests
  where id = p_request_id;

  if v_request.id is null then
    return null;
  end if;

  if v_request.status in ('cancelled', 'closed') then
    return v_request.status;
  end if;

  select
    count(*) > 0,
    bool_or(coalesce(prepared_quantity, 0) > 0),
    bool_or(coalesce(shipped_quantity, 0) > 0),
    bool_or(coalesce(received_quantity, 0) + coalesce(shortage_quantity, 0) > 0),
    bool_and(
      case
        when coalesce(shipped_quantity, 0) > 0
          then coalesce(received_quantity, 0) = coalesce(shipped_quantity, 0)
        else true
      end
    )
  into
    v_has_items,
    v_any_prepared,
    v_any_shipped,
    v_any_accounted,
    v_all_shipped_fully_received
  from public.restock_request_items
  where request_id = p_request_id;

  if not v_has_items then
    v_next_status := 'pending';
  elsif v_any_shipped then
    if coalesce(v_all_shipped_fully_received, false) then
      v_next_status := 'received';
    elsif v_any_accounted then
      v_next_status := 'partial';
    else
      v_next_status := 'in_transit';
    end if;
  elsif v_any_prepared then
    v_next_status := 'preparing';
  else
    v_next_status := 'pending';
  end if;

  update public.restock_requests
  set
    status = v_next_status,
    received_at = case
      when v_next_status in ('partial', 'received')
        then coalesce(received_at, now())
      else received_at
    end,
    status_updated_at = now()
  where id = p_request_id;

  return v_next_status;
end;
$$;

grant execute on function public.sync_restock_request_status_from_items(uuid) to authenticated, service_role;

create or replace function public.get_restock_request_operational_summary(p_request_id uuid)
returns table (
  total_lines integer,
  pending_loc_selection_lines integer,
  dispatch_ready_lines integer,
  dispatch_blocked_lines integer,
  pending_receipt_lines integer,
  shortage_lines integer,
  received_lines integer,
  can_start_prepare boolean,
  can_transit boolean,
  can_complete_receive boolean,
  can_receive_partial boolean
)
language sql
stable
as $$
  with item_metrics as (
    select
      i.id,
      coalesce(i.quantity, 0)::numeric as requested_qty,
      coalesce(i.prepared_quantity, 0)::numeric as prepared_qty,
      coalesce(i.shipped_quantity, 0)::numeric as shipped_qty,
      coalesce(i.received_quantity, 0)::numeric as received_qty,
      coalesce(i.shortage_quantity, 0)::numeric as shortage_qty,
      i.source_location_id as source_location_id
    from public.restock_request_items i
    where i.request_id = p_request_id
  ),
  agg as (
    select
      count(*)::integer as total_lines,
      count(*) filter (
        where requested_qty > 0 and source_location_id is null
      )::integer as pending_loc_selection_lines,
      count(*) filter (
        where requested_qty > 0 and prepared_qty > 0
      )::integer as dispatch_ready_lines,
      count(*) filter (
        where requested_qty > 0 and prepared_qty <= 0
      )::integer as dispatch_blocked_lines,
      count(*) filter (
        -- Antes se usaba received + shortage para decidir pendiente.
        -- Ahora: el faltante es alerta, pero mientras received < shipped hay pendiente real.
        where shipped_qty > 0 and received_qty < shipped_qty
      )::integer as pending_receipt_lines,
      count(*) filter (
        where shortage_qty > 0
      )::integer as shortage_lines,
      count(*) filter (
        where received_qty > 0
      )::integer as received_lines,
      bool_and(
        case
          when requested_qty > 0 then source_location_id is not null
          else true
        end
      ) as all_locs_selected,
      bool_and(
        case
          when requested_qty > 0 then prepared_qty > 0
          else true
        end
      ) as all_lines_prepared,
      bool_and(
        case
          when shipped_qty > 0 then received_qty = shipped_qty
          else true
        end
      ) as all_received_or_short
    from item_metrics
  )
  select
    total_lines,
    pending_loc_selection_lines,
    dispatch_ready_lines,
    dispatch_blocked_lines,
    pending_receipt_lines,
    shortage_lines,
    received_lines,
    total_lines > 0 and pending_loc_selection_lines = 0 and coalesce(all_locs_selected, false) as can_start_prepare,
    total_lines > 0 and dispatch_ready_lines > 0 and dispatch_blocked_lines = 0 and coalesce(all_lines_prepared, false) as can_transit,
    total_lines > 0 and pending_receipt_lines = 0 and coalesce(all_received_or_short, false) as can_complete_receive,
    total_lines > 0 and received_lines > 0 and pending_receipt_lines > 0 as can_receive_partial
  from agg;
$$;

grant execute on function public.get_restock_request_operational_summary(uuid) to authenticated;

