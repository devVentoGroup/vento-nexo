alter table if exists public.inventory_entry_items
  add column if not exists input_qty numeric;
alter table if exists public.inventory_entry_items
  add column if not exists input_unit_code text;
alter table if exists public.inventory_entry_items
  add column if not exists conversion_factor_to_stock numeric;
alter table if exists public.inventory_entry_items
  add column if not exists stock_unit_code text;

alter table if exists public.inventory_transfer_items
  add column if not exists input_qty numeric;
alter table if exists public.inventory_transfer_items
  add column if not exists input_unit_code text;
alter table if exists public.inventory_transfer_items
  add column if not exists conversion_factor_to_stock numeric;
alter table if exists public.inventory_transfer_items
  add column if not exists stock_unit_code text;

alter table if exists public.restock_request_items
  add column if not exists input_qty numeric;
alter table if exists public.restock_request_items
  add column if not exists input_unit_code text;
alter table if exists public.restock_request_items
  add column if not exists conversion_factor_to_stock numeric;
alter table if exists public.restock_request_items
  add column if not exists stock_unit_code text;

alter table if exists public.inventory_movements
  add column if not exists input_qty numeric;
alter table if exists public.inventory_movements
  add column if not exists input_unit_code text;
alter table if exists public.inventory_movements
  add column if not exists conversion_factor_to_stock numeric;
alter table if exists public.inventory_movements
  add column if not exists stock_unit_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_entry_items_input_unit_code_fkey'
  ) then
    alter table public.inventory_entry_items
      add constraint inventory_entry_items_input_unit_code_fkey
      foreign key (input_unit_code) references public.inventory_units(code);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_entry_items_stock_unit_code_fkey'
  ) then
    alter table public.inventory_entry_items
      add constraint inventory_entry_items_stock_unit_code_fkey
      foreign key (stock_unit_code) references public.inventory_units(code);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_transfer_items_input_unit_code_fkey'
  ) then
    alter table public.inventory_transfer_items
      add constraint inventory_transfer_items_input_unit_code_fkey
      foreign key (input_unit_code) references public.inventory_units(code);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_transfer_items_stock_unit_code_fkey'
  ) then
    alter table public.inventory_transfer_items
      add constraint inventory_transfer_items_stock_unit_code_fkey
      foreign key (stock_unit_code) references public.inventory_units(code);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restock_request_items_input_unit_code_fkey'
  ) then
    alter table public.restock_request_items
      add constraint restock_request_items_input_unit_code_fkey
      foreign key (input_unit_code) references public.inventory_units(code);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restock_request_items_stock_unit_code_fkey'
  ) then
    alter table public.restock_request_items
      add constraint restock_request_items_stock_unit_code_fkey
      foreign key (stock_unit_code) references public.inventory_units(code);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_movements_input_unit_code_fkey'
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_input_unit_code_fkey
      foreign key (input_unit_code) references public.inventory_units(code);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_movements_stock_unit_code_fkey'
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_stock_unit_code_fkey
      foreign key (stock_unit_code) references public.inventory_units(code);
  end if;
end
$$;

update public.inventory_entry_items
set input_qty = coalesce(input_qty, quantity_received),
    input_unit_code = coalesce(input_unit_code, unit),
    conversion_factor_to_stock = coalesce(conversion_factor_to_stock, 1),
    stock_unit_code = coalesce(stock_unit_code, unit)
where input_qty is null
   or input_unit_code is null
   or conversion_factor_to_stock is null
   or stock_unit_code is null;

update public.inventory_transfer_items
set input_qty = coalesce(input_qty, quantity),
    input_unit_code = coalesce(input_unit_code, unit),
    conversion_factor_to_stock = coalesce(conversion_factor_to_stock, 1),
    stock_unit_code = coalesce(stock_unit_code, unit)
where input_qty is null
   or input_unit_code is null
   or conversion_factor_to_stock is null
   or stock_unit_code is null;

update public.restock_request_items
set input_qty = coalesce(input_qty, quantity),
    input_unit_code = coalesce(input_unit_code, unit),
    conversion_factor_to_stock = coalesce(conversion_factor_to_stock, 1),
    stock_unit_code = coalesce(stock_unit_code, unit)
where input_qty is null
   or input_unit_code is null
   or conversion_factor_to_stock is null
   or stock_unit_code is null;

update public.inventory_movements m
set input_qty = coalesce(m.input_qty, m.quantity),
    input_unit_code = coalesce(
      m.input_unit_code,
      m.stock_unit_code,
      (
        select p.stock_unit_code
        from public.products p
        where p.id = m.product_id
      )
    ),
    conversion_factor_to_stock = coalesce(m.conversion_factor_to_stock, 1),
    stock_unit_code = coalesce(
      m.stock_unit_code,
      (
        select p.stock_unit_code
        from public.products p
        where p.id = m.product_id
      )
    )
where m.input_qty is null
   or m.input_unit_code is null
   or m.conversion_factor_to_stock is null
   or m.stock_unit_code is null;

create index if not exists idx_inventory_entry_items_stock_unit_code
  on public.inventory_entry_items(stock_unit_code);
create index if not exists idx_inventory_transfer_items_stock_unit_code
  on public.inventory_transfer_items(stock_unit_code);
create index if not exists idx_restock_request_items_stock_unit_code
  on public.restock_request_items(stock_unit_code);
create index if not exists idx_inventory_movements_stock_unit_code
  on public.inventory_movements(stock_unit_code);
