begin;

alter table public.orders
  add column if not exists fulfillment_type text not null default 'on_premise',
  add column if not exists requested_for timestamptz,
  add column if not exists contact_phone text,
  add column if not exists delivery_address jsonb not null default '{}'::jsonb,
  add column if not exists delivery_zone text,
  add column if not exists delivery_fee_amount numeric not null default 0,
  add column if not exists dispatch_status text not null default 'not_required',
  add column if not exists dispatch_partner text,
  add column if not exists dispatch_reference text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists ready_for_dispatch_at timestamptz,
  add column if not exists on_the_way_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists cancelled_at timestamptz;

update public.orders
set
  fulfillment_type = case
    when order_type = 'takeaway' then 'pickup'
    else 'on_premise'
  end,
  contact_phone = coalesce(nullif(contact_phone, ''), nullif(guest_info ->> 'phone', ''), nullif(guest_info ->> 'contact_phone', '')),
  delivery_address = case
    when delivery_address = '{}'::jsonb and jsonb_typeof(guest_info -> 'delivery_address') = 'object'
      then guest_info -> 'delivery_address'
    else delivery_address
  end,
  requested_for = coalesce(
    requested_for,
    case
      when coalesce(guest_info ->> 'requested_for', '') ~ '^\d{4}-\d{2}-\d{2}'
        then (guest_info ->> 'requested_for')::timestamptz
      else null
    end
  )
where true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_fulfillment_type_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_fulfillment_type_check
      check (fulfillment_type = any (array['on_premise'::text, 'pickup'::text, 'delivery'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_dispatch_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_dispatch_status_check
      check (dispatch_status = any (array['not_required'::text, 'pending'::text, 'scheduled'::text, 'assigned'::text, 'on_the_way'::text, 'delivered'::text, 'cancelled'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_delivery_address_object_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_delivery_address_object_check
      check (jsonb_typeof(delivery_address) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_delivery_fee_amount_nonnegative_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_delivery_fee_amount_nonnegative_check
      check (delivery_fee_amount >= 0);
  end if;
end
$$;

create index if not exists idx_orders_client_fulfillment_created_at
  on public.orders (client_id, fulfillment_type, created_at desc);

create index if not exists idx_orders_site_dispatch_status_created_at
  on public.orders (site_id, dispatch_status, created_at desc)
  where fulfillment_type = 'delivery';

create or replace function public.sync_order_fulfillment_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fulfillment_type = 'delivery' then
    if coalesce(new.dispatch_status, '') = '' or new.dispatch_status = 'not_required' then
      new.dispatch_status := 'pending';
    end if;
  else
    new.dispatch_status := 'not_required';
  end if;

  if new.status = 'confirmed' and new.confirmed_at is null then
    new.confirmed_at := now();
  end if;

  if new.status = 'ready_for_dispatch' and new.ready_for_dispatch_at is null then
    new.ready_for_dispatch_at := now();
  end if;

  if new.status = 'on_the_way' and new.on_the_way_at is null then
    new.on_the_way_at := now();
    if new.fulfillment_type = 'delivery' then
      new.dispatch_status := 'on_the_way';
    end if;
  end if;

  if new.status = 'delivered' and new.delivered_at is null then
    new.delivered_at := now();
    if new.fulfillment_type = 'delivery' then
      new.dispatch_status := 'delivered';
    end if;
  end if;

  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
    if new.fulfillment_type = 'delivery' then
      new.dispatch_status := 'cancelled';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_orders_sync_fulfillment_state on public.orders;
create trigger trg_orders_sync_fulfillment_state
before insert or update on public.orders
for each row
execute function public.sync_order_fulfillment_state();

comment on column public.orders.fulfillment_type is 'MVP pedidos: define si la orden es consumo interno, pickup o delivery.';
comment on column public.orders.delivery_address is 'MVP pedidos: direccion estructurada para delivery, incluyendo referencia, barrio y detalles del destino.';
comment on column public.orders.dispatch_status is 'MVP pedidos: estado operativo del despacho cuando fulfillment_type = delivery.';
comment on table public.orders is 'Core – tabla canónica para pedidos de clientes. Registro maestro de órdenes de venta/consumo con soporte MVP para on premise, pickup y delivery.';

commit;
