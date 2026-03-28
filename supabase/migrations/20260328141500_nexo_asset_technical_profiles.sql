create table if not exists public.product_asset_profiles (
  product_id uuid primary key references public.products(id) on delete cascade,
  brand text,
  model text,
  serial_number text,
  physical_location text,
  purchase_invoice_url text,
  commercial_value numeric(14,2),
  purchase_date date,
  started_use_date date,
  equipment_status text not null default 'operativo',
  maintenance_service_provider text,
  technical_description text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint product_asset_profiles_status_chk
    check (equipment_status = any (array['operativo'::text,'en_mantenimiento'::text,'fuera_servicio'::text,'baja'::text]))
);

create table if not exists public.product_asset_maintenance_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  scheduled_date date,
  performed_date date,
  responsible text,
  maintenance_provider text,
  work_done text,
  parts_replaced boolean not null default false,
  replaced_parts text,
  planner_bucket text not null default 'mensual',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint product_asset_maintenance_events_planner_bucket_chk
    check (planner_bucket = any (array['correctivo'::text,'semanal'::text,'mensual'::text,'trimestral'::text,'semestral'::text,'anual'::text]))
);

create table if not exists public.product_asset_transfer_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  moved_at date,
  from_location text,
  to_location text,
  responsible text,
  notes text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists product_asset_maintenance_events_product_id_idx
  on public.product_asset_maintenance_events (product_id);
create index if not exists product_asset_maintenance_events_scheduled_date_idx
  on public.product_asset_maintenance_events (scheduled_date desc);
create index if not exists product_asset_maintenance_events_performed_date_idx
  on public.product_asset_maintenance_events (performed_date desc);

create index if not exists product_asset_transfer_events_product_id_idx
  on public.product_asset_transfer_events (product_id);
create index if not exists product_asset_transfer_events_moved_at_idx
  on public.product_asset_transfer_events (moved_at desc);

create trigger set_updated_at_product_asset_profiles
  before update on public.product_asset_profiles
  for each row execute function public.tg_set_updated_at();

create trigger set_updated_at_product_asset_maintenance_events
  before update on public.product_asset_maintenance_events
  for each row execute function public.tg_set_updated_at();

create trigger set_updated_at_product_asset_transfer_events
  before update on public.product_asset_transfer_events
  for each row execute function public.tg_set_updated_at();

alter table public.product_asset_profiles enable row level security;
alter table public.product_asset_maintenance_events enable row level security;
alter table public.product_asset_transfer_events enable row level security;

create policy product_asset_profiles_select_staff
  on public.product_asset_profiles
  for select
  using (public.is_employee());

create policy product_asset_profiles_write_owner
  on public.product_asset_profiles
  using ((public.is_owner() or public.is_global_manager()))
  with check ((public.is_owner() or public.is_global_manager()));

create policy product_asset_maintenance_events_select_staff
  on public.product_asset_maintenance_events
  for select
  using (public.is_employee());

create policy product_asset_maintenance_events_write_owner
  on public.product_asset_maintenance_events
  using ((public.is_owner() or public.is_global_manager()))
  with check ((public.is_owner() or public.is_global_manager()));

create policy product_asset_transfer_events_select_staff
  on public.product_asset_transfer_events
  for select
  using (public.is_employee());

create policy product_asset_transfer_events_write_owner
  on public.product_asset_transfer_events
  using ((public.is_owner() or public.is_global_manager()))
  with check ((public.is_owner() or public.is_global_manager()));

grant all on table public.product_asset_profiles to anon;
grant all on table public.product_asset_profiles to authenticated;
grant all on table public.product_asset_profiles to service_role;

grant all on table public.product_asset_maintenance_events to anon;
grant all on table public.product_asset_maintenance_events to authenticated;
grant all on table public.product_asset_maintenance_events to service_role;

grant all on table public.product_asset_transfer_events to anon;
grant all on table public.product_asset_transfer_events to authenticated;
grant all on table public.product_asset_transfer_events to service_role;
