-- Asignar inventory.validation a propietario explícitamente

-- Obtener el ID del permiso y asignarlo directamente
insert into public.role_permissions (role, permission_id, scope_type, scope_site_type, scope_area_kind)
select 
  'propietario',
  (select id from public.app_permissions where code = 'inventory.validation'),
  'global'::public.permission_scope_type,
  null,
  null
where exists (select 1 from public.app_permissions where code = 'inventory.validation')
on conflict (role, permission_id, scope_type, scope_site_type, scope_area_kind) do nothing;

-- Verificar que está asignado
select 
  rp.role,
  ap.code,
  rp.scope_type
from public.role_permissions rp
join public.app_permissions ap on ap.id = rp.permission_id
where ap.code = 'inventory.validation' and rp.role = 'propietario';
