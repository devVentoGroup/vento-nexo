-- Políticas de asistencia configurables por BD (radio, tolerancia de tardanza, geofence, etc.).
-- La app lee estos valores en lugar de constantes hardcodeadas.
create table if not exists public.attendance_policy (
  id uuid primary key default gen_random_uuid(),
  -- Geofence: precisión GPS máxima aceptada (metros) para check-in y check-out
  geofence_check_in_max_accuracy_meters integer not null default 20,
  geofence_check_out_max_accuracy_meters integer not null default 25,
  -- Tolerancia de tardanza: minutos después del inicio del turno para considerar "a tiempo"
  late_tolerance_minutes integer not null default 15,
  -- Cache de "ubicación válida" (ms) antes de pedir de nuevo
  geofence_ready_cache_ms integer not null default 45000,
  -- Tiempo que el "listo para check-in" sigue válido sin revalidar (ms)
  geofence_latch_ttl_checkin_ms integer not null default 900000,
  geofence_latch_ttl_checkout_ms integer not null default 600000,
  -- Seguimiento de salida (departure): precisión máxima, distancia umbral (m) e intervalo mínimo entre comprobaciones (ms)
  shift_departure_max_accuracy_meters integer not null default 35,
  shift_departure_threshold_meters integer not null default 500,
  shift_departure_min_check_interval_ms integer not null default 45000,
  -- Radio por defecto para sedes sin checkin_radius_meters (metros)
  default_radius_meters integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.attendance_policy is 'Política global de asistencia (ANIMA). Un solo registro activo; la app usa estos valores en lugar de constantes.';

alter table public.attendance_policy enable row level security;

create policy attendance_policy_select_authenticated
  on public.attendance_policy for select to authenticated using (true);

-- Un solo registro: el primero es la política activa
insert into public.attendance_policy (
  geofence_check_in_max_accuracy_meters,
  geofence_check_out_max_accuracy_meters,
  late_tolerance_minutes,
  geofence_ready_cache_ms,
  geofence_latch_ttl_checkin_ms,
  geofence_latch_ttl_checkout_ms,
  shift_departure_max_accuracy_meters,
  shift_departure_threshold_meters,
  shift_departure_min_check_interval_ms
)
select 20, 25, 15, 45000, 900000, 600000, 35, 500, 45000
where not exists (select 1 from public.attendance_policy limit 1);
