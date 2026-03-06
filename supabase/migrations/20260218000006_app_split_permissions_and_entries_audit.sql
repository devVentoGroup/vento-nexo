begin;

-- 1) Inventory entries audit ownership by app/mode.
alter table if exists public.inventory_entries
  add column if not exists source_app text;
alter table if exists public.inventory_entries
  add column if not exists entry_mode text;
alter table if exists public.inventory_entries
  add column if not exists emergency_reason text;

update public.inventory_entries
set source_app = coalesce(nullif(trim(lower(source_app)), ''), 'origo');

update public.inventory_entries
set entry_mode = coalesce(nullif(trim(lower(entry_mode)), ''), 'normal');

alter table public.inventory_entries
  alter column source_app set default 'origo';
alter table public.inventory_entries
  alter column entry_mode set default 'normal';

alter table public.inventory_entries
  alter column source_app set not null;
alter table public.inventory_entries
  alter column entry_mode set not null;

alter table public.inventory_entries
  drop constraint if exists inventory_entries_source_app_chk;
alter table public.inventory_entries
  add constraint inventory_entries_source_app_chk
  check (source_app in ('origo', 'nexo'));

alter table public.inventory_entries
  drop constraint if exists inventory_entries_entry_mode_chk;
alter table public.inventory_entries
  add constraint inventory_entries_entry_mode_chk
  check (entry_mode in ('normal', 'emergency'));

alter table public.inventory_entries
  drop constraint if exists inventory_entries_emergency_reason_chk;
alter table public.inventory_entries
  add constraint inventory_entries_emergency_reason_chk
  check (entry_mode <> 'emergency' or nullif(trim(emergency_reason), '') is not null);

create index if not exists idx_inventory_entries_source_mode
  on public.inventory_entries(source_app, entry_mode, created_at desc);

-- 2) New permissions for app split.
insert into public.app_permissions (app_id, code, name, description)
select id, 'procurement.receipts', 'Recepciones', 'Registrar recepciones con impacto en inventario'
from public.apps
where code = 'origo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.entries_emergency', 'Entrada de emergencia', 'Recepcion excepcional desde NEXO'
from public.apps
where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'production.batches', 'Lotes de produccion', 'Produccion y consumo automatico por receta'
from public.apps
where code = 'fogo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'production.recipes', 'Recetas de produccion', 'Gestion de recetas BOM y pasos'
from public.apps
where code = 'fogo'
on conflict (app_id, code) do nothing;

-- Owner / manager general: global grants.
insert into public.role_permissions (role, permission_id, scope_type)
select r.role, ap.id, 'global'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (values ('propietario'), ('gerente_general')) as r(role) on true
where
  (a.code = 'origo' and ap.code in ('access', 'procurement.receipts'))
  or (a.code = 'nexo' and ap.code in ('inventory.entries_emergency'))
  or (a.code = 'fogo' and ap.code in ('access', 'production.recipes', 'production.batches'))
on conflict do nothing;

-- Operational site grants.
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select r.role, ap.id, 'site'::public.permission_scope_type, r.scope_site_type::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (
  values
    ('gerente', 'production_center'),
    ('bodeguero', 'production_center')
) as r(role, scope_site_type) on true
where
  (a.code = 'origo' and ap.code in ('procurement.receipts'))
  or (a.code = 'fogo' and ap.code in ('production.batches'))
on conflict do nothing;

-- 3) RLS for entries and entry items: ORIGO normal + NEXO emergency.
drop policy if exists "inventory_entries_select_permission" on public.inventory_entries;
create policy "inventory_entries_select_permission" on public.inventory_entries
  for select to authenticated
  using (
    public.has_permission('nexo.inventory.entries', site_id)
    or public.has_permission('nexo.inventory.entries_emergency', site_id)
    or public.has_permission('origo.procurement.receipts', site_id)
    or public.has_permission('nexo.inventory.stock', site_id)
  );

drop policy if exists "inventory_entries_insert_permission" on public.inventory_entries;
create policy "inventory_entries_insert_permission" on public.inventory_entries
  for insert to authenticated
  with check (
    public.has_permission('nexo.inventory.entries', site_id)
    or public.has_permission('nexo.inventory.entries_emergency', site_id)
    or public.has_permission('origo.procurement.receipts', site_id)
  );

drop policy if exists "inventory_entries_update_permission" on public.inventory_entries;
create policy "inventory_entries_update_permission" on public.inventory_entries
  for update to authenticated
  using (
    public.has_permission('nexo.inventory.entries', site_id)
    or public.has_permission('nexo.inventory.entries_emergency', site_id)
    or public.has_permission('origo.procurement.receipts', site_id)
  )
  with check (
    public.has_permission('nexo.inventory.entries', site_id)
    or public.has_permission('nexo.inventory.entries_emergency', site_id)
    or public.has_permission('origo.procurement.receipts', site_id)
  );

drop policy if exists "inventory_entries_delete_permission" on public.inventory_entries;
create policy "inventory_entries_delete_permission" on public.inventory_entries
  for delete to authenticated
  using (
    public.has_permission('nexo.inventory.entries', site_id)
    or public.has_permission('nexo.inventory.entries_emergency', site_id)
    or public.has_permission('origo.procurement.receipts', site_id)
  );

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
          or public.has_permission('nexo.inventory.entries_emergency', ie.site_id)
          or public.has_permission('origo.procurement.receipts', ie.site_id)
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
        and (
          public.has_permission('nexo.inventory.entries', ie.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', ie.site_id)
          or public.has_permission('origo.procurement.receipts', ie.site_id)
        )
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
        and (
          public.has_permission('nexo.inventory.entries', ie.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', ie.site_id)
          or public.has_permission('origo.procurement.receipts', ie.site_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.inventory_entries ie
      where ie.id = inventory_entry_items.entry_id
        and (
          public.has_permission('nexo.inventory.entries', ie.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', ie.site_id)
          or public.has_permission('origo.procurement.receipts', ie.site_id)
        )
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
        and (
          public.has_permission('nexo.inventory.entries', ie.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', ie.site_id)
          or public.has_permission('origo.procurement.receipts', ie.site_id)
        )
    )
  );

-- 4) RLS/permissions for movements + stock with FOGO and ORIGO ownership.
drop policy if exists "inventory_movements_insert_permission" on public.inventory_movements;
create policy "inventory_movements_insert_permission" on public.inventory_movements
  for insert to authenticated
  with check (
    public.has_permission('nexo.inventory.movements', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.entries', site_id)
    or public.has_permission('nexo.inventory.entries_emergency', site_id)
    or public.has_permission('nexo.inventory.transfers', site_id)
    or public.has_permission('nexo.inventory.withdraw', site_id)
    or public.has_permission('nexo.inventory.counts', site_id)
    or public.has_permission('nexo.inventory.adjustments', site_id)
    or public.has_permission('origo.procurement.receipts', site_id)
    or public.has_permission('fogo.production.batches', site_id)
  );

drop policy if exists "inventory_stock_insert_permission" on public.inventory_stock_by_site;
create policy "inventory_stock_insert_permission" on public.inventory_stock_by_site
  for insert to authenticated
  with check (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.entries', site_id)
    or public.has_permission('nexo.inventory.entries_emergency', site_id)
    or public.has_permission('nexo.inventory.transfers', site_id)
    or public.has_permission('nexo.inventory.withdraw', site_id)
    or public.has_permission('nexo.inventory.counts', site_id)
    or public.has_permission('nexo.inventory.adjustments', site_id)
    or public.has_permission('origo.procurement.receipts', site_id)
    or public.has_permission('fogo.production.batches', site_id)
  );

drop policy if exists "inventory_stock_update_permission" on public.inventory_stock_by_site;
create policy "inventory_stock_update_permission" on public.inventory_stock_by_site
  for update to authenticated
  using (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.entries', site_id)
    or public.has_permission('nexo.inventory.entries_emergency', site_id)
    or public.has_permission('nexo.inventory.transfers', site_id)
    or public.has_permission('nexo.inventory.withdraw', site_id)
    or public.has_permission('nexo.inventory.counts', site_id)
    or public.has_permission('nexo.inventory.adjustments', site_id)
    or public.has_permission('origo.procurement.receipts', site_id)
    or public.has_permission('fogo.production.batches', site_id)
  )
  with check (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.entries', site_id)
    or public.has_permission('nexo.inventory.entries_emergency', site_id)
    or public.has_permission('nexo.inventory.transfers', site_id)
    or public.has_permission('nexo.inventory.withdraw', site_id)
    or public.has_permission('nexo.inventory.counts', site_id)
    or public.has_permission('nexo.inventory.adjustments', site_id)
    or public.has_permission('origo.procurement.receipts', site_id)
    or public.has_permission('fogo.production.batches', site_id)
  );

drop policy if exists "inventory_stock_by_location_insert_permission" on public.inventory_stock_by_location;
create policy "inventory_stock_by_location_insert_permission" on public.inventory_stock_by_location
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.inventory_locations loc
      where loc.id = inventory_stock_by_location.location_id
        and (
          public.has_permission('nexo.inventory.stock', loc.site_id)
          or public.has_permission('nexo.inventory.remissions.prepare', loc.site_id)
          or public.has_permission('nexo.inventory.remissions.receive', loc.site_id)
          or public.has_permission('nexo.inventory.entries', loc.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', loc.site_id)
          or public.has_permission('nexo.inventory.transfers', loc.site_id)
          or public.has_permission('nexo.inventory.withdraw', loc.site_id)
          or public.has_permission('nexo.inventory.counts', loc.site_id)
          or public.has_permission('nexo.inventory.adjustments', loc.site_id)
          or public.has_permission('origo.procurement.receipts', loc.site_id)
          or public.has_permission('fogo.production.batches', loc.site_id)
        )
    )
  );

drop policy if exists "inventory_stock_by_location_update_permission" on public.inventory_stock_by_location;
create policy "inventory_stock_by_location_update_permission" on public.inventory_stock_by_location
  for update to authenticated
  using (
    exists (
      select 1
      from public.inventory_locations loc
      where loc.id = inventory_stock_by_location.location_id
        and (
          public.has_permission('nexo.inventory.stock', loc.site_id)
          or public.has_permission('nexo.inventory.remissions.prepare', loc.site_id)
          or public.has_permission('nexo.inventory.remissions.receive', loc.site_id)
          or public.has_permission('nexo.inventory.entries', loc.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', loc.site_id)
          or public.has_permission('nexo.inventory.transfers', loc.site_id)
          or public.has_permission('nexo.inventory.withdraw', loc.site_id)
          or public.has_permission('nexo.inventory.counts', loc.site_id)
          or public.has_permission('nexo.inventory.adjustments', loc.site_id)
          or public.has_permission('origo.procurement.receipts', loc.site_id)
          or public.has_permission('fogo.production.batches', loc.site_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.inventory_locations loc
      where loc.id = inventory_stock_by_location.location_id
        and (
          public.has_permission('nexo.inventory.stock', loc.site_id)
          or public.has_permission('nexo.inventory.remissions.prepare', loc.site_id)
          or public.has_permission('nexo.inventory.remissions.receive', loc.site_id)
          or public.has_permission('nexo.inventory.entries', loc.site_id)
          or public.has_permission('nexo.inventory.entries_emergency', loc.site_id)
          or public.has_permission('nexo.inventory.transfers', loc.site_id)
          or public.has_permission('nexo.inventory.withdraw', loc.site_id)
          or public.has_permission('nexo.inventory.counts', loc.site_id)
          or public.has_permission('nexo.inventory.adjustments', loc.site_id)
          or public.has_permission('origo.procurement.receipts', loc.site_id)
          or public.has_permission('fogo.production.batches', loc.site_id)
        )
    )
  );

create or replace function public.upsert_inventory_stock_by_location(
  p_location_id uuid,
  p_product_id uuid,
  p_delta numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
begin
  select site_id into v_site_id
  from public.inventory_locations
  where id = p_location_id;

  if v_site_id is null then
    raise exception 'location not found';
  end if;

  if not (
    public.has_permission('nexo.inventory.stock', v_site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', v_site_id)
    or public.has_permission('nexo.inventory.remissions.receive', v_site_id)
    or public.has_permission('nexo.inventory.entries', v_site_id)
    or public.has_permission('nexo.inventory.entries_emergency', v_site_id)
    or public.has_permission('nexo.inventory.transfers', v_site_id)
    or public.has_permission('nexo.inventory.withdraw', v_site_id)
    or public.has_permission('nexo.inventory.counts', v_site_id)
    or public.has_permission('nexo.inventory.adjustments', v_site_id)
    or public.has_permission('origo.procurement.receipts', v_site_id)
    or public.has_permission('fogo.production.batches', v_site_id)
  ) then
    raise exception 'permission denied';
  end if;

  insert into public.inventory_stock_by_location (location_id, product_id, current_qty, updated_at)
  values (p_location_id, p_product_id, p_delta, now())
  on conflict (location_id, product_id) do update
    set current_qty = public.inventory_stock_by_location.current_qty + excluded.current_qty,
        updated_at = now();
end;
$$;

grant execute on function public.upsert_inventory_stock_by_location(uuid, uuid, numeric) to authenticated;

commit;
