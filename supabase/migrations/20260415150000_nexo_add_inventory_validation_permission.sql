-- Agregar permiso inventory.validation para auditoria fisica de LOCs

-- 1. Insertar el permiso si no existe
insert into public.app_permissions (app_id, code, name, description)
select id, 'inventory.validation', 'Validación de LOCs', 'Auditar y validar ubicaciones físicas (LOCs)'
from public.apps where code = 'nexo'
on conflict (app_id, code) do nothing;

-- 2. Asignar permiso a roles globales (propietario, gerente_general)
insert into public.role_permissions (role, permission_id, scope_type)
select r.role, ap.id, 'global'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (values ('propietario'), ('gerente_general')) as r(role) on true
where a.code = 'nexo' and ap.code = 'inventory.validation'
on conflict do nothing;

-- 3. Asignar permiso a roles site-scoped (gerente, bodeguero)
insert into public.role_permissions (role, permission_id, scope_type)
select r.role, ap.id, 'site'::public.permission_scope_type
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
join (values ('gerente'), ('bodeguero')) as r(role) on true
where a.code = 'nexo' and ap.code = 'inventory.validation'
on conflict do nothing;
