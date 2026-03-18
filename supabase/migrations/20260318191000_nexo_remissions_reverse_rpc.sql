begin;

create or replace function public.reverse_restock_request(
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.restock_requests%rowtype;
  v_now timestamptz := now();
  v_marker text := '[REVERSA_APLICADA @ ' || to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || ']';
  v_out record;
  v_in record;
  v_loc record;
begin
  select *
  into v_request
  from public.restock_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'request_not_found';
  end if;

  if coalesce(v_request.notes, '') like '%[REVERSA_APLICADA%' then
    raise exception 'already_reversed';
  end if;

  if not (
    public.has_permission('nexo.inventory.remissions.cancel', v_request.from_site_id)
    or public.has_permission('nexo.inventory.remissions.cancel', v_request.to_site_id)
    or public.has_permission('nexo.inventory.remissions.cancel')
  ) then
    raise exception 'permission_denied_reverse';
  end if;

  if v_request.from_site_id is not null then
    for v_out in
      select m.product_id, coalesce(sum(m.quantity), 0)::numeric as qty
      from public.inventory_movements m
      where m.related_restock_request_id = p_request_id
        and m.site_id = v_request.from_site_id
        and m.movement_type = 'transfer_out'
      group by m.product_id
    loop
      if coalesce(v_out.qty, 0) <= 0 then
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
        v_out.product_id,
        'transfer_in',
        v_out.qty,
        'Reversa remision ' || p_request_id::text,
        p_request_id
      );

      insert into public.inventory_stock_by_site (
        site_id,
        product_id,
        current_qty,
        updated_at
      )
      values (
        v_request.from_site_id,
        v_out.product_id,
        v_out.qty,
        v_now
      )
      on conflict (site_id, product_id)
      do update set
        current_qty = public.inventory_stock_by_site.current_qty + excluded.current_qty,
        updated_at = v_now;
    end loop;
  end if;

  if v_request.to_site_id is not null then
    for v_in in
      select m.product_id, coalesce(sum(m.quantity), 0)::numeric as qty
      from public.inventory_movements m
      where m.related_restock_request_id = p_request_id
        and m.site_id = v_request.to_site_id
        and m.movement_type = 'transfer_in'
      group by m.product_id
    loop
      if coalesce(v_in.qty, 0) <= 0 then
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
        v_request.to_site_id,
        v_in.product_id,
        'transfer_out',
        v_in.qty,
        'Reversa remision ' || p_request_id::text,
        p_request_id
      );

      insert into public.inventory_stock_by_site (
        site_id,
        product_id,
        current_qty,
        updated_at
      )
      values (
        v_request.to_site_id,
        v_in.product_id,
        -v_in.qty,
        v_now
      )
      on conflict (site_id, product_id)
      do update set
        current_qty = public.inventory_stock_by_site.current_qty + excluded.current_qty,
        updated_at = v_now;
    end loop;
  end if;

  for v_loc in
    select
      rri.source_location_id as location_id,
      rri.product_id,
      coalesce(sum(rri.shipped_quantity), 0)::numeric as qty
    from public.restock_request_items rri
    where rri.request_id = p_request_id
      and rri.source_location_id is not null
    group by rri.source_location_id, rri.product_id
  loop
    if coalesce(v_loc.qty, 0) <= 0 then
      continue;
    end if;

    insert into public.inventory_stock_by_location (
      location_id,
      product_id,
      current_qty,
      updated_at
    )
    values (
      v_loc.location_id,
      v_loc.product_id,
      v_loc.qty,
      v_now
    )
    on conflict (location_id, product_id)
    do update set
      current_qty = public.inventory_stock_by_location.current_qty + excluded.current_qty,
      updated_at = v_now;
  end loop;

  update public.restock_request_items
  set item_status = 'cancelled'
  where request_id = p_request_id;

  update public.restock_requests
  set
    status = 'cancelled',
    cancelled_at = coalesce(cancelled_at, v_now),
    status_updated_at = v_now,
    notes = case
      when coalesce(notes, '') = '' then v_marker
      else notes || E'\n' || v_marker
    end
  where id = p_request_id;
end;
$$;

grant execute on function public.reverse_restock_request(uuid) to authenticated;

commit;
