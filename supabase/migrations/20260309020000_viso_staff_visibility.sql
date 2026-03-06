begin;

alter table public.employees enable row level security;

drop policy if exists "employees_select_manager" on public.employees;

create policy "employees_select_manager"
on public.employees
for select
to authenticated
using (
  (public.is_owner() or public.is_global_manager())
  or (
    (public.is_manager_or_owner() or public.current_employee_role() = any (array['logistics'::text]))
    and public.can_access_site(site_id)
  )
);

commit;
