-- Remove TEMP full-access NEXO override for validation users.
-- Goal: return sandbox permission behavior to the canonical DB matrix.

begin;

do $$
declare
  v_deleted_count integer := 0;
begin
  with target_employees as (
    select e.id
    from auth.users u
    join public.employees e
      on e.id = u.id
    where lower(trim(u.email)) in (
      lower(trim('carlosaibarra@gmail.com')),
      lower(trim('carlosaaibarra@gmail.com'))
    )
  ),
  deleted_rows as (
    delete from public.employee_permissions ep
    using public.app_permissions ap
    join public.apps a
      on a.id = ap.app_id
    where ep.permission_id = ap.id
      and a.code = 'nexo'
      and ep.employee_id in (select id from target_employees)
    returning ep.employee_id
  )
  select count(*) into v_deleted_count
  from deleted_rows;

  raise notice 'Removed % NEXO employee override row(s) for validation user(s).', v_deleted_count;
end $$;

commit;