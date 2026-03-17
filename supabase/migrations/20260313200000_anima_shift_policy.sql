-- Políticas de turnos: aviso de publicación, recordatorio, máximo horas por turno, etc.
-- La app y el backend las leen; sin fila se usan valores por defecto.
create table if not exists public.shift_policy (
  id int primary key default 1 check (id = 1),
  publication_notice_minutes int not null default 0,
  reminder_minutes_before_shift int not null default 60,
  max_shift_hours_per_day numeric not null default 12,
  min_hours_between_shifts numeric not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.shift_policy is 'Políticas globales de turnos ANIMA: aviso publicación, recordatorio, máx horas por turno, mín entre turnos.';

alter table public.shift_policy enable row level security;

create policy shift_policy_select_authenticated
  on public.shift_policy for select to authenticated using (true);

insert into public.shift_policy (
  id,
  publication_notice_minutes,
  reminder_minutes_before_shift,
  max_shift_hours_per_day,
  min_hours_between_shifts
) values (1, 0, 60, 12, 0)
on conflict (id) do nothing;
