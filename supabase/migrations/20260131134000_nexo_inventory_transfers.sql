-- NEXO: Internal transfers between LOCs (no stock delta)

begin;

-- Permission code
insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.transfers', 'Traslados internos', 'Movimientos internos entre LOCs'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

-- Movement type for internal transfers
insert into public.inventory_movement_types (code, name, description, affects_stock)
values ('transfer_internal', 'Traslado interno', 'Movimiento interno entre LOCs', 0)
on conflict (code) do nothing;

-- Transfers header
create table if not exists public.inventory_transfers (
  id uuid default gen_random_uuid() not null primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  from_loc_id uuid not null references public.inventory_locations(id),
  to_loc_id uuid not null references public.inventory_locations(id),
  status text not null default 'completed',
  notes text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_inventory_transfers_site on public.inventory_transfers(site_id);
create index if not exists idx_inventory_transfers_from on public.inventory_transfers(from_loc_id);
create index if not exists idx_inventory_transfers_to on public.inventory_transfers(to_loc_id);

drop trigger if exists update_inventory_transfers_updated_at on public.inventory_transfers;
create trigger update_inventory_transfers_updated_at
  before update on public.inventory_transfers
  for each row execute function public.update_updated_at();

-- Transfers items
create table if not exists public.inventory_transfer_items (
  id uuid default gen_random_uuid() not null primary key,
  transfer_id uuid not null references public.inventory_transfers(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric not null,
  unit text,
  notes text,
  created_at timestamptz default now() not null
);

create index if not exists idx_inventory_transfer_items_transfer on public.inventory_transfer_items(transfer_id);
create index if not exists idx_inventory_transfer_items_product on public.inventory_transfer_items(product_id);

-- Role grants
insert into public.role_permissions (role, permission_id, scope_type)
select r.role, ap.id, 'global'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (values ('propietario'), ('gerente_general')) as r(role) on true
where a.code = 'nexo' and ap.code = 'inventory.transfers'
on conflict do nothing;

insert into public.role_permissions (role, permission_id, scope_type)
select r.role, ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (values ('gerente'), ('bodeguero')) as r(role) on true
where a.code = 'nexo' and ap.code = 'inventory.transfers'
on conflict do nothing;

-- RLS
alter table public.inventory_transfers enable row level security;
alter table public.inventory_transfer_items enable row level security;

drop policy if exists "inventory_transfers_select_permission" on public.inventory_transfers;
create policy "inventory_transfers_select_permission" on public.inventory_transfers
  for select to authenticated
  using (
    public.has_permission('nexo.inventory.transfers', site_id)
    or public.has_permission('nexo.inventory.stock', site_id)
  );

drop policy if exists "inventory_transfers_insert_permission" on public.inventory_transfers;
create policy "inventory_transfers_insert_permission" on public.inventory_transfers
  for insert to authenticated
  with check (public.has_permission('nexo.inventory.transfers', site_id));

drop policy if exists "inventory_transfers_update_permission" on public.inventory_transfers;
create policy "inventory_transfers_update_permission" on public.inventory_transfers
  for update to authenticated
  using (public.has_permission('nexo.inventory.transfers', site_id))
  with check (public.has_permission('nexo.inventory.transfers', site_id));

drop policy if exists "inventory_transfers_delete_permission" on public.inventory_transfers;
create policy "inventory_transfers_delete_permission" on public.inventory_transfers
  for delete to authenticated
  using (public.has_permission('nexo.inventory.transfers', site_id));

drop policy if exists "inventory_transfer_items_select_permission" on public.inventory_transfer_items;
create policy "inventory_transfer_items_select_permission" on public.inventory_transfer_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.inventory_transfers it
      where it.id = inventory_transfer_items.transfer_id
        and (
          public.has_permission('nexo.inventory.transfers', it.site_id)
          or public.has_permission('nexo.inventory.stock', it.site_id)
        )
    )
  );

drop policy if exists "inventory_transfer_items_insert_permission" on public.inventory_transfer_items;
create policy "inventory_transfer_items_insert_permission" on public.inventory_transfer_items
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.inventory_transfers it
      where it.id = inventory_transfer_items.transfer_id
        and public.has_permission('nexo.inventory.transfers', it.site_id)
    )
  );

drop policy if exists "inventory_transfer_items_update_permission" on public.inventory_transfer_items;
create policy "inventory_transfer_items_update_permission" on public.inventory_transfer_items
  for update to authenticated
  using (
    exists (
      select 1
      from public.inventory_transfers it
      where it.id = inventory_transfer_items.transfer_id
        and public.has_permission('nexo.inventory.transfers', it.site_id)
    )
  )
  with check (
    exists (
      select 1
      from public.inventory_transfers it
      where it.id = inventory_transfer_items.transfer_id
        and public.has_permission('nexo.inventory.transfers', it.site_id)
    )
  );

drop policy if exists "inventory_transfer_items_delete_permission" on public.inventory_transfer_items;
create policy "inventory_transfer_items_delete_permission" on public.inventory_transfer_items
  for delete to authenticated
  using (
    exists (
      select 1
      from public.inventory_transfers it
      where it.id = inventory_transfer_items.transfer_id
        and public.has_permission('nexo.inventory.transfers', it.site_id)
    )
  );

-- Allow transfers to write movements
drop policy if exists "inventory_movements_insert_permission" on public.inventory_movements;
create policy "inventory_movements_insert_permission" on public.inventory_movements
  for insert to authenticated
  with check (
    public.has_permission('nexo.inventory.movements', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.production_batches', site_id)
    or public.has_permission('nexo.inventory.entries', site_id)
    or public.has_permission('nexo.inventory.transfers', site_id)
  );

commit;
