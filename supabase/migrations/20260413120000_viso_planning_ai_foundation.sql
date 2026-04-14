create schema if not exists viso;

create table if not exists viso.site_planning_rules (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  opens_at time not null,
  closes_at time not null,
  slot_minutes integer not null default 30 check (slot_minutes in (15, 30, 60)),
  min_rest_between_shifts_hours numeric(5,2) not null default 10,
  max_daily_minutes integer not null default 480,
  max_weekly_minutes integer not null default 2880,
  allow_split_shifts boolean not null default true,
  allow_cross_site_assignment boolean not null default false,
  late_tolerance_minutes integer not null default 10,
  planning_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id)
);

create table if not exists viso.site_staffing_requirements (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  min_headcount integer not null default 1 check (min_headcount >= 0),
  ideal_headcount integer not null default 1 check (ideal_headcount >= min_headcount),
  max_headcount integer null check (max_headcount is null or max_headcount >= ideal_headcount),
  required_role_code text null,
  priority_weight numeric(6,2) not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, day_of_week, start_time, end_time, required_role_code)
);

create table if not exists viso.employee_availability (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  site_id uuid null references public.sites (id) on delete set null,
  day_of_week integer not null check (day_of_week between 0 and 6),
  available_from time not null,
  available_to time not null,
  is_available boolean not null default true,
  availability_kind text not null default 'preferred'
    check (availability_kind in ('preferred', 'allowed', 'blocked')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists viso.employee_shift_preferences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  site_id uuid null references public.sites (id) on delete set null,
  prefers_morning boolean not null default false,
  prefers_afternoon boolean not null default false,
  prefers_evening boolean not null default false,
  avoid_opening boolean not null default false,
  avoid_closing boolean not null default false,
  cross_site_willingness numeric(6,2) not null default 0,
  preferred_days integer[] not null default '{}',
  blocked_days integer[] not null default '{}',
  preference_weight numeric(6,2) not null default 1,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, site_id)
);

create table if not exists viso.employee_planning_limits (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  site_id uuid null references public.sites (id) on delete set null,
  min_weekly_minutes integer not null default 0,
  target_weekly_minutes integer not null default 2400,
  max_weekly_minutes integer not null default 2880,
  max_daily_minutes integer not null default 480,
  max_consecutive_days integer not null default 6,
  min_rest_hours numeric(5,2) not null default 10,
  can_split_shift boolean not null default true,
  can_cover_satellites boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, site_id)
);

create table if not exists viso.demand_history_hourly (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  business_date date not null,
  hour_of_day integer not null check (hour_of_day between 0 and 23),
  sales_amount numeric(14,2) not null default 0,
  ticket_count integer not null default 0,
  items_count integer not null default 0,
  source text not null default 'sales_history',
  source_ref text null,
  created_at timestamptz not null default now(),
  unique (site_id, business_date, hour_of_day, source)
);

create table if not exists viso.demand_forecasts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  forecast_date date not null,
  hour_of_day integer not null check (hour_of_day between 0 and 23),
  predicted_sales numeric(14,2) not null default 0,
  predicted_tickets integer not null default 0,
  recommended_min_headcount integer not null default 0,
  recommended_ideal_headcount integer not null default 0,
  recommended_max_headcount integer null,
  recommended_role_mix jsonb not null default '{}'::jsonb,
  model_version text not null default 'v1',
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (site_id, forecast_date, hour_of_day, model_version)
);

create table if not exists viso.shift_generation_runs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  week_start date not null,
  status text not null default 'draft'
    check (status in ('draft', 'completed', 'discarded', 'applied', 'failed')),
  strategy text not null default 'heuristic_v1',
  input_snapshot jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_by uuid null references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists viso.shift_generation_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references viso.shift_generation_runs (id) on delete cascade,
  rank_order integer not null default 1,
  score numeric(8,2) not null default 0,
  coverage_score numeric(8,2) not null default 0,
  fairness_score numeric(8,2) not null default 0,
  continuity_score numeric(8,2) not null default 0,
  preference_score numeric(8,2) not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  explanation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, rank_order)
);

create table if not exists viso.shift_generation_candidate_items (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references viso.shift_generation_candidates (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  shift_kind text not null default 'laboral' check (shift_kind in ('laboral', 'descanso')),
  notes text null,
  explanation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_viso_site_staffing_requirements_site_day
  on viso.site_staffing_requirements (site_id, day_of_week, start_time);

create index if not exists idx_viso_employee_availability_employee_day
  on viso.employee_availability (employee_id, day_of_week, available_from);

create unique index if not exists uq_viso_employee_availability_scope
  on viso.employee_availability (
    employee_id,
    coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid),
    day_of_week,
    available_from,
    available_to
  );

create index if not exists idx_viso_employee_preferences_employee
  on viso.employee_shift_preferences (employee_id, site_id);

create index if not exists idx_viso_employee_limits_employee
  on viso.employee_planning_limits (employee_id, site_id);

create index if not exists idx_viso_demand_history_hourly_site_date
  on viso.demand_history_hourly (site_id, business_date, hour_of_day);

create index if not exists idx_viso_demand_forecasts_site_date
  on viso.demand_forecasts (site_id, forecast_date, hour_of_day);

create index if not exists idx_viso_shift_generation_runs_site_week
  on viso.shift_generation_runs (site_id, week_start desc);

create index if not exists idx_viso_shift_generation_candidates_run_rank
  on viso.shift_generation_candidates (run_id, rank_order);

create index if not exists idx_viso_shift_generation_items_candidate_date
  on viso.shift_generation_candidate_items (candidate_id, shift_date, start_time);

comment on schema viso is
  'Esquema de planeacion web, demanda, reglas y generacion inteligente para VISO.';

comment on table viso.site_planning_rules is
  'Reglas base de planificacion por sede. No reemplaza tablas operativas existentes en public.';

comment on table viso.site_staffing_requirements is
  'Cobertura minima, ideal y maxima por franja de la sede.';

comment on table viso.employee_availability is
  'Disponibilidad declarada o bloqueos por trabajador y opcionalmente por sede.';

comment on table viso.employee_shift_preferences is
  'Preferencias blandas por trabajador para scoring de sugerencias.';

comment on table viso.employee_planning_limits is
  'Limites operativos para asignacion de turnos por trabajador.';

comment on table viso.demand_history_hourly is
  'Historico agregado por hora que alimenta modelos de demanda y cobertura.';

comment on table viso.demand_forecasts is
  'Pronosticos futuros de demanda y staffing recomendado por hora.';

comment on table viso.shift_generation_runs is
  'Cada corrida del generador de horarios para una sede y semana.';

comment on table viso.shift_generation_candidates is
  'Candidatos rankeados producidos por una corrida del generador.';

comment on table viso.shift_generation_candidate_items is
  'Turnos concretos propuestos dentro de un candidato de generacion.';
