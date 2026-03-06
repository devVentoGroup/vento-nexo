begin;

create table if not exists public.product_uom_profiles (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  label text not null,
  input_unit_code text not null,
  qty_in_input_unit numeric not null,
  qty_in_stock_unit numeric not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_uom_profiles_source_chk
    check (source in ('manual', 'supplier_primary')),
  constraint product_uom_profiles_qty_input_chk
    check (qty_in_input_unit > 0),
  constraint product_uom_profiles_qty_stock_chk
    check (qty_in_stock_unit > 0)
);

create index if not exists idx_product_uom_profiles_product
  on public.product_uom_profiles(product_id);

create index if not exists idx_product_uom_profiles_product_active
  on public.product_uom_profiles(product_id, is_active, is_default);

create unique index if not exists ux_product_uom_profiles_default_per_product
  on public.product_uom_profiles(product_id)
  where is_default = true and is_active = true;

commit;
