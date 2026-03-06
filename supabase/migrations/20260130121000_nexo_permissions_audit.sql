-- Verify NEXO permissions by role and scope
-- Usage: run in Supabase SQL editor

-- 1) All NEXO permissions catalog
select a.code as app,
       ap.code as permission_code,
       ap.name,
       ap.description,
       ap.is_active
from public.app_permissions ap
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
order by ap.code;

-- 2) Role -> permission matrix (base role permissions)
select rp.role,
       ap.code as permission_code,
       rp.scope_type,
       rp.scope_site_type,
       rp.scope_area_kind,
       rp.is_allowed
from public.role_permissions rp
join public.app_permissions ap on ap.id = rp.permission_id
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
order by rp.role, ap.code, rp.scope_type, rp.scope_site_type nulls first;

-- 3) Employee overrides (explicit allow/deny)
select ep.employee_id,
       ap.code as permission_code,
       ep.is_allowed,
       ep.scope_type,
       ep.scope_site_id,
       ep.scope_area_id,
       ep.scope_site_type,
       ep.scope_area_kind
from public.employee_permissions ep
join public.app_permissions ap on ap.id = ep.permission_id
join public.apps a on a.id = ap.app_id
where a.code = 'nexo'
order by ep.employee_id, ap.code;

-- 4) Effective permission check for a specific employee + site
-- Replace :employee_id and :site_id
-- Example: select * from public.check_nexo_permissions('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111111');
create or replace function public.check_nexo_permissions(p_employee_id uuid, p_site_id uuid)
returns table(permission_code text, allowed boolean)
language sql
stable
as $$
  with perms as (
    select ap.code as permission_code
    from public.app_permissions ap
    join public.apps a on a.id = ap.app_id
    where a.code = 'nexo'
  ),
  ctx as (
    select p_employee_id as employee_id, p_site_id as site_id
  )
  select p.permission_code,
         public.has_permission('nexo.' || p.permission_code, (select site_id from ctx), null) as allowed
  from perms p
  order by p.permission_code;
$$;

-- 5) Quickly test a specific user and site
-- select * from public.check_nexo_permissions(:employee_id, :site_id);
