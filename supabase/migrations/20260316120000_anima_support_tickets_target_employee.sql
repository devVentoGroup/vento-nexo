-- Soporte: tickets dirigidos a un trabajador (gerentes/propietarios pueden iniciar conversación o enviar aviso).
-- El trabajador verá el ticket en su lista de Soporte.

alter table public.support_tickets
  add column if not exists target_employee_id uuid references public.employees (id) on delete set null;

comment on column public.support_tickets.target_employee_id is 'Cuando lo define un gerente/propietario, el trabajador con este employee_id ve el ticket en Soporte.';

-- El trabajador puede ver tickets donde él es el destinatario (auth.uid() = employee id en este proyecto).
drop policy if exists support_tickets_select_as_target on public.support_tickets;
create policy support_tickets_select_as_target
  on public.support_tickets
  for select
  to authenticated
  using (target_employee_id = auth.uid());
