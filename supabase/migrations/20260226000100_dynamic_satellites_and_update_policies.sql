-- Dynamic satellites and remote app update policies for Vento Pass

begin;

create table if not exists public.app_update_policies (
  id uuid primary key default gen_random_uuid(),
  app_key text not null,
  platform text not null check (platform in ('ios', 'android')),
  min_version text not null default '0.0.0',
  latest_version text,
  force_update boolean not null default false,
  store_url text,
  title text,
  message text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_update_policies_app_platform_unique unique (app_key, platform)
);

create index if not exists app_update_policies_enabled_idx
  on public.app_update_policies (app_key, platform, is_enabled);

create unique index if not exists app_update_policies_app_platform_uidx
  on public.app_update_policies (app_key, platform);

alter table public.app_update_policies enable row level security;

grant select on table public.app_update_policies to anon, authenticated;

drop policy if exists app_update_policies_select_public on public.app_update_policies;
create policy app_update_policies_select_public
  on public.app_update_policies
  for select
  to anon, authenticated
  using (is_enabled = true);

drop trigger if exists app_update_policies_set_updated_at on public.app_update_policies;
create trigger app_update_policies_set_updated_at
before update on public.app_update_policies
for each row
execute function public._set_updated_at();

create table if not exists public.pass_satellites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  subtitle text,
  tags text[] not null default '{}'::text[],
  site_id uuid not null references public.sites(id) on update cascade on delete restrict,
  logo_url text,
  watermark_icon text,
  gradient_start text,
  gradient_end text,
  accent_color text,
  primary_color text,
  background_color text,
  text_color text,
  text_secondary_color text,
  card_color text,
  border_color text,
  indicator_color text,
  loading_color text,
  review_url text,
  maps_url text,
  address_override text,
  latitude_override double precision,
  longitude_override double precision,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pass_satellites_active_sort_idx
  on public.pass_satellites (is_active, sort_order, name);

create index if not exists pass_satellites_site_idx
  on public.pass_satellites (site_id);

create unique index if not exists pass_satellites_code_uidx
  on public.pass_satellites (code);

alter table public.pass_satellites enable row level security;

grant select on table public.pass_satellites to anon, authenticated;

drop policy if exists pass_satellites_select_active on public.pass_satellites;
create policy pass_satellites_select_active
  on public.pass_satellites
  for select
  to anon, authenticated
  using (is_active = true);

drop trigger if exists pass_satellites_set_updated_at on public.pass_satellites;
create trigger pass_satellites_set_updated_at
before update on public.pass_satellites
for each row
execute function public._set_updated_at();

commit;
