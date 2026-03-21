begin;

create or replace function public.reverse_restock_request(
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.restock_requests%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_actor uuid := auth.uid();
  v_marker text;
begin
  select *
  into v_request
  from public.restock_requests
  where id = p_request_id;

  if not found then
    raise exception 'request_not_found';
  end if;

  if v_actor is null then
    raise exception 'permission_denied_reverse';
  end if;

  if not public.has_permission('nexo.inventory.remissions.cancel')
  then
    raise exception 'permission_denied_reverse';
  end if;

  v_marker := '[REVERSA_APLICADA ' || to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || ']';

  if coalesce(v_request.notes, '') like '%[REVERSA_APLICADA %' then
    raise exception 'already_reversed';
  end if;

  /*
    1) Reverse SITE stock only from NET movement balance:
       transfer_out  => stock left a site
       transfer_in   => stock entered a site

       We compute per site+product:
       net_outstanding = outs - ins
       Only positive net_outstanding is reversible.
  */
  with movement_net as (
    select
      m.site_id,
      m.product_id,
      sum(
        case
          when m.movement_type = 'transfer_out' then greatest(coalesce(m.quantity, 0), 0)
          when m.movement_type = 'transfer_in' then -greatest(coalesce(m.quantity, 0), 0)
          else 0
        end
      ) as net_qty
    from public.inventory_movements m
    where m.related_restock_request_id = p_request_id
      and m.site_id is not null
      and m.product_id is not null
      and m.movement_type in ('transfer_out', 'transfer_in')
    group by m.site_id, m.product_id
  ),
  reversible_site as (
    select
      site_id,
      product_id,
      net_qty
    from movement_net
    where net_qty > 0
  )
  insert into public.inventory_movements (
    site_id,
    product_id,
    movement_type,
    quantity,
    reason,
    reference_type,
    reference_id,
    related_restock_request_id,
    metadata,
    created_at
  )
  select
    rs.site_id,
    rs.product_id,
    'adjustment_in',
    rs.net_qty,
    'reverse_restock_request',
    'restock_request',
    p_request_id::text,
    p_request_id,
    jsonb_build_object(
      'action', 'reverse_restock_request',
      'request_id', p_request_id,
      'source', 'reverse_restock_request_rpc',
      'basis', 'net_inventory_movements'
    ),
    v_now
  from reversible_site rs;

  /*
    2) Reverse LOC stock only from NET location movement balance.
       IMPORTANT:
       Never use restock_request_items.shipped_quantity directly for reversal.
       That field describes intent / shipped line qty, not necessarily the net reversible LOC balance.

       We only reverse positive NET transfer_out still pending on each source location.
  */
  with loc_movement_net as (
    select
      m.location_id,
      m.product_id,
      sum(
        case
          when m.movement_type = 'transfer_out' then greatest(coalesce(m.quantity, 0), 0)
          when m.movement_type in ('transfer_in', 'adjustment_in') then -greatest(coalesce(m.quantity, 0), 0)
          when m.movement_type = 'adjustment_out' then greatest(coalesce(m.quantity, 0), 0)
          else 0
        end
      ) as net_qty
    from public.inventory_movements m
    where m.related_restock_request_id = p_request_id
      and m.location_id is not null
      and m.product_id is not null
      and m.movement_type in ('transfer_out', 'transfer_in', 'adjustment_in', 'adjustment_out')
    group by m.location_id, m.product_id
  ),
  reversible_loc as (
    select
      location_id,
      product_id,
      net_qty
    from loc_movement_net
    where net_qty > 0
  ),
  apply_loc as (
    select
      rl.location_id,
      rl.product_id,
      rl.net_qty,
      public.upsert_inventory_stock_by_location(
        rl.location_id,
        rl.product_id,
        rl.net_qty
      ) as applied
    from reversible_loc rl
  )
  
  update public.restock_requests
  set
    status = 'cancelled',
    cancelled_at = coalesce(cancelled_at, v_now),
    status_updated_at = v_now,
    notes = trim(
      both E'\n'
      from concat_ws(E'\n', nullif(notes, ''), v_marker)
    )
  where id = p_request_id;

  end;
$$;

commit;