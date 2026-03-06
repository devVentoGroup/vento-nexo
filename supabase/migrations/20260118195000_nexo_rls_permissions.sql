-- NEXO RLS hardening + audit for Fase 1

-- Minimal audit column for movements
alter table public.inventory_movements
  add column if not exists created_by uuid references public.employees(id);

alter table public.inventory_movements
  alter column created_by set default auth.uid();

-- Inventory movements
drop policy if exists "inventory_movements_insert_roles" on public.inventory_movements;
drop policy if exists "inventory_movements_select_site" on public.inventory_movements;
drop policy if exists "inventory_movements_update_owner" on public.inventory_movements;

create policy "inventory_movements_select_permission" on public.inventory_movements
  for select to authenticated
  using (
    public.has_permission('nexo.inventory.movements', site_id)
  );

create policy "inventory_movements_insert_permission" on public.inventory_movements
  for insert to authenticated
  with check (
    public.has_permission('nexo.inventory.movements', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.production_batches', site_id)
  );

-- Inventory stock by site
drop policy if exists "inventory_stock_select_site" on public.inventory_stock_by_site;
drop policy if exists "inventory_stock_write_manager" on public.inventory_stock_by_site;

create policy "inventory_stock_select_permission" on public.inventory_stock_by_site
  for select to authenticated
  using (
    public.has_permission('nexo.inventory.stock', site_id)
  );

create policy "inventory_stock_insert_permission" on public.inventory_stock_by_site
  for insert to authenticated
  with check (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.production_batches', site_id)
  );

create policy "inventory_stock_update_permission" on public.inventory_stock_by_site
  for update to authenticated
  using (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.production_batches', site_id)
  )
  with check (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.production_batches', site_id)
  );

-- Inventory locations (LOC)
drop policy if exists "Employees can view locations of their sites" on public.inventory_locations;
drop policy if exists "Owners and managers can manage locations" on public.inventory_locations;

create policy "inventory_locations_select_permission" on public.inventory_locations
  for select to authenticated
  using (
    public.has_permission('nexo.inventory.locations', site_id)
  );

create policy "inventory_locations_insert_permission" on public.inventory_locations
  for insert to authenticated
  with check (
    public.has_permission('nexo.inventory.locations', site_id)
  );

create policy "inventory_locations_update_permission" on public.inventory_locations
  for update to authenticated
  using (
    public.has_permission('nexo.inventory.locations', site_id)
  )
  with check (
    public.has_permission('nexo.inventory.locations', site_id)
  );

create policy "inventory_locations_delete_permission" on public.inventory_locations
  for delete to authenticated
  using (
    public.has_permission('nexo.inventory.locations', site_id)
  );

-- Inventory LPNs
drop policy if exists "Employees can view LPNs of their sites" on public.inventory_lpns;
drop policy if exists "Staff can manage LPNs" on public.inventory_lpns;

create policy "inventory_lpns_select_permission" on public.inventory_lpns
  for select to authenticated
  using (
    public.has_permission('nexo.inventory.lpns', site_id)
  );

create policy "inventory_lpns_insert_permission" on public.inventory_lpns
  for insert to authenticated
  with check (
    public.has_permission('nexo.inventory.lpns', site_id)
  );

create policy "inventory_lpns_update_permission" on public.inventory_lpns
  for update to authenticated
  using (
    public.has_permission('nexo.inventory.lpns', site_id)
  )
  with check (
    public.has_permission('nexo.inventory.lpns', site_id)
  );

create policy "inventory_lpns_delete_permission" on public.inventory_lpns
  for delete to authenticated
  using (
    public.has_permission('nexo.inventory.lpns', site_id)
  );

-- Procurement receptions
drop policy if exists "employees_crud_receptions" on public.procurement_receptions;
drop policy if exists "employees_crud_reception_items" on public.procurement_reception_items;

create policy "procurement_receptions_select_permission" on public.procurement_receptions
  for select to authenticated
  using (
    public.has_permission('nexo.inventory.stock', site_id)
  );

create policy "procurement_receptions_insert_permission" on public.procurement_receptions
  for insert to authenticated
  with check (
    public.has_permission('nexo.inventory.stock', site_id)
  );

create policy "procurement_receptions_update_permission" on public.procurement_receptions
  for update to authenticated
  using (
    public.has_permission('nexo.inventory.stock', site_id)
  )
  with check (
    public.has_permission('nexo.inventory.stock', site_id)
  );

create policy "procurement_receptions_delete_permission" on public.procurement_receptions
  for delete to authenticated
  using (
    public.has_permission('nexo.inventory.stock', site_id)
  );

create policy "procurement_reception_items_select_permission" on public.procurement_reception_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.procurement_receptions pr
      where pr.id = procurement_reception_items.reception_id
        and public.has_permission('nexo.inventory.stock', pr.site_id)
    )
  );

create policy "procurement_reception_items_insert_permission" on public.procurement_reception_items
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.procurement_receptions pr
      where pr.id = procurement_reception_items.reception_id
        and public.has_permission('nexo.inventory.stock', pr.site_id)
    )
  );

create policy "procurement_reception_items_update_permission" on public.procurement_reception_items
  for update to authenticated
  using (
    exists (
      select 1
      from public.procurement_receptions pr
      where pr.id = procurement_reception_items.reception_id
        and public.has_permission('nexo.inventory.stock', pr.site_id)
    )
  )
  with check (
    exists (
      select 1
      from public.procurement_receptions pr
      where pr.id = procurement_reception_items.reception_id
        and public.has_permission('nexo.inventory.stock', pr.site_id)
    )
  );

create policy "procurement_reception_items_delete_permission" on public.procurement_reception_items
  for delete to authenticated
  using (
    exists (
      select 1
      from public.procurement_receptions pr
      where pr.id = procurement_reception_items.reception_id
        and public.has_permission('nexo.inventory.stock', pr.site_id)
    )
  );

-- Restock requests (remisiones)
drop policy if exists "restock_requests_delete_owner" on public.restock_requests;
drop policy if exists "restock_requests_insert_site" on public.restock_requests;
drop policy if exists "restock_requests_select_site" on public.restock_requests;
drop policy if exists "restock_requests_update_site" on public.restock_requests;

create policy "restock_requests_select_permission" on public.restock_requests
  for select to authenticated
  using (
    public.has_permission('nexo.inventory.remissions', from_site_id)
    or public.has_permission('nexo.inventory.remissions', to_site_id)
    or public.has_permission('nexo.inventory.remissions.all_sites')
  );

create policy "restock_requests_insert_permission" on public.restock_requests
  for insert to authenticated
  with check (
    to_site_id is not null
    and public.has_permission('nexo.inventory.remissions.request', to_site_id)
  );

create policy "restock_requests_update_permission" on public.restock_requests
  for update to authenticated
  using (
    public.has_permission('nexo.inventory.remissions.prepare', from_site_id)
    or public.has_permission('nexo.inventory.remissions.receive', to_site_id)
    or public.has_permission('nexo.inventory.remissions.cancel')
  )
  with check (
    public.has_permission('nexo.inventory.remissions.prepare', from_site_id)
    or public.has_permission('nexo.inventory.remissions.receive', to_site_id)
    or public.has_permission('nexo.inventory.remissions.cancel')
  );

create policy "restock_requests_delete_permission" on public.restock_requests
  for delete to authenticated
  using (
    public.has_permission('nexo.inventory.remissions.cancel')
  );

drop policy if exists "restock_request_items_insert_site" on public.restock_request_items;
drop policy if exists "restock_request_items_select_site" on public.restock_request_items;
drop policy if exists "restock_request_items_update_site" on public.restock_request_items;

create policy "restock_request_items_select_permission" on public.restock_request_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.restock_requests r
      where r.id = restock_request_items.request_id
        and (
          public.has_permission('nexo.inventory.remissions', r.from_site_id)
          or public.has_permission('nexo.inventory.remissions', r.to_site_id)
          or public.has_permission('nexo.inventory.remissions.all_sites')
        )
    )
  );

create policy "restock_request_items_insert_permission" on public.restock_request_items
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.restock_requests r
      where r.id = restock_request_items.request_id
        and (
          public.has_permission('nexo.inventory.remissions.request', r.to_site_id)
          or public.has_permission('nexo.inventory.remissions.prepare', r.from_site_id)
          or public.has_permission('nexo.inventory.remissions.receive', r.to_site_id)
          or public.has_permission('nexo.inventory.remissions.cancel')
        )
    )
  );

create policy "restock_request_items_update_permission" on public.restock_request_items
  for update to authenticated
  using (
    exists (
      select 1
      from public.restock_requests r
      where r.id = restock_request_items.request_id
        and (
          public.has_permission('nexo.inventory.remissions.request', r.to_site_id)
          or public.has_permission('nexo.inventory.remissions.prepare', r.from_site_id)
          or public.has_permission('nexo.inventory.remissions.receive', r.to_site_id)
          or public.has_permission('nexo.inventory.remissions.cancel')
        )
    )
  )
  with check (
    exists (
      select 1
      from public.restock_requests r
      where r.id = restock_request_items.request_id
        and (
          public.has_permission('nexo.inventory.remissions.request', r.to_site_id)
          or public.has_permission('nexo.inventory.remissions.prepare', r.from_site_id)
          or public.has_permission('nexo.inventory.remissions.receive', r.to_site_id)
          or public.has_permission('nexo.inventory.remissions.cancel')
        )
    )
  );

-- Remissions movement application permissions
create or replace function public.apply_restock_shipment(p_request_id uuid)
returns void
language plpgsql
security definer
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

    insert into public.inventory_stock_by_site (site_id, product_id, current_qty, updated_at)
    values (v_request.from_site_id, v_item.product_id, -v_qty, now())
    on conflict (site_id, product_id)
    do update set
      current_qty = public.inventory_stock_by_site.current_qty + excluded.current_qty,
      updated_at = now();
  end loop;
end;
$$;

create or replace function public.apply_restock_receipt(p_request_id uuid)
returns void
language plpgsql
security definer
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

  if v_request.to_site_id is null then
    raise exception 'to_site_id requerido para recepcion de remision';
  end if;

  if not public.has_permission('nexo.inventory.remissions.receive', v_request.to_site_id) then
    raise exception 'permission denied: remissions.receive';
  end if;

  for v_item in
    select *
    from public.restock_request_items
    where request_id = p_request_id
  loop
    v_qty := coalesce(v_item.received_quantity, 0);
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
      v_request.to_site_id,
      v_item.product_id,
      'transfer_in',
      v_qty,
      'Recepcion remision ' || p_request_id::text,
      p_request_id
    );

    insert into public.inventory_stock_by_site (site_id, product_id, current_qty, updated_at)
    values (v_request.to_site_id, v_item.product_id, v_qty, now())
    on conflict (site_id, product_id)
    do update set
      current_qty = public.inventory_stock_by_site.current_qty + excluded.current_qty,
      updated_at = now();
  end loop;
end;
$$;
