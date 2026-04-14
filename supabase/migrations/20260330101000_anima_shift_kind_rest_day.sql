begin;

alter table if exists public.employee_shifts
  add column if not exists shift_kind text not null default 'laboral';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employee_shifts_shift_kind_check'
  ) then
    alter table public.employee_shifts
      add constraint employee_shifts_shift_kind_check
      check (shift_kind in ('laboral', 'descanso'));
  end if;
end $$;

update public.employee_shifts
set shift_kind = 'laboral'
where shift_kind is null;

comment on column public.employee_shifts.shift_kind is
  'Tipo de turno: laboral (con jornada) o descanso (no laboral, visible al empleado como descanso programado).';

commit;

