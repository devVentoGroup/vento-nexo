-- NEXO: Permiso inventory.withdraw para retiros por QR/LOC

begin;

-- 1. Crear permiso en catálogo
insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.withdraw', 'Retiros LOC', 'Registrar consumo desde ubicación (QR)'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

-- 2. Asignar a roles
-- Global: propietario y gerente general
insert into public.role_permissions (role, permission_id, scope_type)
select r.role, ap.id, 'global'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (values ('propietario'), ('gerente_general')) as r(role) on true
where a.code = 'nexo' and ap.code = 'inventory.withdraw'
on conflict do nothing;

-- Por sede: gerente y bodeguero
insert into public.role_permissions (role, permission_id, scope_type)
select r.role, ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (values ('gerente'), ('bodeguero')) as r(role) on true
where a.code = 'nexo' and ap.code = 'inventory.withdraw'
on conflict do nothing;

-- Satélite: cajero, barista, cocinero (retiran insumos en punto de venta/preparación)
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select r.role, ap.id, 'site_type'::public.permission_scope_type, 'satellite'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (values ('cajero'), ('barista'), ('cocinero')) as r(role) on true
where a.code = 'nexo' and ap.code = 'inventory.withdraw'
on conflict do nothing;

-- Centro de producción: cocinero, panadero, repostero, pastelero
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select r.role, ap.id, 'site_type'::public.permission_scope_type, 'production_center'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (
  select 'cocinero'::text as role union all select 'panadero' union all select 'repostero' union all select 'pastelero'
) r on true
where a.code = 'nexo' and ap.code = 'inventory.withdraw'
on conflict do nothing;

-- 3. RLS: inventory_locations SELECT (para que quien tiene withdraw pueda ver LOCs)
drop policy if exists "inventory_locations_select_permission" on public.inventory_locations;
create policy "inventory_locations_select_permission" on public.inventory_locations
  for select to authenticated
  using (
    public.has_permission('nexo.inventory.locations', site_id)
    or public.has_permission('nexo.inventory.withdraw', site_id)
  );

-- 4. RLS: permitir withdraw en inventory_movements INSERT
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
    or public.has_permission('nexo.inventory.withdraw', site_id)
  );

-- 5. RLS: inventory_stock_by_location (SELECT para validar disponibilidad, INSERT y UPDATE)
drop policy if exists "inventory_stock_by_location_select_permission" on public.inventory_stock_by_location;
create policy "inventory_stock_by_location_select_permission" on public.inventory_stock_by_location
  for select to authenticated
  using (
    exists (
      select 1
      from public.inventory_locations loc
      where loc.id = inventory_stock_by_location.location_id
        and (
          public.has_permission('nexo.inventory.stock', loc.site_id)
          or public.has_permission('nexo.inventory.withdraw', loc.site_id)
        )
    )
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
          or public.has_permission('nexo.inventory.production_batches', loc.site_id)
          or public.has_permission('nexo.inventory.entries', loc.site_id)
          or public.has_permission('nexo.inventory.transfers', loc.site_id)
          or public.has_permission('nexo.inventory.withdraw', loc.site_id)
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
          or public.has_permission('nexo.inventory.production_batches', loc.site_id)
          or public.has_permission('nexo.inventory.entries', loc.site_id)
          or public.has_permission('nexo.inventory.transfers', loc.site_id)
          or public.has_permission('nexo.inventory.withdraw', loc.site_id)
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
          or public.has_permission('nexo.inventory.production_batches', loc.site_id)
          or public.has_permission('nexo.inventory.entries', loc.site_id)
          or public.has_permission('nexo.inventory.transfers', loc.site_id)
          or public.has_permission('nexo.inventory.withdraw', loc.site_id)
        )
    )
  );

-- 6. RLS: inventory_stock_by_site (SELECT, INSERT y UPDATE)
drop policy if exists "inventory_stock_select_permission" on public.inventory_stock_by_site;
create policy "inventory_stock_select_permission" on public.inventory_stock_by_site
  for select to authenticated
  using (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.withdraw', site_id)
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
    or public.has_permission('nexo.inventory.withdraw', site_id)
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
    or public.has_permission('nexo.inventory.withdraw', site_id)
  )
  with check (
    public.has_permission('nexo.inventory.stock', site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', site_id)
    or public.has_permission('nexo.inventory.remissions.receive', site_id)
    or public.has_permission('nexo.inventory.production_batches', site_id)
    or public.has_permission('nexo.inventory.entries', site_id)
    or public.has_permission('nexo.inventory.withdraw', site_id)
  );

-- 7. RPC upsert_inventory_stock_by_location: permitir withdraw
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
    or public.has_permission('nexo.inventory.production_batches', v_site_id)
    or public.has_permission('nexo.inventory.entries', v_site_id)
    or public.has_permission('nexo.inventory.transfers', v_site_id)
    or public.has_permission('nexo.inventory.withdraw', v_site_id)
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

commit;
