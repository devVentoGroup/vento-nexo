begin;

create schema if not exists pass;
comment on schema pass is 'Dominio Vento Pass: loyalty, rewards, satellites y helpers de fidelizacion.';

grant usage on schema pass to anon, authenticated, service_role;

create or replace function pass.update_loyalty_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pass
as $$
begin
  if (tg_op = 'INSERT') then
    update public.users
    set loyalty_points = loyalty_points + new.points_delta,
        updated_at = now()
    where id = new.user_id;
  end if;
  return new;
end;
$$;

alter function pass.update_loyalty_balance() owner to postgres;
grant all on function pass.update_loyalty_balance() to anon, authenticated, service_role;

alter table if exists public.loyalty_rewards set schema pass;
alter table if exists public.loyalty_redemptions set schema pass;
alter table if exists public.loyalty_transactions set schema pass;
alter table if exists public.user_favorites set schema pass;
alter table if exists public.pass_satellites set schema pass;

drop trigger if exists on_loyalty_transaction_created on pass.loyalty_transactions;
create trigger on_loyalty_transaction_created
after insert on pass.loyalty_transactions
for each row
execute function pass.update_loyalty_balance();

create or replace function pass.get_my_total_earned_points()
returns table (total_earned bigint)
language sql
stable
security invoker
set search_path = public, pass
as $$
  select coalesce(sum(lt.points_delta), 0)::bigint as total_earned
  from pass.loyalty_transactions lt
  where lt.user_id = auth.uid()
    and lt.kind = 'earn';
$$;

alter function pass.get_my_total_earned_points() owner to postgres;
grant execute on function pass.get_my_total_earned_points() to authenticated;

create or replace function pass.grant_loyalty_points(
  p_user_id uuid,
  p_points integer,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pass
as $$
declare
  v_current_balance integer;
  v_new_balance integer;
  v_transaction_id uuid;
begin
  if not public.is_active_staff() then
    return jsonb_build_object('success', false, 'error', 'No autorizado (staff requerido)');
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_id es requerido');
  end if;

  if p_points is null or p_points <= 0 then
    return jsonb_build_object('success', false, 'error', 'p_points debe ser mayor a 0');
  end if;

  select u.loyalty_points
    into v_current_balance
  from public.users u
  where u.id = p_user_id
  for update;

  if v_current_balance is null then
    return jsonb_build_object('success', false, 'error', 'Usuario no encontrado');
  end if;

  v_new_balance := coalesce(v_current_balance, 0) + p_points;

  insert into pass.loyalty_transactions (
    user_id,
    kind,
    points_delta,
    description,
    metadata
  ) values (
    p_user_id,
    'earn',
    p_points,
    coalesce(p_description, 'Puntos otorgados'),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('staff_user_id', auth.uid())
  )
  returning id into v_transaction_id;

  update public.users
  set loyalty_points = v_new_balance,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'points_awarded', p_points,
    'transaction_id', v_transaction_id
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

alter function pass.grant_loyalty_points(uuid, integer, text, jsonb) owner to postgres;
grant all on function pass.grant_loyalty_points(uuid, integer, text, jsonb) to anon, authenticated, service_role;

create or replace function public.grant_loyalty_points(
  p_user_id uuid,
  p_points integer,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
security definer
set search_path = public, pass
as $$
  select pass.grant_loyalty_points(p_user_id, p_points, p_description, p_metadata);
$$;

grant all on function public.grant_loyalty_points(uuid, integer, text, jsonb) to anon, authenticated, service_role;

create or replace function pass.process_loyalty_earning(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pass
as $$
declare
  point_conversion_rate constant integer := 1000;
  v_order record;
  v_points integer;
begin
  select
    o.id,
    o.client_id,
    o.payment_status,
    o.loyalty_processed,
    o.total_amount,
    o.loyalty_points_awarded
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order % not found', p_order_id using errcode = 'P0001';
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'Order % is not paid', p_order_id using errcode = 'P0001';
  end if;

  if v_order.loyalty_processed then
    raise exception 'Order % already processed for loyalty', p_order_id using errcode = 'P0001';
  end if;

  v_points := floor(coalesce(v_order.total_amount, 0) / point_conversion_rate);

  if v_points <= 0 then
    update public.orders
      set loyalty_processed = true,
          loyalty_points_awarded = 0
    where id = p_order_id;
    return;
  end if;

  insert into pass.loyalty_transactions (
    user_id,
    order_id,
    kind,
    points_delta,
    description
  ) values (
    v_order.client_id,
    p_order_id,
    'earn',
    v_points,
    'Order paid: loyalty earning'
  );

  update public.users
    set loyalty_points = coalesce(loyalty_points, 0) + v_points
  where id = v_order.client_id;

  update public.orders
    set loyalty_processed = true,
        loyalty_points_awarded = v_points
  where id = p_order_id;
end;
$$;

alter function pass.process_loyalty_earning(uuid) owner to postgres;
grant all on function pass.process_loyalty_earning(uuid) to anon, authenticated, service_role;

create or replace function public.process_loyalty_earning(p_order_id uuid)
returns void
language sql
security definer
set search_path = public, pass
as $$
  select pass.process_loyalty_earning(p_order_id);
$$;

grant all on function public.process_loyalty_earning(uuid) to anon, authenticated, service_role;

create or replace function public.get_my_total_earned_points()
returns table (total_earned bigint)
language sql
stable
security invoker
set search_path = public, pass
as $$
  select * from pass.get_my_total_earned_points();
$$;

grant execute on function public.get_my_total_earned_points() to authenticated;

create or replace view public.loyalty_rewards
with (security_invoker = true)
as
select * from pass.loyalty_rewards;

create or replace view public.loyalty_redemptions
with (security_invoker = true)
as
select * from pass.loyalty_redemptions;

create or replace view public.loyalty_transactions
with (security_invoker = true)
as
select * from pass.loyalty_transactions;

create or replace view public.user_favorites
with (security_invoker = true)
as
select * from pass.user_favorites;

create or replace view public.pass_satellites
with (security_invoker = true)
as
select * from pass.pass_satellites;

comment on view public.loyalty_rewards is 'Compat view. Canonical table lives in pass.loyalty_rewards.';
comment on view public.loyalty_redemptions is 'Compat view. Canonical table lives in pass.loyalty_redemptions.';
comment on view public.loyalty_transactions is 'Compat view. Canonical table lives in pass.loyalty_transactions.';
comment on view public.user_favorites is 'Compat view. Canonical table lives in pass.user_favorites.';
comment on view public.pass_satellites is 'Compat view. Canonical table lives in pass.pass_satellites.';

grant select on public.loyalty_rewards to anon;
grant select, insert, update, delete on public.loyalty_rewards to authenticated, service_role;

grant select, insert, update, delete on public.loyalty_redemptions to anon, authenticated, service_role;
grant select, insert, update, delete on public.loyalty_transactions to anon, authenticated, service_role;
grant select, insert, update, delete on public.user_favorites to anon, authenticated, service_role;
grant select on public.pass_satellites to anon, authenticated;
grant select, insert, update, delete on public.pass_satellites to service_role;

commit;
