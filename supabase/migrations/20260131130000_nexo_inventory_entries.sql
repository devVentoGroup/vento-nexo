-- NEXO: Simple inventory entries (manual reception) + permissions

begin;

-- Permission code
insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.entries', 'Entradas', 'Recepcion de insumos'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

-- Movement type for receipts
insert into public.inventory_movement_types (code, name, description, affects_stock)
values ('receipt_in', 'Entrada', 'Entrada de inventario por recepcion', 1)
on conflict (code) do nothing;

-- Entries header
create table if not exists public.inventory_entries (
  id uuid default gen_random_uuid() not null primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  supplier_name text not null,
  invoice_number text,
  received_at timestamptz default now(),
  status text not null default 'pending',
  notes text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_inventory_entries_site on public.inventory_entries(site_id);
create index if not exists idx_inventory_entries_status on public.inventory_entries(status);

drop trigger if exists update_inventory_entries_updated_at on public.inventory_entries;
create trigger update_inventory_entries_updated_at
  before update on public.inventory_entries
  for each row execute function public.update_updated_at();

-- Entries items
create table if not exists public.inventory_entry_items (
  id uuid default gen_random_uuid() not null primary key,
  entry_id uuid not null references public.inventory_entries(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity_declared numeric not null,
  quantity_received numeric not null,
  unit text,
  notes text,
  discrepancy numeric generated always as (quantity_received - quantity_declared) stored,
  created_at timestamptz default now() not null
);

create index if not exists idx_inventory_entry_items_entry on public.inventory_entry_items(entry_id);
create index if not exists idx_inventory_entry_items_product on public.inventory_entry_items(product_id);

-- Role grants
insert into public.role_permissions (role, permission_id, scope_type)
select r.role, ap.id, 'global'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (values ('propietario'), ('gerente_general')) as r(role) on true
where a.code = 'nexo' and ap.code = 'inventory.entries'
on conflict do nothing;

insert into public.role_permissions (role, permission_id, scope_type)
select r.role, ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (values ('gerente'), ('bodeguero')) as r(role) on true
where a.code = 'nexo' and ap.code = 'inventory.entries'
on conflict do nothing;

-- RLS
alter table public.inventory_entries enable row level security;
alter table public.inventory_entry_items enable row level security;

drop policy if exists "inventory_entries_select_permission" on public.inventory_entries;
create policy "inventory_entries_select_permission" on public.inventory_entries
  for select to authenticated
  using (
    public.has_permission('nexo.inventory.entries', site_id)
    or public.has_permission('nexo.inventory.stock', site_id)
  );

drop policy if exists "inventory_entries_insert_permission" on public.inventory_entries;
create policy "inventory_entries_insert_permission" on public.inventory_entries
  for insert to authenticated
  with check (public.has_permission('nexo.inventory.entries', site_id));

drop policy if exists "inventory_entries_update_permission" on public.inventory_entries;
create policy "inventory_entries_update_permission" on public.inventory_entries
  for update to authenticated
  using (public.has_permission('nexo.inventory.entries', site_id))
  with check (public.has_permission('nexo.inventory.entries', site_id));

drop policy if exists "inventory_entries_delete_permission" on public.inventory_entries;
create policy "inventory_entries_delete_permission" on public.inventory_entries
  for delete to authenticated
  using (public.has_permission('nexo.inventory.entries', site_id));

drop policy if exists "inventory_entry_items_select_permission" on public.inventory_entry_items;
create policy "inventory_entry_items_select_permission" on public.inventory_entry_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.inventory_entries ie
      where ie.id = inventory_entry_items.entry_id
        and (
          public.has_permission('nexo.inventory.entries', ie.site_id)
          or public.has_permission('nexo.inventory.stock', ie.site_id)
        )
    )
  );

drop policy if exists "inventory_entry_items_insert_permission" on public.inventory_entry_items;
create policy "inventory_entry_items_insert_permission" on public.inventory_entry_items
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.inventory_entries ie
      where ie.id = inventory_entry_items.entry_id
        and public.has_permission('nexo.inventory.entries', ie.site_id)
    )
  );

drop policy if exists "inventory_entry_items_update_permission" on public.inventory_entry_items;
create policy "inventory_entry_items_update_permission" on public.inventory_entry_items
  for update to authenticated
  using (
    exists (
      select 1
      from public.inventory_entries ie
      where ie.id = inventory_entry_items.entry_id
        and public.has_permission('nexo.inventory.entries', ie.site_id)
    )
  )
  with check (
    exists (
      select 1
      from public.inventory_entries ie
      where ie.id = inventory_entry_items.entry_id
        and public.has_permission('nexo.inventory.entries', ie.site_id)
    )
  );

drop policy if exists "inventory_entry_items_delete_permission" on public.inventory_entry_items;
create policy "inventory_entry_items_delete_permission" on public.inventory_entry_items
  for delete to authenticated
  using (
    exists (
      select 1
      from public.inventory_entries ie
      where ie.id = inventory_entry_items.entry_id
        and public.has_permission('nexo.inventory.entries', ie.site_id)
    )
  );

-- Allow entries to write movements/stock
drop policy if exists "inventory_movements_insert_permission" on public.inventory_movements;
create policy "inventory_movements_insert_permission" on public.inventory_movements
  for insert to authenticated
  with check (
    public.has_permission('nexo.inventory.movements', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.production_batches', site_id)
    or public.has_permission('nexo.inventory.entries', site_id)
  );

drop policy if exists "inventory_stock_insert_permission" on public.inventory_stock_by_site;
create policy "inventory_stock_insert_permission" on public.inventory_stock_by_site
  for insert to authenticated
  with check (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.production_batches', site_id)
    or public.has_permission('nexo.inventory.entries', site_id)
  );

drop policy if exists "inventory_stock_update_permission" on public.inventory_stock_by_site;
create policy "inventory_stock_update_permission" on public.inventory_stock_by_site
  for update to authenticated
  using (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.production_batches', site_id)
    or public.has_permission('nexo.inventory.entries', site_id)
  )
  with check (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.production_batches', site_id)
    or public.has_permission('nexo.inventory.entries', site_id)
  );

commit;
