-- Add granular NEXO remissions permissions and role grants
-- NOTE: This fixes missing permission codes referenced by RLS policies.

-- New permission codes for remissions
insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.remissions.request', 'Remisiones: Solicitar', 'Crear solicitud de remision (sede destino)'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.remissions.prepare', 'Remisiones: Preparar', 'Preparar salida de remision (sede origen)'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.remissions.receive', 'Remisiones: Recibir', 'Recibir remision (sede destino)'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.remissions.cancel', 'Remisiones: Cancelar', 'Cancelar remision'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.remissions.all_sites', 'Remisiones: Todas las sedes', 'Ver remisiones de todas las sedes'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.production_batches', 'Produccion: Lotes', 'Registro de lotes y etiquetas de produccion'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

-- Global roles: full remissions scope
insert into public.role_permissions (role, permission_id, scope_type)
select r.role, ap.id, 'global'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (values ('propietario'), ('gerente_general')) as r(role) on true
where a.code = 'nexo'
  and ap.code in (
    'inventory.remissions',
    'inventory.remissions.request',
    'inventory.remissions.prepare',
    'inventory.remissions.receive',
    'inventory.remissions.cancel',
    'inventory.remissions.all_sites'
  )
on conflict do nothing;

-- Gerente: remisiones para su sede
insert into public.role_permissions (role, permission_id, scope_type)
select 'gerente', ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in (
    'inventory.remissions',
    'inventory.remissions.request',
    'inventory.remissions.prepare',
    'inventory.remissions.receive',
    'inventory.remissions.cancel'
  )
on conflict do nothing;

-- Bodeguero: remisiones para su sede (sin cancelar)
insert into public.role_permissions (role, permission_id, scope_type)
select 'bodeguero', ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in (
    'inventory.remissions',
    'inventory.remissions.request',
    'inventory.remissions.prepare',
    'inventory.remissions.receive'
  )
on conflict do nothing;

-- Conductor: preparar y recibir remisiones
insert into public.role_permissions (role, permission_id, scope_type)
select 'conductor', ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in (
    'inventory.remissions.prepare',
    'inventory.remissions.receive'
  )
on conflict do nothing;

-- Barista (satellite): puede solicitar y ver remisiones de su sede
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select 'barista', ap.id, 'site_type'::public.permission_scope_type, 'satellite'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in (
    'inventory.remissions',
    'inventory.remissions.request'
  )
on conflict do nothing;

-- Cajero (satellite): puede ver y recibir remisiones
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select 'cajero', ap.id, 'site_type'::public.permission_scope_type, 'satellite'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in (
    'inventory.remissions',
    'inventory.remissions.receive',
    'inventory.remissions.request'
  )
on conflict do nothing;

-- Cocinero (satellite): puede solicitar y ver remisiones de su sede
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select 'cocinero', ap.id, 'site_type'::public.permission_scope_type, 'satellite'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in (
    'inventory.remissions',
    'inventory.remissions.request'
  )
on conflict do nothing;

-- Produccion manual (production_center): lotes para cocina/panaderia/reposteria
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select r.role, ap.id, 'site_type'::public.permission_scope_type, 'production_center'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (
  select 'cocinero'::text as role
  union all select 'panadero'
  union all select 'repostero'
  union all select 'pastelero'
) r on true
where a.code = 'nexo'
  and ap.code in ('inventory.production_batches')
on conflict do nothing;

-- Ensure non-global roles don't inherit all-sites visibility
delete from public.role_permissions rp
using public.app_permissions ap
join public.apps a on a.id = ap.app_id
where rp.permission_id = ap.id
  and a.code = 'nexo'
  and ap.code = 'inventory.remissions.all_sites'
  and rp.role not in ('propietario', 'gerente_general');

-- Allow request owners to cancel their own remissions (without role cancel)
drop policy if exists "restock_requests_update_permission" on public.restock_requests;
create policy "restock_requests_update_permission" on public.restock_requests
  for update to authenticated
  using (
    public.has_permission('nexo.inventory.remissions.prepare', from_site_id)
    or public.has_permission('nexo.inventory.remissions.receive', to_site_id)
    or public.has_permission('nexo.inventory.remissions.cancel')
    or (created_by = auth.uid() and status in ('pending', 'preparing'))
  )
  with check (
    public.has_permission('nexo.inventory.remissions.prepare', from_site_id)
    or public.has_permission('nexo.inventory.remissions.receive', to_site_id)
    or public.has_permission('nexo.inventory.remissions.cancel')
    or (created_by = auth.uid() and status in ('pending', 'preparing'))
  );

drop policy if exists "restock_requests_delete_permission" on public.restock_requests;
create policy "restock_requests_delete_permission" on public.restock_requests
  for delete to authenticated
  using (
    public.has_permission('nexo.inventory.remissions.cancel')
    or (created_by = auth.uid() and status in ('pending', 'preparing'))
  );
