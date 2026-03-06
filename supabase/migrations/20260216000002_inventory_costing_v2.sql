begin;

create table if not exists public.inventory_cost_policies (
  site_id uuid primary key references public.sites(id) on delete cascade,
  cost_basis text not null default 'net',
  is_active boolean not null default true,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint inventory_cost_policies_cost_basis_chk
    check (cost_basis in ('net', 'gross'))
);

insert into public.inventory_cost_policies (site_id, cost_basis, is_active)
select s.id, 'net', true
from public.sites s
where not exists (
  select 1
  from public.inventory_cost_policies p
  where p.site_id = s.id
);

alter table if exists public.inventory_entries
  add column if not exists purchase_order_id uuid;

do $$
begin
  if to_regclass('public.purchase_orders') is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_entries_purchase_order_id_fkey'
  ) then
    alter table public.inventory_entries
      add constraint inventory_entries_purchase_order_id_fkey
      foreign key (purchase_order_id) references public.purchase_orders(id) on delete set null;
  end if;
end
$$;

alter table if exists public.inventory_entry_items
  add column if not exists input_unit_cost numeric;
alter table if exists public.inventory_entry_items
  add column if not exists stock_unit_cost numeric;
alter table if exists public.inventory_entry_items
  add column if not exists line_total_cost numeric;
alter table if exists public.inventory_entry_items
  add column if not exists cost_source text;
alter table if exists public.inventory_entry_items
  add column if not exists currency text default 'COP';
alter table if exists public.inventory_entry_items
  add column if not exists purchase_order_item_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_entry_items_cost_source_chk'
  ) then
    alter table public.inventory_entry_items
      add constraint inventory_entry_items_cost_source_chk
      check (cost_source is null or cost_source in ('manual', 'po_prefill', 'fallback_product_cost'));
  end if;
end
$$;

do $$
begin
  if to_regclass('public.purchase_order_items') is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_entry_items_purchase_order_item_id_fkey'
  ) then
    alter table public.inventory_entry_items
      add constraint inventory_entry_items_purchase_order_item_id_fkey
      foreign key (purchase_order_item_id) references public.purchase_order_items(id) on delete set null;
  end if;
end
$$;

alter table if exists public.inventory_movements
  add column if not exists stock_unit_cost numeric;
alter table if exists public.inventory_movements
  add column if not exists line_total_cost numeric;

create table if not exists public.product_cost_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  site_id uuid null references public.sites(id) on delete set null,
  source text not null,
  source_entry_id uuid null references public.inventory_entries(id) on delete set null,
  source_adjust_movement_id uuid null references public.inventory_movements(id) on delete set null,
  qty_before numeric not null default 0,
  qty_in numeric not null default 0,
  cost_before numeric not null default 0,
  cost_in numeric not null default 0,
  cost_after numeric not null default 0,
  basis text not null default 'net',
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  constraint product_cost_events_source_chk check (source in ('entry', 'adjust')),
  constraint product_cost_events_basis_chk check (basis in ('net', 'gross'))
);

create index if not exists idx_product_cost_events_product_created
  on public.product_cost_events(product_id, created_at desc);
create index if not exists idx_inventory_entries_purchase_order_id
  on public.inventory_entries(purchase_order_id);

commit;

