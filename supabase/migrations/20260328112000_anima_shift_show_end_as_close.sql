alter table if exists public.employee_shifts
  add column if not exists show_end_as_close boolean not null default false;

comment on column public.employee_shifts.show_end_as_close is
  'Si es true, el turno se muestra en UI como "Inicio - Cierre" para vista legal/comercial, manteniendo end_time interno para reglas de negocio.';

