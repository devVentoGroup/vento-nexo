-- Canonical remissions permissions matrix (v1) in DB.
-- Goal: keep role behavior defined in role_permissions, not hardcoded in app code.

begin;

-- Ensure all remissions permissions exist in app catalog.
insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.remissions', 'Remisiones', 'Solicitudes y remisiones internas'
from public.apps
where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.remissions.request', 'Remisiones: Solicitar', 'Crear solicitud de remision (sede destino)'
from public.apps
where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.remissions.prepare', 'Remisiones: Preparar', 'Preparar salida de remision (sede origen)'
from public.apps
where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.remissions.receive', 'Remisiones: Recibir', 'Recibir remision (sede destino)'
from public.apps
where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.remissions.cancel', 'Remisiones: Cancelar', 'Cancelar/anular remision'
from public.apps
where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.remissions.all_sites', 'Remisiones: Todas las sedes', 'Ver remisiones de todas las sedes'
from public.apps
where code = 'nexo'
on conflict (app_id, code) do nothing;

-- Remove previous remissions grants for roles we control in this v1 matrix.
delete from public.role_permissions rp
using public.app_permissions ap
join public.apps a on a.id = ap.app_id
where rp.permission_id = ap.id
  and a.code = 'nexo'
  and ap.code in (
    'inventory.remissions',
    'inventory.remissions.request',
    'inventory.remissions.prepare',
    'inventory.remissions.receive',
    'inventory.remissions.cancel',
    'inventory.remissions.all_sites'
  )
  and rp.role in (
    'propietario',
    'gerente_general',
    'gerente',
    'bodeguero',
    'conductor',
    'cajero',
    'barista',
    'cocinero'
  );

-- Global management roles: full remissions control across all sites.
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
  );

-- Site manager: full remissions control at owned sites (no all_sites).
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
  );

-- Warehouse operator at center/satellite: operate flow, no request/cancel.
insert into public.role_permissions (role, permission_id, scope_type)
select 'bodeguero', ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in (
    'inventory.remissions',
    'inventory.remissions.prepare',
    'inventory.remissions.receive'
  );

-- Driver: execution flow only (prepare/receive), no request/cancel.
insert into public.role_permissions (role, permission_id, scope_type)
select 'conductor', ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in (
    'inventory.remissions',
    'inventory.remissions.prepare',
    'inventory.remissions.receive'
  );

-- Satellite operators (real requesters): can request and receive from destination site.
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select r.role, ap.id, 'site_type'::public.permission_scope_type, 'satellite'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (values ('cajero'), ('barista'), ('cocinero')) as r(role) on true
where a.code = 'nexo'
  and ap.code in (
    'inventory.remissions',
    'inventory.remissions.request',
    'inventory.remissions.receive'
  );

commit;
