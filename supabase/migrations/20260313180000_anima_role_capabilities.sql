-- Capacidades por rol: quién puede hacer qué (shift.create, team.invite, etc.).
-- La app comprueba estas filas antes de permitir una acción; sin filas se usa el comportamiento actual por rol hardcodeado.
create table if not exists public.role_capabilities (
  role text not null,
  capability text not null,
  created_at timestamptz not null default now(),
  primary key (role, capability)
);

comment on table public.role_capabilities is 'Capacidades por rol (ANIMA). Ej: shift.create, team.invite. Sin filas la app usa lógica actual por rol.';

alter table public.role_capabilities enable row level security;

create policy role_capabilities_select_authenticated
  on public.role_capabilities for select to authenticated using (true);

-- Seed: mismo comportamiento actual (propietario, gerente_general, gerente pueden gestionar turnos y equipo)
insert into public.role_capabilities (role, capability)
values
  ('propietario', 'shift.create'),
  ('propietario', 'shift.edit'),
  ('propietario', 'shift.cancel'),
  ('propietario', 'team.view'),
  ('propietario', 'team.invite'),
  ('gerente_general', 'shift.create'),
  ('gerente_general', 'shift.edit'),
  ('gerente_general', 'shift.cancel'),
  ('gerente_general', 'team.view'),
  ('gerente_general', 'team.invite'),
  ('gerente', 'shift.create'),
  ('gerente', 'shift.edit'),
  ('gerente', 'shift.cancel'),
  ('gerente', 'team.view'),
  ('gerente', 'team.invite')
on conflict (role, capability) do nothing;
