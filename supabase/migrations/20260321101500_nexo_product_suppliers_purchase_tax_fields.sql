-- Add pricing tax metadata expected by nexo v2 forms and costing flows.
-- Safe/idempotent: does not alter product-supplier links, only adds missing columns and backfills defaults.

alter table public.product_suppliers
  add column if not exists purchase_price_net numeric,
  add column if not exists purchase_price_includes_tax boolean,
  add column if not exists purchase_tax_rate numeric;

update public.product_suppliers
set purchase_price_includes_tax = false
where purchase_price_includes_tax is null;

update public.product_suppliers
set purchase_tax_rate = 0
where purchase_tax_rate is null;

update public.product_suppliers
set purchase_price_net = case
  when purchase_price is null then null
  when coalesce(purchase_price_includes_tax, false)
    then round(purchase_price / nullif(1 + (greatest(coalesce(purchase_tax_rate, 0), 0) / 100.0), 0), 6)
  else purchase_price
end
where purchase_price_net is null;

alter table public.product_suppliers
  alter column purchase_price_includes_tax set default false,
  alter column purchase_tax_rate set default 0;

alter table public.product_suppliers
  alter column purchase_price_includes_tax set not null,
  alter column purchase_tax_rate set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_suppliers_purchase_tax_rate_nonnegative_chk'
      and conrelid = 'public.product_suppliers'::regclass
  ) then
    alter table public.product_suppliers
      add constraint product_suppliers_purchase_tax_rate_nonnegative_chk
      check (purchase_tax_rate >= 0);
  end if;
end
$$;

comment on column public.product_suppliers.purchase_price_net is
  'Precio neto de compra por unidad de compra (sin impuestos).';

comment on column public.product_suppliers.purchase_price_includes_tax is
  'Indica si purchase_price viene con impuesto incluido.';

comment on column public.product_suppliers.purchase_tax_rate is
  'Tasa de impuesto aplicada al precio de compra (porcentaje, ej. 19 para 19%).';