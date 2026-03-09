begin;

create table if not exists club.cashback_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  percent_bps integer not null check (percent_bps >= 0 and percent_bps <= 10000),
  min_order_total_minor integer not null default 0 check (min_order_total_minor >= 0),
  cap_per_order_minor integer not null default 0 check (cap_per_order_minor >= 0),
  cap_monthly_minor integer not null default 0 check (cap_monthly_minor >= 0),
  settlement_delay_hours integer not null default 24 check (settlement_delay_hours >= 0),
  is_active boolean not null default true,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists club.earn_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  rule_id uuid not null references club.cashback_rules(id) on delete restrict,
  purchase_minor integer not null check (purchase_minor >= 0),
  cashback_minor integer not null check (cashback_minor >= 0),
  status text not null check (status in ('pending', 'approved', 'reversed', 'canceled')),
  eligible_at timestamptz not null,
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, order_id, rule_id)
);

create index if not exists club_earn_events_status_eligible_idx
  on club.earn_events(status, eligible_at);

create index if not exists club_earn_events_user_created_idx
  on club.earn_events(user_id, created_at desc);

create table if not exists club.wallet_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'COP',
  available_minor integer not null default 0,
  pending_minor integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists club.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('cashback_pending', 'cashback_approved', 'redeem_debit', 'adjustment', 'reversal')),
  amount_minor integer not null,
  reference_type text,
  reference_id uuid,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists club_wallet_ledger_user_created_idx
  on club.wallet_ledger(user_id, created_at desc);

create unique index if not exists club_wallet_ledger_cashback_pending_uidx
  on club.wallet_ledger(user_id, kind, reference_type, reference_id)
  where kind = 'cashback_pending' and reference_type = 'order' and reference_id is not null;

drop trigger if exists trg_club_cashback_rules_updated_at on club.cashback_rules;
create trigger trg_club_cashback_rules_updated_at
before update on club.cashback_rules
for each row execute function public.update_updated_at();

drop trigger if exists trg_club_earn_events_updated_at on club.earn_events;
create trigger trg_club_earn_events_updated_at
before update on club.earn_events
for each row execute function public.update_updated_at();

drop trigger if exists trg_club_wallet_accounts_updated_at on club.wallet_accounts;
create trigger trg_club_wallet_accounts_updated_at
before update on club.wallet_accounts
for each row execute function public.update_updated_at();

alter table club.cashback_rules enable row level security;
alter table club.earn_events enable row level security;
alter table club.wallet_accounts enable row level security;
alter table club.wallet_ledger enable row level security;

drop policy if exists club_cashback_rules_select_active on club.cashback_rules;
create policy club_cashback_rules_select_active
on club.cashback_rules
for select
to authenticated
using (is_active = true);

drop policy if exists club_earn_events_select_self on club.earn_events;
create policy club_earn_events_select_self
on club.earn_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists club_wallet_accounts_select_self on club.wallet_accounts;
create policy club_wallet_accounts_select_self
on club.wallet_accounts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists club_wallet_ledger_select_self on club.wallet_ledger;
create policy club_wallet_ledger_select_self
on club.wallet_ledger
for select
to authenticated
using (auth.uid() = user_id);

create or replace function club.get_my_wallet()
returns jsonb
language sql
stable
security invoker
set search_path = public, club, auth
as $$
  with account as (
    select
      a.available_minor,
      a.pending_minor,
      a.currency,
      a.updated_at
    from club.wallet_accounts a
    where a.user_id = auth.uid()
    limit 1
  )
  select jsonb_build_object(
    'available_minor', coalesce((select available_minor from account), 0),
    'pending_minor', coalesce((select pending_minor from account), 0),
    'currency', coalesce((select currency from account), 'COP'),
    'updated_at', (select updated_at from account)
  );
$$;

create or replace function club.list_my_wallet_ledger(
  p_limit int default 50,
  p_before timestamptz default null
)
returns setof club.wallet_ledger
language sql
stable
security invoker
set search_path = public, club, auth
as $$
  select wl.*
  from club.wallet_ledger wl
  where wl.user_id = auth.uid()
    and (p_before is null or wl.created_at < p_before)
  order by wl.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function club.preview_booster_for_order(
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, club, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_rule club.cashback_rules%rowtype;
  v_order record;
  v_order_minor integer := 0;
  v_month_start timestamptz := date_trunc('month', now());
  v_month_used integer := 0;
  v_raw integer := 0;
  v_after_order_cap integer := 0;
  v_remaining_month integer := 0;
  v_final integer := 0;
  v_has_entitlement boolean := false;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select (e.club_active = true and (e.effective_until is null or e.effective_until > now()))
  into v_has_entitlement
  from club.entitlements e
  where e.user_id = v_user_id;

  if not coalesce(v_has_entitlement, false) then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'no_entitlement',
      'booster_minor', 0
    );
  end if;

  select r.*
  into v_rule
  from club.cashback_rules r
  where r.is_active = true
  order by r.created_at desc
  limit 1;

  if v_rule.id is null then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'no_active_rule',
      'booster_minor', 0
    );
  end if;

  select o.id, o.client_id, o.source, o.status, coalesce(o.total_amount, 0) as total_amount
  into v_order
  from public.orders o
  where o.id = p_order_id
  limit 1;

  if v_order.id is null then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'order_not_found',
      'booster_minor', 0
    );
  end if;

  if v_order.client_id is distinct from v_user_id then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'order_not_owned',
      'booster_minor', 0
    );
  end if;

  if coalesce(v_order.source, '') <> 'vento_pass' then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'source_not_eligible',
      'booster_minor', 0
    );
  end if;

  if coalesce(v_order.status, '') not in ('paid', 'completed', 'delivered') then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'order_status_not_eligible',
      'booster_minor', 0
    );
  end if;

  v_order_minor := greatest(0, round((v_order.total_amount::numeric) * 100)::integer);

  if v_order_minor < coalesce(v_rule.min_order_total_minor, 0) then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'below_minimum_order_total',
      'booster_minor', 0,
      'order_total_minor', v_order_minor
    );
  end if;

  select coalesce(sum(greatest(wl.amount_minor, 0)), 0)
  into v_month_used
  from club.wallet_ledger wl
  where wl.user_id = v_user_id
    and wl.kind = 'cashback_approved'
    and wl.created_at >= v_month_start;

  v_raw := floor((v_order_minor::numeric * v_rule.percent_bps::numeric) / 10000.0)::integer;
  v_after_order_cap := case
    when coalesce(v_rule.cap_per_order_minor, 0) > 0
      then least(v_raw, v_rule.cap_per_order_minor)
    else v_raw
  end;
  v_remaining_month := case
    when coalesce(v_rule.cap_monthly_minor, 0) > 0
      then greatest(v_rule.cap_monthly_minor - v_month_used, 0)
    else v_after_order_cap
  end;
  v_final := greatest(least(v_after_order_cap, v_remaining_month), 0);

  return jsonb_build_object(
    'eligible', (v_final > 0),
    'reason', case when v_final > 0 then null else 'monthly_cap_reached' end,
    'booster_minor', v_final,
    'raw_minor', v_raw,
    'order_total_minor', v_order_minor,
    'month_used_minor', v_month_used,
    'month_remaining_minor', v_remaining_month,
    'rule', jsonb_build_object(
      'code', v_rule.code,
      'percent_bps', v_rule.percent_bps,
      'min_order_total_minor', v_rule.min_order_total_minor,
      'cap_per_order_minor', v_rule.cap_per_order_minor,
      'cap_monthly_minor', v_rule.cap_monthly_minor,
      'settlement_delay_hours', v_rule.settlement_delay_hours
    )
  );
end;
$$;

grant execute on function club.get_my_wallet() to authenticated, service_role;
grant execute on function club.list_my_wallet_ledger(int, timestamptz) to authenticated, service_role;
grant execute on function club.preview_booster_for_order(uuid) to authenticated, service_role;

commit;

