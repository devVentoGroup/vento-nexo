-- ANIMA - Allow managers and above to create staff invitations (fix RLS blocking gerentes).
-- staff_invitations had only SELECT policy; INSERT was denied.

drop policy if exists staff_invitations_insert_management on public.staff_invitations;
create policy staff_invitations_insert_management on public.staff_invitations
for insert to authenticated
with check (
  exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and e.role = any (array['propietario'::text, 'gerente_general'::text, 'gerente'::text])
      and (
        e.role = any (array['propietario'::text, 'gerente_general'::text])
        or e.site_id = coalesce(staff_invitations.site_id, staff_invitations.staff_site_id)
      )
  )
);
