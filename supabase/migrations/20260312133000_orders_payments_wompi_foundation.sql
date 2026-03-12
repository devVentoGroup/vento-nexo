begin;

create schema if not exists payments;
grant usage on schema payments to authenticated, service_role;

create table if not exists payments.transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  provider text not null default 'wompi',
  provider_reference text,
  idempotency_key text not null,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'COP',
  status text not null default 'pending'
    check (status in ('pending', 'requires_action', 'approved', 'rejected', 'cancelled', 'refunded', 'error')),
  payment_method text,
  metadata jsonb not null default '{}'::jsonb,
  raw_request jsonb not null default '{}'::jsonb,
  raw_response jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, idempotency_key)
);

create unique index if not exists payments_transactions_provider_reference_unique
  on payments.transactions(provider, provider_reference)
  where provider_reference is not null;

create index if not exists payments_transactions_user_created_idx
  on payments.transactions(user_id, created_at desc);

create index if not exists payments_transactions_order_created_idx
  on payments.transactions(order_id, created_at desc);

create table if not exists payments.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  transaction_id uuid references payments.transactions(id) on delete set null,
  signature_valid boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table payments.transactions enable row level security;
alter table payments.webhook_events enable row level security;

drop policy if exists payments_transactions_select_self on payments.transactions;
create policy payments_transactions_select_self
on payments.transactions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists payments_transactions_select_staff on payments.transactions;
create policy payments_transactions_select_staff
on payments.transactions
for select
to authenticated
using (
  public.is_employee()
  and site_id is not null
  and public.can_access_site(site_id)
);

grant select on payments.transactions to authenticated, service_role;
grant insert, update, select on payments.transactions to service_role;
grant insert, update, select on payments.webhook_events to service_role;

drop trigger if exists trg_payments_transactions_updated_at on payments.transactions;
create trigger trg_payments_transactions_updated_at
before update on payments.transactions
for each row execute function public.update_updated_at();

alter table public.orders
  add column if not exists subtotal_amount numeric not null default 0,
  add column if not exists payment_provider text,
  add column if not exists payment_reference text,
  add column if not exists payment_intent_id uuid references payments.transactions(id) on delete set null,
  add column if not exists checkout_expires_at timestamptz;

create index if not exists idx_orders_client_payment_status_created_at
  on public.orders (client_id, payment_status, created_at desc);

create or replace function public.create_order_checkout_draft(
  p_site_id uuid,
  p_satellite_name text,
  p_fulfillment_type text,
  p_contact_name text,
  p_contact_phone text,
  p_address_line text,
  p_address_reference text,
  p_notes text,
  p_items jsonb,
  p_delivery_fee_amount numeric default 0,
  p_source text default 'vento_pass'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_order_id uuid;
  v_tx_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_subtotal numeric := 0;
  v_delivery numeric := greatest(coalesce(p_delivery_fee_amount, 0), 0);
  v_total numeric := 0;
  v_fulfillment text := lower(trim(coalesce(p_fulfillment_type, 'delivery')));
  v_order_type text := 'takeaway';
  v_delivery_address jsonb := '{}'::jsonb;
  v_idempotency_key text := gen_random_uuid()::text;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  if p_site_id is null then
    raise exception 'site_required';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required';
  end if;

  if v_fulfillment not in ('delivery', 'pickup', 'on_premise') then
    raise exception 'invalid_fulfillment_type';
  end if;

  if v_fulfillment = 'on_premise' then
    v_order_type := 'dine_in';
  end if;

  if v_fulfillment = 'delivery' then
    v_delivery_address := jsonb_build_object(
      'line1', nullif(trim(coalesce(p_address_line, '')), ''),
      'reference', nullif(trim(coalesce(p_address_reference, '')), '')
    );
    if coalesce(v_delivery_address ->> 'line1', '') = '' then
      raise exception 'delivery_address_required';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_quantity := greatest(coalesce((v_item ->> 'quantity')::numeric, 0), 0);
    v_unit_price := greatest(coalesce((v_item ->> 'unit_price')::numeric, 0), 0);

    if v_product_id is null then
      raise exception 'item_product_required';
    end if;
    if v_quantity <= 0 then
      raise exception 'invalid_item_quantity';
    end if;
    if v_unit_price < 0 then
      raise exception 'invalid_item_price';
    end if;

    v_subtotal := v_subtotal + (v_quantity * v_unit_price);
  end loop;

  v_total := v_subtotal + v_delivery;

  insert into public.orders (
    client_id,
    order_type,
    source,
    status,
    payment_status,
    total_amount,
    subtotal_amount,
    notes,
    site_id,
    guest_info,
    fulfillment_type,
    contact_phone,
    delivery_address,
    delivery_fee_amount,
    payment_provider,
    checkout_expires_at
  )
  values (
    v_uid,
    v_order_type,
    coalesce(nullif(trim(coalesce(p_source, '')), ''), 'vento_pass'),
    'pending',
    'pending_payment',
    v_total,
    v_subtotal,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_site_id,
    jsonb_build_object(
      'contact_name', nullif(trim(coalesce(p_contact_name, '')), ''),
      'contact_phone', nullif(trim(coalesce(p_contact_phone, '')), ''),
      'fulfillment_type', v_fulfillment,
      'satellite_name', nullif(trim(coalesce(p_satellite_name, '')), '')
    ),
    v_fulfillment,
    nullif(trim(coalesce(p_contact_phone, '')), ''),
    v_delivery_address,
    v_delivery,
    'wompi',
    now() + interval '20 minutes'
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (
      order_id,
      product_id,
      quantity,
      unit_price,
      total_amount,
      notes
    )
    values (
      v_order_id,
      (v_item ->> 'product_id')::uuid,
      (v_item ->> 'quantity')::numeric,
      (v_item ->> 'unit_price')::numeric,
      ((v_item ->> 'quantity')::numeric * (v_item ->> 'unit_price')::numeric),
      nullif(trim(coalesce(v_item ->> 'notes', '')), '')
    );
  end loop;

  insert into payments.transactions (
    order_id,
    user_id,
    site_id,
    provider,
    idempotency_key,
    amount_minor,
    currency,
    status,
    metadata
  )
  values (
    v_order_id,
    v_uid,
    p_site_id,
    'wompi',
    v_idempotency_key,
    round(v_total * 100)::bigint,
    'COP',
    'pending',
    jsonb_build_object('source', 'create_order_checkout_draft')
  )
  returning id into v_tx_id;

  update public.orders
  set payment_intent_id = v_tx_id
  where id = v_order_id;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'transaction_id', v_tx_id,
    'idempotency_key', v_idempotency_key,
    'amount_minor', round(v_total * 100)::bigint,
    'currency', 'COP',
    'checkout_expires_at', now() + interval '20 minutes'
  );
end;
$$;

create or replace function public.mark_payment_transaction_status(
  p_transaction_id uuid,
  p_provider_reference text,
  p_status text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, payments
as $$
declare
  v_tx payments.transactions%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_order_status text;
  v_payment_status text;
begin
  if p_transaction_id is null then
    raise exception 'transaction_required';
  end if;

  if v_status not in ('approved', 'rejected', 'cancelled', 'error', 'refunded') then
    raise exception 'invalid_payment_status';
  end if;

  select *
  into v_tx
  from payments.transactions
  where id = p_transaction_id
  for update;

  if v_tx.id is null then
    raise exception 'transaction_not_found';
  end if;

  if v_status = 'approved' then
    v_order_status := 'confirmed';
    v_payment_status := 'paid';
  elsif v_status = 'refunded' then
    v_order_status := 'cancelled';
    v_payment_status := 'refunded';
  else
    v_order_status := 'pending';
    v_payment_status := 'failed';
  end if;

  update payments.transactions
  set
    status = v_status,
    provider_reference = coalesce(nullif(trim(coalesce(p_provider_reference, '')), ''), provider_reference),
    raw_response = coalesce(p_payload, '{}'::jsonb),
    approved_at = case when v_status = 'approved' then now() else approved_at end,
    rejected_at = case when v_status in ('rejected', 'cancelled', 'error') then now() else rejected_at end,
    updated_at = now()
  where id = v_tx.id;

  update public.orders
  set
    payment_status = v_payment_status,
    status = case
      when status in ('delivered', 'cancelled') then status
      else v_order_status
    end,
    payment_reference = coalesce(nullif(trim(coalesce(p_provider_reference, '')), ''), payment_reference),
    payment_provider = coalesce(payment_provider, v_tx.provider),
    updated_at = now()
  where id = v_tx.order_id;

  return jsonb_build_object(
    'ok', true,
    'transaction_id', v_tx.id,
    'order_id', v_tx.order_id,
    'status', v_status
  );
end;
$$;

grant execute on function public.create_order_checkout_draft(uuid, text, text, text, text, text, text, text, jsonb, numeric, text) to authenticated, service_role;
grant execute on function public.mark_payment_transaction_status(uuid, text, text, jsonb) to service_role;

comment on table payments.transactions is 'Transacciones de pago para pedidos de satélites (checkout externo).';
comment on table payments.webhook_events is 'Eventos webhook deduplicados por proveedor de pago.';
comment on function public.create_order_checkout_draft(uuid, text, text, text, text, text, text, text, jsonb, numeric, text) is 'Crea borrador de orden + líneas + intent de pago en estado pending.';
comment on function public.mark_payment_transaction_status(uuid, text, text, jsonb) is 'Aplica resultado de pago y sincroniza estado de orden.';

commit;
