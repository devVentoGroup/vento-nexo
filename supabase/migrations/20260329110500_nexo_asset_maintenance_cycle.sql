alter table public.product_asset_profiles
  add column if not exists maintenance_cycle_enabled boolean not null default false,
  add column if not exists maintenance_cycle_months integer,
  add column if not exists maintenance_cycle_anchor_date date;

alter table public.product_asset_profiles
  drop constraint if exists product_asset_profiles_maintenance_cycle_months_chk;

alter table public.product_asset_profiles
  add constraint product_asset_profiles_maintenance_cycle_months_chk
  check (maintenance_cycle_months is null or maintenance_cycle_months between 1 and 60);
