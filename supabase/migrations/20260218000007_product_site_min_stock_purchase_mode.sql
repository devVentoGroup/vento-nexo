begin;

alter table public.product_site_settings
  add column if not exists min_stock_input_mode text,
  add column if not exists min_stock_purchase_qty numeric,
  add column if not exists min_stock_purchase_unit_code text,
  add column if not exists min_stock_purchase_to_base_factor numeric;

alter table public.product_site_settings
  drop constraint if exists product_site_settings_min_stock_input_mode_chk;
alter table public.product_site_settings
  add constraint product_site_settings_min_stock_input_mode_chk
  check (
    min_stock_input_mode is null
    or min_stock_input_mode in ('base', 'purchase')
  );

alter table public.product_site_settings
  drop constraint if exists product_site_settings_min_stock_purchase_qty_chk;
alter table public.product_site_settings
  add constraint product_site_settings_min_stock_purchase_qty_chk
  check (
    min_stock_purchase_qty is null
    or min_stock_purchase_qty >= 0
  );

alter table public.product_site_settings
  drop constraint if exists product_site_settings_min_stock_purchase_to_base_factor_chk;
alter table public.product_site_settings
  add constraint product_site_settings_min_stock_purchase_to_base_factor_chk
  check (
    min_stock_purchase_to_base_factor is null
    or min_stock_purchase_to_base_factor > 0
  );

alter table public.product_site_settings
  drop constraint if exists product_site_settings_min_stock_mode_consistency_chk;
alter table public.product_site_settings
  add constraint product_site_settings_min_stock_mode_consistency_chk
  check (
    min_stock_input_mode is null
    or min_stock_input_mode = 'base'
    or (
      min_stock_input_mode = 'purchase'
      and min_stock_purchase_qty is not null
      and min_stock_purchase_unit_code is not null
      and min_stock_purchase_to_base_factor is not null
    )
  );

comment on column public.product_site_settings.min_stock_input_mode
  is 'Modo de captura del minimo: base o purchase. El calculo operativo siempre usa min_stock_qty en unidad base.';
comment on column public.product_site_settings.min_stock_purchase_qty
  is 'Cantidad de minimo capturada en unidad de compra.';
comment on column public.product_site_settings.min_stock_purchase_unit_code
  is 'Codigo de la unidad de compra usada para capturar el minimo.';
comment on column public.product_site_settings.min_stock_purchase_to_base_factor
  is 'Factor de conversion de unidad de compra a unidad base (base por 1 unidad de compra).';

update public.product_site_settings
set min_stock_input_mode = 'base'
where min_stock_input_mode is null;

commit;
