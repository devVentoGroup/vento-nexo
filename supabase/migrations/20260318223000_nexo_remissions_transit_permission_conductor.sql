begin;

-- Add explicit dispatch/transit permission for remissions.
insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.remissions.transit', 'Remisiones: Despachar', 'Pasar remision a en transito'
from public.apps
where code = 'nexo'
on conflict (app_id, code) do nothing;

-- Reset grants for this permission in controlled roles.
delete from public.role_permissions rp
using public.app_permissions ap
join public.apps a on a.id = ap.app_id
where rp.permission_id = ap.id
  and a.code = 'nexo'
  and ap.code = 'inventory.remissions.transit'
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

-- Only conductor can dispatch remissions to in_transit.
insert into public.role_permissions (role, permission_id, scope_type)
select 'conductor', ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
  and ap.code = 'inventory.remissions.transit'
on conflict do nothing;

commit;
