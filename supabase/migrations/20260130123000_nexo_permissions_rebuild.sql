-- Rebuild NEXO role permissions to canonical matrix (removes duplicates and wrong grants)

begin;

-- Ensure NEXO permission codes exist
insert into public.app_permissions (app_id, code, name, description)
select id, 'access', 'Access', 'Acceso base a la app'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.stock', 'Stock', 'Vista de stock por sede'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.movements', 'Movimientos', 'Ledger de movimientos'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.locations', 'LOCs', 'Ubicaciones de inventario'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.lpns', 'LPNs', 'Contenedores LPN y contenido'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.counts', 'Conteos', 'Conteos y ajustes derivados'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.adjustments', 'Ajustes', 'Ajustes manuales controlados'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.remissions', 'Remisiones', 'Solicitudes y remisiones internas'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

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

-- Remove all existing NEXO role permissions
delete from public.role_permissions rp
using public.app_permissions ap
join public.apps a on a.id = ap.app_id
where rp.permission_id = ap.id
  and a.code = 'nexo';

-- Global roles: all NEXO permissions
insert into public.role_permissions (role, permission_id, scope_type)
select r.role, ap.id, 'global'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (values ('propietario'), ('gerente_general')) as r(role) on true
where a.code = 'nexo'
on conflict do nothing;

-- Gerente: all NEXO permissions for their sites (except all_sites)
insert into public.role_permissions (role, permission_id, scope_type)
select 'gerente', ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code <> 'inventory.remissions.all_sites'
on conflict do nothing;

-- Bodeguero: inventory ops + remissions (no cancel)
insert into public.role_permissions (role, permission_id, scope_type)
select 'bodeguero', ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in (
    'access',
    'inventory.stock',
    'inventory.movements',
    'inventory.locations',
    'inventory.lpns',
    'inventory.counts',
    'inventory.adjustments',
    'inventory.remissions',
    'inventory.remissions.request',
    'inventory.remissions.prepare',
    'inventory.remissions.receive'
  )
on conflict do nothing;

-- Conductor: view + prepare/receive remissions
insert into public.role_permissions (role, permission_id, scope_type)
select 'conductor', ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in (
    'access',
    'inventory.remissions',
    'inventory.remissions.prepare',
    'inventory.remissions.receive'
  )
on conflict do nothing;

-- Barista (satellite): request remissions
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select 'barista', ap.id, 'site_type'::public.permission_scope_type, 'satellite'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in (
    'access',
    'inventory.remissions',
    'inventory.remissions.request'
  )
on conflict do nothing;

-- Cajero (satellite): request + receive remissions
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select 'cajero', ap.id, 'site_type'::public.permission_scope_type, 'satellite'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in (
    'access',
    'inventory.remissions',
    'inventory.remissions.request',
    'inventory.remissions.receive'
  )
on conflict do nothing;

-- Cocinero (satellite): request remissions
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type)
select 'cocinero', ap.id, 'site_type'::public.permission_scope_type, 'satellite'::public.site_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in (
    'access',
    'inventory.remissions',
    'inventory.remissions.request'
  )
on conflict do nothing;

-- Production center roles: access + production batches only
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
  and ap.code in ('access', 'inventory.production_batches')
on conflict do nothing;

commit;
