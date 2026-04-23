begin;

-- Matriz canónica para conductor:
-- - solo visibilidad de módulo de remisiones
-- - solo acción de checklist/despacho a tránsito
-- - sin solicitar, preparar, recibir, cancelar ni vista all-sites

insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.remissions.transit', 'Remisiones: Despachar', 'Pasar remision a en transito'
from public.apps
where code = 'nexo'
on conflict (app_id, code) do nothing;

delete from public.role_permissions rp
using public.app_permissions ap
join public.apps a on a.id = ap.app_id
where rp.permission_id = ap.id
  and a.code = 'nexo'
  and rp.role = 'conductor'
  and ap.code in (
    'inventory.remissions.request',
    'inventory.remissions.prepare',
    'inventory.remissions.receive',
    'inventory.remissions.cancel',
    'inventory.remissions.all_sites',
    'inventory.remissions.transit',
    'inventory.remissions'
  );

insert into public.role_permissions (role, permission_id, scope_type)
select 'conductor', ap.id, 'global'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code in ('inventory.remissions', 'inventory.remissions.transit')
on conflict do nothing;

commit;
