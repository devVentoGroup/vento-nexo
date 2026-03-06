alter table if exists public.product_suppliers
  add column if not exists purchase_pack_qty numeric;

alter table if exists public.product_suppliers
  add column if not exists purchase_pack_unit_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_suppliers_purchase_pack_unit_code_fkey'
  ) then
    alter table public.product_suppliers
      add constraint product_suppliers_purchase_pack_unit_code_fkey
      foreign key (purchase_pack_unit_code)
      references public.inventory_units(code);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_suppliers_purchase_pack_qty_chk'
  ) then
    alter table public.product_suppliers
      add constraint product_suppliers_purchase_pack_qty_chk
      check (purchase_pack_qty is null or purchase_pack_qty > 0);
  end if;
end
$$;

update public.product_suppliers ps
set purchase_pack_qty = ps.purchase_unit_size
where ps.purchase_pack_qty is null
  and ps.purchase_unit_size is not null
  and ps.purchase_unit_size > 0;

update public.product_suppliers ps
set purchase_pack_unit_code = p.stock_unit_code
from public.products p
where p.id = ps.product_id
  and ps.purchase_pack_unit_code is null
  and p.stock_unit_code is not null;

update public.product_suppliers
set purchase_unit_size = purchase_pack_qty
where purchase_pack_qty is not null
  and (purchase_unit_size is null or purchase_unit_size <= 0);

create index if not exists idx_product_suppliers_pack_unit
  on public.product_suppliers(product_id, purchase_pack_unit_code);
