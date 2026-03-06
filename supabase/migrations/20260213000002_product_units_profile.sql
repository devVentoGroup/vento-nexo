alter table if exists public.products
  add column if not exists stock_unit_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_stock_unit_code_fkey'
  ) then
    alter table public.products
      add constraint products_stock_unit_code_fkey
      foreign key (stock_unit_code)
      references public.inventory_units(code);
  end if;
end
$$;

update public.products p
set stock_unit_code = coalesce(
  (
    select ua.unit_code
    from public.inventory_unit_aliases ua
    where lower(ua.alias) = lower(p.unit)
    limit 1
  ),
  (
    select iu.code
    from public.inventory_units iu
    where lower(iu.code) = lower(p.unit)
    limit 1
  )
)
where p.stock_unit_code is null
  and p.unit is not null;

update public.products
set stock_unit_code = 'un'
where stock_unit_code is null;

update public.products
set unit = stock_unit_code
where stock_unit_code is not null
  and (unit is null or trim(unit) = '' or lower(unit) <> lower(stock_unit_code));

alter table if exists public.product_inventory_profiles
  add column if not exists unit_family text;

alter table if exists public.product_inventory_profiles
  add column if not exists costing_mode text not null default 'auto_primary_supplier';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_inventory_profiles_unit_family_chk'
  ) then
    alter table public.product_inventory_profiles
      add constraint product_inventory_profiles_unit_family_chk
      check (unit_family in ('volume', 'mass', 'count') or unit_family is null);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_inventory_profiles_costing_mode_chk'
  ) then
    alter table public.product_inventory_profiles
      add constraint product_inventory_profiles_costing_mode_chk
      check (costing_mode in ('auto_primary_supplier', 'manual'));
  end if;
end
$$;

update public.product_inventory_profiles pip
set unit_family = iu.family
from public.products p
join public.inventory_units iu
  on iu.code = p.stock_unit_code
where p.id = pip.product_id
  and (pip.unit_family is null or pip.unit_family <> iu.family);

update public.product_inventory_profiles
set costing_mode = 'auto_primary_supplier'
where costing_mode is null
   or trim(costing_mode) = '';

create index if not exists idx_products_stock_unit_code
  on public.products(stock_unit_code);

create index if not exists idx_product_inventory_profiles_unit_family
  on public.product_inventory_profiles(unit_family, costing_mode);
