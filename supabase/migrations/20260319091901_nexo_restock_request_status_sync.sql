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
  v_all_shipped_fully_accounted boolean := true;
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
          then coalesce(received_quantity, 0) + coalesce(shortage_quantity, 0) = coalesce(shipped_quantity, 0)
        else true
      end
    )
  into
    v_has_items,
    v_any_prepared,
    v_any_shipped,
    v_any_accounted,
    v_all_shipped_fully_accounted
  from public.restock_request_items
  where request_id = p_request_id;

  if not v_has_items then
    v_next_status := 'pending';
  elsif v_any_shipped then
    if coalesce(v_all_shipped_fully_accounted, false) then
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

comment on function public.sync_restock_request_status_from_items(uuid) is
  'Recalcula el estado de una remisión con base en las cantidades preparadas, enviadas, recibidas y faltantes de sus líneas.';

create or replace function public.trg_sync_restock_request_status_from_items()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request_id uuid;
begin
  v_request_id := coalesce(new.request_id, old.request_id);

  if v_request_id is not null then
    perform public.sync_restock_request_status_from_items(v_request_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_restock_request_status_from_items on public.restock_request_items;

create trigger trg_sync_restock_request_status_from_items
after insert or update of quantity, prepared_quantity, shipped_quantity, received_quantity, shortage_quantity, item_status, request_id
or delete
on public.restock_request_items
for each row
execute function public.trg_sync_restock_request_status_from_items();

do $$
declare
  v_request record;
begin
  for v_request in
    select id
    from public.restock_requests
    where status not in ('cancelled', 'closed')
  loop
    perform public.sync_restock_request_status_from_items(v_request.id);
  end loop;
end $$;

grant execute on function public.sync_restock_request_status_from_items(uuid) to authenticated, service_role;
