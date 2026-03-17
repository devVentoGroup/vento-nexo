-- Políticas de asistencia por sede: radio, si exige geofence, etc.
-- La app usa estos valores para geofence y validaciones; si no hay fila para una sede, se usa el comportamiento actual (sites.checkin_radius_meters y coordenadas).
create table if not exists public.site_attendance_policy (
  site_id uuid primary key references public.sites(id) on delete cascade,
  -- Radio en metros para considerar "dentro" de la sede (null = usar sites.checkin_radius_meters)
  checkin_radius_meters integer,
  -- Si true/false sobreescribe; null = derivar de que la sede tenga coordenadas
  requires_geofence boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_attendance_policy_radius_positive check (checkin_radius_meters is null or checkin_radius_meters > 0)
);

comment on table public.site_attendance_policy is 'Políticas de asistencia por sede (ANIMA). Overrides opcionales; sin fila se usa sites.checkin_radius_meters y presencia de coordenadas.';

alter table public.site_attendance_policy enable row level security;

create policy site_attendance_policy_select_authenticated
  on public.site_attendance_policy for select to authenticated using (true);
