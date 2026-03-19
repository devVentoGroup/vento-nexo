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
        where shipped_qty > 0 and (received_qty + shortage_qty) < shipped_qty
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
          when shipped_qty > 0 then (received_qty + shortage_qty) = shipped_qty
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
