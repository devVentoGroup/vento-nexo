begin;

create schema if not exists pos;
comment on schema pos is 'Dominio POS: sesiones, mesas, cajas, pagos y modificadores de venta en sitio.';

grant usage on schema pos to anon, authenticated, service_role;

alter table if exists public.pos_cash_movements set schema pos;
alter table if exists public.pos_cash_shifts set schema pos;
alter table if exists public.pos_modifier_options set schema pos;
alter table if exists public.pos_modifiers set schema pos;
alter table if exists public.pos_order_item_modifiers set schema pos;
alter table if exists public.pos_payments set schema pos;
alter table if exists public.pos_product_modifiers set schema pos;
alter table if exists public.pos_session_orders set schema pos;
alter table if exists public.pos_sessions set schema pos;
alter table if exists public.pos_tables set schema pos;
alter table if exists public.pos_zones set schema pos;

create or replace function public.process_order_payment(
  p_order_id uuid,
  p_site_id uuid,
  p_payment_method text,
  p_payment_reference text default null
)
returns json
language plpgsql
security definer
set search_path = public, pos
as $$
declare
  v_order record;
  v_loyalty_points int := 0;
begin
  select * into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    return json_build_object('success', false, 'error', 'Orden no encontrada');
  end if;

  v_loyalty_points := floor(v_order.total_amount / 1000);

  update public.orders
  set status = 'completed',
      payment_status = 'paid',
      loyalty_processed = true,
      loyalty_points_awarded = v_loyalty_points,
      updated_at = now()
  where id = p_order_id;

  insert into pos.pos_payments (
    order_id,
    payment_method,
    amount,
    reference,
    created_at
  ) values (
    p_order_id,
    p_payment_method,
    v_order.total_amount,
    p_payment_reference,
    now()
  );

  if v_order.client_id is not null and v_loyalty_points > 0 then
    update public.users
    set loyalty_points = coalesce(loyalty_points, 0) + v_loyalty_points,
        updated_at = now()
    where id = v_order.client_id;

    insert into public.loyalty_transactions (
      user_id,
      order_id,
      kind,
      points_delta,
      description,
      created_at
    ) values (
      v_order.client_id,
      p_order_id,
      'earn',
      v_loyalty_points,
      'Order paid: loyalty earning',
      now()
    );
  end if;

  return json_build_object(
    'success', true,
    'order_id', p_order_id,
    'loyalty_points_awarded', v_loyalty_points
  );
end;
$$;

alter function public.process_order_payment(uuid, uuid, text, text) owner to postgres;
grant all on function public.process_order_payment(uuid, uuid, text, text) to anon, authenticated, service_role;

create or replace view public.pos_cash_movements
with (security_invoker = true)
as
select * from pos.pos_cash_movements;

create or replace view public.pos_cash_shifts
with (security_invoker = true)
as
select * from pos.pos_cash_shifts;

create or replace view public.pos_modifier_options
with (security_invoker = true)
as
select * from pos.pos_modifier_options;

create or replace view public.pos_modifiers
with (security_invoker = true)
as
select * from pos.pos_modifiers;

create or replace view public.pos_order_item_modifiers
with (security_invoker = true)
as
select * from pos.pos_order_item_modifiers;

create or replace view public.pos_payments
with (security_invoker = true)
as
select * from pos.pos_payments;

create or replace view public.pos_product_modifiers
with (security_invoker = true)
as
select * from pos.pos_product_modifiers;

create or replace view public.pos_session_orders
with (security_invoker = true)
as
select * from pos.pos_session_orders;

create or replace view public.pos_sessions
with (security_invoker = true)
as
select * from pos.pos_sessions;

create or replace view public.pos_tables
with (security_invoker = true)
as
select * from pos.pos_tables;

create or replace view public.pos_zones
with (security_invoker = true)
as
select * from pos.pos_zones;

comment on view public.pos_cash_movements is 'Compat view. Canonical table lives in pos.pos_cash_movements.';
comment on view public.pos_cash_shifts is 'Compat view. Canonical table lives in pos.pos_cash_shifts.';
comment on view public.pos_modifier_options is 'Compat view. Canonical table lives in pos.pos_modifier_options.';
comment on view public.pos_modifiers is 'Compat view. Canonical table lives in pos.pos_modifiers.';
comment on view public.pos_order_item_modifiers is 'Compat view. Canonical table lives in pos.pos_order_item_modifiers.';
comment on view public.pos_payments is 'Compat view. Canonical table lives in pos.pos_payments.';
comment on view public.pos_product_modifiers is 'Compat view. Canonical table lives in pos.pos_product_modifiers.';
comment on view public.pos_session_orders is 'Compat view. Canonical table lives in pos.pos_session_orders.';
comment on view public.pos_sessions is 'Compat view. Canonical table lives in pos.pos_sessions.';
comment on view public.pos_tables is 'Compat view. Canonical table lives in pos.pos_tables.';
comment on view public.pos_zones is 'Compat view. Canonical table lives in pos.pos_zones.';

grant select, insert, update, delete on public.pos_cash_movements to authenticated, service_role;
grant select, insert, update, delete on public.pos_cash_shifts to authenticated, service_role;
grant select, insert, update, delete on public.pos_modifier_options to authenticated, service_role;
grant select, insert, update, delete on public.pos_modifiers to authenticated, service_role;
grant select, insert, update, delete on public.pos_order_item_modifiers to authenticated, service_role;
grant select, insert, update, delete on public.pos_payments to authenticated, service_role;
grant select, insert, update, delete on public.pos_product_modifiers to authenticated, service_role;
grant select, insert, update, delete on public.pos_session_orders to authenticated, service_role;
grant select, insert, update, delete on public.pos_sessions to authenticated, service_role;
grant select, insert, update, delete on public.pos_tables to authenticated, service_role;
grant select, insert, update, delete on public.pos_zones to authenticated, service_role;

commit;
