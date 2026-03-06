begin;

alter table if exists public.product_site_settings
  add column if not exists min_stock_qty numeric;

alter table public.product_site_settings
  drop constraint if exists product_site_settings_min_stock_qty_chk;

alter table public.product_site_settings
  add constraint product_site_settings_min_stock_qty_chk
  check (min_stock_qty is null or min_stock_qty >= 0);

create index if not exists idx_product_site_settings_site_active_min
  on public.product_site_settings(site_id, is_active, min_stock_qty);

commit;

