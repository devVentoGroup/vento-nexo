-- TEMP override fallback for validation.
-- Tries known emails first, then falls back to active owner account.

do $$
declare
  v_employee_id uuid;
begin
  select e.id
    into v_employee_id
  from auth.users u
  join public.employees e on e.id = u.id
  where lower(trim(u.email)) in (
    lower(trim('carlosaibarra@gmail.com')),
    lower(trim('carlosaaibarra@gmail.com'))
  )
  order by e.id asc
  limit 1;

  if v_employee_id is null then
    select e.id
      into v_employee_id
    from public.employees e
    where e.is_active = true
      and e.role in ('propietario', 'gerente_general')
    order by case when e.role = 'propietario' then 0 else 1 end, e.id asc
    limit 1;
  end if;

  if v_employee_id is null then
    raise notice 'TEMP override fallback skipped: no target employee found.';
    return;
  end if;

  insert into public.employee_permissions (
    employee_id,
    permission_id,
    is_allowed,
    scope_type
  )
  select
    v_employee_id,
    ap.id,
    true,
    'global'::public.permission_scope_type
  from public.app_permissions ap
  join public.apps a on a.id = ap.app_id
  where a.code = 'nexo'
    and a.is_active = true
    and ap.is_active = true
  on conflict (employee_id, permission_id, scope_type, scope_site_id, scope_area_id, scope_site_type, scope_area_kind)
  do update set
    is_allowed = excluded.is_allowed;

  raise notice 'TEMP override fallback applied for employee_id=%.', v_employee_id;
end $$;
