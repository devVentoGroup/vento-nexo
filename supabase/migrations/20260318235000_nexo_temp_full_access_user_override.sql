-- TEMP override for validation: full NEXO access for one user regardless active role.
-- Update/remove this migration in production hardening if you no longer need it.

do $$
declare
  v_email text := 'carlosaibarra@gmail.com';
  v_employee_id uuid;
begin
  select e.id
    into v_employee_id
  from auth.users u
  join public.employees e on e.id = u.id
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if v_employee_id is null then
    raise notice 'TEMP override skipped: employee not found for %', v_email;
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

  raise notice 'TEMP override applied for % (employee_id=%).', v_email, v_employee_id;
end $$;
