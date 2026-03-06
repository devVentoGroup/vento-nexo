-- Remisiones NEXO + lotes de produccion (manual) y etiquetas.

-- Restock requests: workflow + tracking
alter table public.restock_requests
  add column if not exists request_code text,
  add column if not exists requested_by_site_id uuid references public.sites(id),
  add column if not exists status_updated_at timestamptz default now(),
  add column if not exists prepared_at timestamptz,
  add column if not exists prepared_by uuid references public.employees(id),
  add column if not exists in_transit_at timestamptz,
  add column if not exists in_transit_by uuid references public.employees(id),
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references public.employees(id),
  add column if not exists cancelled_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists priority text default 'normal',
  add column if not exists request_type text default 'internal';

update public.restock_requests
set requested_by_site_id = coalesce(requested_by_site_id, to_site_id)
where requested_by_site_id is null;

-- Restock items: quantities per etapa
alter table public.restock_request_items
  add column if not exists prepared_quantity numeric not null default 0,
  add column if not exists shipped_quantity numeric not null default 0,
  add column if not exists received_quantity numeric not null default 0,
  add column if not exists shortage_quantity numeric not null default 0,
  add column if not exists item_status text not null default 'pending',
  add column if not exists notes text;

-- Supply routes (satellite -> fulfillment site)
create table if not exists public.site_supply_routes (
  id uuid primary key default gen_random_uuid(),
  requesting_site_id uuid not null references public.sites(id),
  fulfillment_site_id uuid not null references public.sites(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requesting_site_id, fulfillment_site_id)
);

comment on table public.site_supply_routes is 'Mapa de sede solicitante -> sede que abastece remisiones.';

alter table public.site_supply_routes enable row level security;

create policy "site_supply_routes_select_all" on public.site_supply_routes
  for select to authenticated
  using (true);

create policy "site_supply_routes_manage_owner" on public.site_supply_routes
  for all to authenticated
  using (public.is_owner() or public.is_global_manager())
  with check (public.is_owner() or public.is_global_manager());

-- Production batches: code + expiracion
alter table public.production_batches
  add column if not exists batch_code text,
  add column if not exists expires_at timestamptz;

create or replace function public.set_production_batch_code()
returns trigger
language plpgsql
as $$
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  if new.batch_code is null or btrim(new.batch_code) = '' then
    new.batch_code := 'BATCH-' || upper(substr(replace(new.id::text, '-', ''), 1, 8));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_production_batch_code on public.production_batches;

create trigger trg_set_production_batch_code
  before insert on public.production_batches
  for each row execute function public.set_production_batch_code();

-- Inventory movements for remisiones
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

grant execute on function public.apply_restock_shipment(uuid) to authenticated;
grant execute on function public.apply_restock_receipt(uuid) to authenticated;
