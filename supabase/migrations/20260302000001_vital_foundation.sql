begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists vital;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'vital' and t.typname = 'profile_context'
  ) then
    create type vital.profile_context as enum ('personal', 'employee');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'vital' and t.typname = 'program_status'
  ) then
    create type vital.program_status as enum ('draft', 'active', 'paused', 'archived');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'vital' and t.typname = 'task_status'
  ) then
    create type vital.task_status as enum ('pending', 'in_progress', 'completed', 'skipped', 'snoozed');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'vital' and t.typname = 'competition_mode'
  ) then
    create type vital.competition_mode as enum ('private', 'friends', 'team', 'public');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'vital' and t.typname = 'league_tier'
  ) then
    create type vital.league_tier as enum ('bronze', 'silver', 'gold', 'platinum', 'titan');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'vital' and t.typname = 'challenge_scope'
  ) then
    create type vital.challenge_scope as enum ('personal', 'squad', 'company');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'vital' and t.typname = 'fair_play_severity'
  ) then
    create type vital.fair_play_severity as enum ('low', 'medium', 'high');
  end if;
end
$$;

create table if not exists vital.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'analyst')),
  created_at timestamptz not null default now()
);

create table if not exists vital.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  employee_id uuid,
  profile_context vital.profile_context not null default 'personal',
  display_name text,
  timezone text not null default 'America/Bogota',
  competition_mode vital.competition_mode not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_profiles_employee_id_uidx
  on vital.user_profiles(employee_id)
  where employee_id is not null;

do $$
begin
  if to_regclass('public.employees') is not null
     and not exists (
       select 1
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'vital'
         and t.relname = 'user_profiles'
         and c.conname = 'user_profiles_employee_id_fkey'
     ) then
    alter table vital.user_profiles
      add constraint user_profiles_employee_id_fkey
      foreign key (employee_id) references public.employees(id) on delete set null;
  end if;
end
$$;

create table if not exists vital.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists vital.goal_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  objective text not null check (objective in ('general_health', 'fat_loss', 'hypertrophy', 'strength', 'athlete', 'minimalist')),
  secondary_goals text[] not null default '{}'::text[],
  weekly_days smallint not null check (weekly_days between 1 and 7),
  minutes_per_session smallint not null check (minutes_per_session between 10 and 180),
  experience_level text not null check (experience_level in ('new', 'intermediate', 'advanced')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists goal_profiles_user_active_uidx
  on vital.goal_profiles(user_id)
  where is_active;

create table if not exists vital.availability_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  available_days smallint[] not null default '{1,2,3,4,5}'::smallint[],
  preferred_time_window text not null default 'mixed' check (preferred_time_window in ('morning', 'afternoon', 'evening', 'mixed')),
  timezone text not null default 'America/Bogota',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists availability_profiles_user_active_uidx
  on vital.availability_profiles(user_id)
  where is_active;

create table if not exists vital.health_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  injuries_notes text,
  limitations_notes text,
  risk_flags jsonb not null default '[]'::jsonb,
  safety_gate_status text not null default 'clear' check (safety_gate_status in ('clear', 'review_required', 'blocked')),
  physician_clearance_required boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists health_profiles_user_active_uidx
  on vital.health_profiles(user_id)
  where is_active;

create table if not exists vital.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  objective text not null,
  status vital.program_status not null default 'draft',
  started_on date,
  ended_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists programs_user_id_idx on vital.programs(user_id);

create table if not exists vital.program_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references vital.programs(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  archetype text not null,
  generated_from jsonb not null default '{}'::jsonb,
  rules_snapshot jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists program_versions_program_version_uidx
  on vital.program_versions(program_id, version_number);

create unique index if not exists program_versions_program_active_uidx
  on vital.program_versions(program_id)
  where is_active;

create index if not exists program_versions_user_id_idx on vital.program_versions(user_id);

create table if not exists vital.task_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_version_id uuid not null references vital.program_versions(id) on delete cascade,
  task_type text not null check (task_type in ('workout', 'cardio', 'nutrition', 'supplement', 'sleep', 'metrics', 'recovery')),
  title text not null,
  recurrence_rule jsonb not null default '{}'::jsonb,
  ordering smallint not null default 0,
  estimated_minutes smallint,
  payload jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_templates_user_id_idx on vital.task_templates(user_id);

create table if not exists vital.task_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_template_id uuid not null references vital.task_templates(id) on delete cascade,
  task_date date not null,
  window_start timestamptz,
  window_end timestamptz,
  status vital.task_status not null default 'pending',
  priority smallint not null default 50 check (priority between 0 and 100),
  snooze_until timestamptz,
  completed_at timestamptz,
  completion_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists task_instances_template_date_uidx
  on vital.task_instances(task_template_id, task_date);

create index if not exists task_instances_user_date_idx
  on vital.task_instances(user_id, task_date desc);

create table if not exists vital.session_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_instance_id uuid references vital.task_instances(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  session_rpe numeric(3,1) check (session_rpe is null or (session_rpe >= 0 and session_rpe <= 10)),
  avg_rir numeric(3,1) check (avg_rir is null or (avg_rir >= 0 and avg_rir <= 10)),
  total_sets integer check (total_sets is null or total_sets >= 0),
  total_reps integer check (total_reps is null or total_reps >= 0),
  total_load_kg numeric(12,2) check (total_load_kg is null or total_load_kg >= 0),
  notes text,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create index if not exists session_logs_user_started_idx
  on vital.session_logs(user_id, started_at desc);

create table if not exists vital.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at timestamptz not null default now(),
  weight_kg numeric(6,2) check (weight_kg is null or weight_kg > 0),
  waist_cm numeric(6,2) check (waist_cm is null or waist_cm > 0),
  body_fat_pct numeric(5,2) check (body_fat_pct is null or (body_fat_pct >= 0 and body_fat_pct <= 100)),
  sleep_hours numeric(4,2) check (sleep_hours is null or (sleep_hours >= 0 and sleep_hours <= 24)),
  energy_score smallint check (energy_score is null or (energy_score between 1 and 5)),
  notes text,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create index if not exists body_metrics_user_measured_idx
  on vital.body_metrics(user_id, measured_at desc);

create table if not exists vital.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  adherence_pct numeric(5,2) check (adherence_pct is null or (adherence_pct >= 0 and adherence_pct <= 100)),
  perceived_fatigue smallint check (perceived_fatigue is null or (perceived_fatigue between 1 and 10)),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists weekly_reviews_user_week_uidx
  on vital.weekly_reviews(user_id, week_start);

create table if not exists vital.recovery_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_date date not null,
  sleep_quality smallint check (sleep_quality is null or (sleep_quality between 1 and 5)),
  energy_score smallint check (energy_score is null or (energy_score between 1 and 5)),
  soreness_score smallint check (soreness_score is null or (soreness_score between 0 and 5)),
  resting_hr smallint check (resting_hr is null or resting_hr > 0),
  hrv_ms numeric(8,2) check (hrv_ms is null or hrv_ms > 0),
  source text not null default 'manual',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists recovery_signals_unique_idx
  on vital.recovery_signals(user_id, signal_date, source);

create table if not exists vital.muscle_load_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  muscle_group text not null,
  internal_load numeric(12,2) not null default 0,
  stimulus_score numeric(12,2) not null default 0,
  acute_load numeric(12,2) not null default 0,
  chronic_load numeric(12,2) not null default 0,
  acute_chronic_ratio numeric(8,3),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists muscle_load_snapshots_unique_idx
  on vital.muscle_load_snapshots(user_id, snapshot_date, muscle_group);

create table if not exists vital.fatigue_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  score_date date not null,
  muscle_group text not null,
  fatigue_index numeric(6,2) not null check (fatigue_index >= 0 and fatigue_index <= 100),
  confidence numeric(5,4) not null default 0.70 check (confidence >= 0 and confidence <= 1),
  factors jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists fatigue_scores_unique_idx
  on vital.fatigue_scores(user_id, score_date, muscle_group);

create table if not exists vital.readiness_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  score_date date not null,
  readiness_score numeric(6,2) not null check (readiness_score >= 0 and readiness_score <= 100),
  confidence numeric(5,4) not null default 0.70 check (confidence >= 0 and confidence <= 1),
  recommendation text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists readiness_scores_unique_idx
  on vital.readiness_scores(user_id, score_date);

create table if not exists vital.adaptive_decision_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  decision_at timestamptz not null default now(),
  decision_type text not null,
  reason text not null,
  inputs jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  safety_checked boolean not null default false,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_by text not null default 'system'
);

create index if not exists adaptive_decision_logs_user_idx
  on vital.adaptive_decision_logs(user_id, decision_at desc);

create table if not exists vital.notification_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_type text not null,
  schedule jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notification_plans_user_task_type_uidx
  on vital.notification_plans(user_id, task_type);

create table if not exists vital.game_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp_total bigint not null default 0,
  level integer not null default 1 check (level > 0),
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  competition_mode vital.competition_mode not null default 'private',
  vital_score_weekly numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vital.level_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  level integer not null default 1 check (level > 0),
  xp_into_level integer not null default 0 check (xp_into_level >= 0),
  xp_needed_for_next integer not null default 100 check (xp_needed_for_next > 0),
  updated_at timestamptz not null default now()
);

create table if not exists vital.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  event_type text not null,
  base_xp integer not null check (base_xp >= 0),
  consistency_multiplier numeric(4,2) not null default 1.00 check (consistency_multiplier >= 0 and consistency_multiplier <= 2.00),
  safety_multiplier numeric(4,2) not null default 1.00 check (safety_multiplier >= 0 and safety_multiplier <= 1.00),
  fair_play_multiplier numeric(4,2) not null default 1.00 check (fair_play_multiplier >= 0 and fair_play_multiplier <= 1.00),
  final_xp integer not null check (final_xp >= 0),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists xp_events_user_occurred_idx
  on vital.xp_events(user_id, occurred_at desc);

create table if not exists vital.badges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  rarity text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists vital.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id uuid not null references vital.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  context jsonb not null default '{}'::jsonb
);

create unique index if not exists user_badges_user_badge_uidx
  on vital.user_badges(user_id, badge_id);

create table if not exists vital.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_at date not null,
  ends_at date not null,
  is_active boolean not null default false,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create table if not exists vital.league_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  season_id uuid not null references vital.seasons(id) on delete cascade,
  league_tier vital.league_tier not null default 'bronze',
  bracket_code text,
  week_points numeric(10,2) not null default 0,
  promoted boolean not null default false,
  relegated boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists league_memberships_user_season_uidx
  on vital.league_memberships(user_id, season_id);

create table if not exists vital.weekly_leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  season_id uuid not null references vital.seasons(id) on delete cascade,
  week_start date not null,
  vital_score numeric(10,2) not null,
  rank_position integer check (rank_position is null or rank_position > 0),
  fair_play_multiplier numeric(4,2) not null default 1.00 check (fair_play_multiplier >= 0 and fair_play_multiplier <= 1.00),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists weekly_leaderboard_unique_idx
  on vital.weekly_leaderboard_snapshots(user_id, season_id, week_start);

create table if not exists vital.squads (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists squads_owner_name_uidx
  on vital.squads(owner_user_id, name);

create table if not exists vital.squad_memberships (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references vital.squads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  active boolean not null default true,
  joined_at timestamptz not null default now()
);

create unique index if not exists squad_memberships_squad_user_uidx
  on vital.squad_memberships(squad_id, user_id);

create index if not exists squad_memberships_user_idx
  on vital.squad_memberships(user_id);

create table if not exists vital.challenges (
  id uuid primary key default gen_random_uuid(),
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  scope vital.challenge_scope not null default 'personal',
  name text not null,
  description text,
  rules jsonb not null default '{}'::jsonb,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create table if not exists vital.challenge_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references vital.challenges(id) on delete cascade,
  progress_value numeric(12,2) not null default 0,
  target_value numeric(12,2),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'failed')),
  updated_at timestamptz not null default now()
);

create unique index if not exists challenge_progress_user_challenge_uidx
  on vital.challenge_progress(user_id, challenge_id);

create table if not exists vital.fair_play_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_time timestamptz not null default now(),
  severity vital.fair_play_severity not null default 'low',
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  action_taken text,
  resolved_at timestamptz,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fair_play_events_user_time_idx
  on vital.fair_play_events(user_id, event_time desc);

create or replace function vital.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated_at on vital.user_profiles;
create trigger trg_user_profiles_updated_at before update on vital.user_profiles
for each row execute function vital.set_updated_at();

drop trigger if exists trg_goal_profiles_updated_at on vital.goal_profiles;
create trigger trg_goal_profiles_updated_at before update on vital.goal_profiles
for each row execute function vital.set_updated_at();

drop trigger if exists trg_availability_profiles_updated_at on vital.availability_profiles;
create trigger trg_availability_profiles_updated_at before update on vital.availability_profiles
for each row execute function vital.set_updated_at();

drop trigger if exists trg_health_profiles_updated_at on vital.health_profiles;
create trigger trg_health_profiles_updated_at before update on vital.health_profiles
for each row execute function vital.set_updated_at();

drop trigger if exists trg_programs_updated_at on vital.programs;
create trigger trg_programs_updated_at before update on vital.programs
for each row execute function vital.set_updated_at();

drop trigger if exists trg_task_templates_updated_at on vital.task_templates;
create trigger trg_task_templates_updated_at before update on vital.task_templates
for each row execute function vital.set_updated_at();

drop trigger if exists trg_task_instances_updated_at on vital.task_instances;
create trigger trg_task_instances_updated_at before update on vital.task_instances
for each row execute function vital.set_updated_at();

drop trigger if exists trg_notification_plans_updated_at on vital.notification_plans;
create trigger trg_notification_plans_updated_at before update on vital.notification_plans
for each row execute function vital.set_updated_at();

drop trigger if exists trg_game_profiles_updated_at on vital.game_profiles;
create trigger trg_game_profiles_updated_at before update on vital.game_profiles
for each row execute function vital.set_updated_at();

drop trigger if exists trg_level_states_updated_at on vital.level_states;
create trigger trg_level_states_updated_at before update on vital.level_states
for each row execute function vital.set_updated_at();

drop trigger if exists trg_squads_updated_at on vital.squads;
create trigger trg_squads_updated_at before update on vital.squads
for each row execute function vital.set_updated_at();

drop trigger if exists trg_challenge_progress_updated_at on vital.challenge_progress;
create trigger trg_challenge_progress_updated_at before update on vital.challenge_progress
for each row execute function vital.set_updated_at();

create or replace function vital.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;

create or replace function vital.is_vital_admin()
returns boolean
language sql
stable
security definer
set search_path = public, vital, auth
as $$
  select exists (
    select 1
    from vital.admin_users au
    where au.user_id = auth.uid()
  );
$$;

create or replace function vital.can_access_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, vital, auth
as $$
  select (
    auth.uid() = target_user_id
    or vital.is_vital_admin()
    or vital.is_service_role()
  );
$$;

create or replace function vital.is_squad_member(target_squad_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, vital, auth
as $$
  select exists (
    select 1
    from vital.squad_memberships sm
    where sm.squad_id = target_squad_id
      and sm.user_id = auth.uid()
      and sm.active
  );
$$;

alter table vital.admin_users enable row level security;
create policy admin_users_select_self
  on vital.admin_users
  for select
  using (auth.uid() = user_id or vital.is_service_role());
create policy admin_users_manage_service_only
  on vital.admin_users
  for all
  using (vital.is_service_role())
  with check (vital.is_service_role());

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'user_profiles',
    'consent_records',
    'goal_profiles',
    'availability_profiles',
    'health_profiles',
    'programs',
    'program_versions',
    'task_templates',
    'task_instances',
    'session_logs',
    'body_metrics',
    'weekly_reviews',
    'recovery_signals',
    'muscle_load_snapshots',
    'fatigue_scores',
    'readiness_scores',
    'adaptive_decision_logs',
    'notification_plans',
    'game_profiles',
    'level_states',
    'xp_events',
    'user_badges',
    'league_memberships',
    'weekly_leaderboard_snapshots',
    'squad_memberships',
    'challenge_progress',
    'fair_play_events'
  ] loop
    execute format('alter table vital.%I enable row level security', tbl);
    execute format('create policy %I_select on vital.%I for select using (vital.can_access_user(user_id))', tbl, tbl);
    execute format('create policy %I_insert on vital.%I for insert with check ((auth.uid() = user_id) or vital.is_vital_admin() or vital.is_service_role())', tbl, tbl);
    execute format('create policy %I_update on vital.%I for update using (vital.can_access_user(user_id)) with check (vital.can_access_user(user_id))', tbl, tbl);
    execute format('create policy %I_delete on vital.%I for delete using (vital.can_access_user(user_id))', tbl, tbl);
  end loop;
end
$$;

alter table vital.badges enable row level security;
create policy badges_read_all_authenticated
  on vital.badges
  for select
  using (auth.uid() is not null);
create policy badges_manage_admin
  on vital.badges
  for all
  using (vital.is_vital_admin() or vital.is_service_role())
  with check (vital.is_vital_admin() or vital.is_service_role());

alter table vital.seasons enable row level security;
create policy seasons_read_all_authenticated
  on vital.seasons
  for select
  using (auth.uid() is not null);
create policy seasons_manage_admin
  on vital.seasons
  for all
  using (vital.is_vital_admin() or vital.is_service_role())
  with check (vital.is_vital_admin() or vital.is_service_role());

alter table vital.squads enable row level security;
create policy squads_select_owner_or_member
  on vital.squads
  for select
  using (
    owner_user_id = auth.uid()
    or vital.is_squad_member(id)
    or vital.is_vital_admin()
    or vital.is_service_role()
  );
create policy squads_insert_owner_or_admin
  on vital.squads
  for insert
  with check (
    owner_user_id = auth.uid()
    or vital.is_vital_admin()
    or vital.is_service_role()
  );
create policy squads_update_owner_or_admin
  on vital.squads
  for update
  using (
    owner_user_id = auth.uid()
    or vital.is_vital_admin()
    or vital.is_service_role()
  )
  with check (
    owner_user_id = auth.uid()
    or vital.is_vital_admin()
    or vital.is_service_role()
  );
create policy squads_delete_owner_or_admin
  on vital.squads
  for delete
  using (
    owner_user_id = auth.uid()
    or vital.is_vital_admin()
    or vital.is_service_role()
  );

alter table vital.challenges enable row level security;
create policy challenges_select_authenticated
  on vital.challenges
  for select
  using (auth.uid() is not null);
create policy challenges_insert_creator_or_admin
  on vital.challenges
  for insert
  with check (
    created_by_user_id = auth.uid()
    or vital.is_vital_admin()
    or vital.is_service_role()
  );
create policy challenges_update_creator_or_admin
  on vital.challenges
  for update
  using (
    created_by_user_id = auth.uid()
    or vital.is_vital_admin()
    or vital.is_service_role()
  )
  with check (
    created_by_user_id = auth.uid()
    or vital.is_vital_admin()
    or vital.is_service_role()
  );
create policy challenges_delete_creator_or_admin
  on vital.challenges
  for delete
  using (
    created_by_user_id = auth.uid()
    or vital.is_vital_admin()
    or vital.is_service_role()
  );

grant usage on schema vital to authenticated, service_role;
grant select, insert, update, delete on all tables in schema vital to authenticated;
grant usage, select on all sequences in schema vital to authenticated;

alter default privileges in schema vital
grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema vital
grant usage, select on sequences to authenticated;

commit;
