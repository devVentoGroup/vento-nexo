-- Permisiva: gerentes pueden actualizar documentos de empleados de su(s) sede(s)
-- aunque el documento tenga site_id null (p. ej. documentos subidos desde VISO).
-- Propietario y gerente_general ya pueden por documents_update_review.
create policy documents_update_gerente_by_target_employee
  on public.documents
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.employees e
      where e.id = auth.uid()
        and e.role = 'gerente'
        and e.is_active = true
        and documents.scope = 'employee'
        and documents.target_employee_id in (
          select es.employee_id
          from public.employee_sites es
          where es.site_id in (
            select es2.site_id
            from public.employee_sites es2
            where es2.employee_id = auth.uid()
              and es2.is_active = true
          )
          and es.is_active = true
        )
    )
  )
  with check (
    exists (
      select 1
      from public.employees e
      where e.id = auth.uid()
        and e.role = 'gerente'
        and e.is_active = true
        and documents.scope = 'employee'
        and documents.target_employee_id in (
          select es.employee_id
          from public.employee_sites es
          where es.site_id in (
            select es2.site_id
            from public.employee_sites es2
            where es2.employee_id = auth.uid()
              and es2.is_active = true
          )
          and es.is_active = true
        )
    )
  );
