begin;

create schema if not exists club;
grant usage on schema club to authenticated, service_role;

create table if not exists club.beta_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  role text not null default 'beta_user',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists club.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  currency text not null default 'COP',
  price_minor integer not null check (price_minor > 0),
  billing_period text not null check (billing_period in ('monthly', 'annual')),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists club.store_products (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references club.plans(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  store_product_id text not null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, store_product_id)
);

create table if not exists club.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references club.plans(id) on delete set null,
  provider text not null default 'revenuecat',
  provider_customer_id text,
  provider_entitlement_id text not null default 'club',
  status text not null check (status in ('active', 'grace', 'paused', 'expired', 'canceled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists club_subscriptions_user_status_idx
  on club.subscriptions(user_id, status);

create index if not exists club_subscriptions_period_end_idx
  on club.subscriptions(current_period_end desc nulls last);

create table if not exists club.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  club_active boolean not null default false,
  plan_code text,
  source text not null default 'system',
  effective_from timestamptz,
  effective_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists club.audit_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  actor text not null default 'system',
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists trg_club_beta_access_updated_at on club.beta_access;
create trigger trg_club_beta_access_updated_at
before update on club.beta_access
for each row execute function public.update_updated_at();

drop trigger if exists trg_club_plans_updated_at on club.plans;
create trigger trg_club_plans_updated_at
before update on club.plans
for each row execute function public.update_updated_at();

drop trigger if exists trg_club_store_products_updated_at on club.store_products;
create trigger trg_club_store_products_updated_at
before update on club.store_products
for each row execute function public.update_updated_at();

drop trigger if exists trg_club_subscriptions_updated_at on club.subscriptions;
create trigger trg_club_subscriptions_updated_at
before update on club.subscriptions
for each row execute function public.update_updated_at();

drop trigger if exists trg_club_entitlements_updated_at on club.entitlements;
create trigger trg_club_entitlements_updated_at
before update on club.entitlements
for each row execute function public.update_updated_at();

alter table club.beta_access enable row level security;
alter table club.plans enable row level security;
alter table club.store_products enable row level security;
alter table club.subscriptions enable row level security;
alter table club.entitlements enable row level security;
alter table club.audit_events enable row level security;

drop policy if exists club_beta_access_select_self on club.beta_access;
create policy club_beta_access_select_self
on club.beta_access
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists club_plans_select_active on club.plans;
create policy club_plans_select_active
on club.plans
for select
to authenticated
using (is_active = true);

drop policy if exists club_store_products_select_active on club.store_products;
create policy club_store_products_select_active
on club.store_products
for select
to authenticated
using (is_active = true);

drop policy if exists club_subscriptions_select_self on club.subscriptions;
create policy club_subscriptions_select_self
on club.subscriptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists club_entitlements_select_self on club.entitlements;
create policy club_entitlements_select_self
on club.entitlements
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists club_audit_events_select_self on club.audit_events;
create policy club_audit_events_select_self
on club.audit_events
for select
to authenticated
using (auth.uid() = user_id);

create or replace function club.can_access_beta()
returns boolean
language sql
stable
security invoker
set search_path = public, club, auth
as $$
  select exists (
    select 1
    from club.beta_access b
    where b.user_id = auth.uid()
      and b.enabled = true
  );
$$;

create or replace function club.get_my_membership()
returns jsonb
language sql
stable
security invoker
set search_path = public, club, auth
as $$
  with ent as (
    select
      e.club_active,
      e.plan_code,
      e.effective_from,
      e.effective_until,
      e.updated_at
    from club.entitlements e
    where e.user_id = auth.uid()
    limit 1
  ),
  sub as (
    select
      s.status,
      s.current_period_start,
      s.current_period_end,
      s.cancel_at_period_end,
      p.name as plan_name,
      p.currency,
      p.price_minor
    from club.subscriptions s
    left join club.plans p on p.id = s.plan_id
    where s.user_id = auth.uid()
    order by s.created_at desc
    limit 1
  )
  select jsonb_build_object(
    'beta_access', club.can_access_beta(),
    'club_active', coalesce((select club_active from ent), false),
    'plan_code', (select plan_code from ent),
    'effective_from', (select effective_from from ent),
    'effective_until', (select effective_until from ent),
    'subscription', (
      select jsonb_build_object(
        'status', sub.status,
        'current_period_start', sub.current_period_start,
        'current_period_end', sub.current_period_end,
        'cancel_at_period_end', sub.cancel_at_period_end,
        'plan_name', sub.plan_name,
        'currency', sub.currency,
        'price_minor', sub.price_minor
      )
      from sub
    )
  );
$$;

grant execute on function club.can_access_beta() to authenticated, service_role;
grant execute on function club.get_my_membership() to authenticated, service_role;

commit;

