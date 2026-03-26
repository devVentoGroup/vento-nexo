-- ICUI support for supplier purchase pricing in NEXO v2.
-- Safe/idempotent migration: preserves existing links and values.

alter table public.product_suppliers
  add column if not exists purchase_price_includes_icui boolean,
  add column if not exists purchase_icui_rate numeric;

update public.product_suppliers
set purchase_price_includes_icui = false
where purchase_price_includes_icui is null;

update public.product_suppliers
set purchase_icui_rate = 0
where purchase_icui_rate is null;

update public.product_suppliers
set purchase_price_net = case
  when purchase_price is null then null
  when coalesce(purchase_price_includes_tax, false) or coalesce(purchase_price_includes_icui, false)
    then round(
      purchase_price / nullif(
        1 + (
          (
            case when coalesce(purchase_price_includes_tax, false)
              then greatest(coalesce(purchase_tax_rate, 0), 0)
              else 0
            end
          ) +
          (
            case when coalesce(purchase_price_includes_icui, false)
              then greatest(coalesce(purchase_icui_rate, 0), 0)
              else 0
            end
          )
        ) / 100.0,
        0
      ),
      6
    )
  else purchase_price
end;

alter table public.product_suppliers
  alter column purchase_price_includes_icui set default false,
  alter column purchase_icui_rate set default 0;

alter table public.product_suppliers
  alter column purchase_price_includes_icui set not null,
  alter column purchase_icui_rate set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_suppliers_purchase_icui_rate_nonnegative_chk'
      and conrelid = 'public.product_suppliers'::regclass
  ) then
    alter table public.product_suppliers
      add constraint product_suppliers_purchase_icui_rate_nonnegative_chk
      check (purchase_icui_rate >= 0);
  end if;
end
$$;

comment on column public.product_suppliers.purchase_price_includes_icui is
  'Indica si purchase_price viene con ICUI incluido.';

comment on column public.product_suppliers.purchase_icui_rate is
  'Tasa ICUI aplicada al precio de compra (porcentaje).';

comment on column public.product_suppliers.purchase_price_net is
  'Precio neto sin impuestos incluidos (considera IVA y/o ICUI cuando aplique).';

