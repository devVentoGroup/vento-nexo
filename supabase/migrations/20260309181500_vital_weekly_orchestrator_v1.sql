begin;

create table if not exists vital.sport_objective_blend_rules (
  id uuid primary key default gen_random_uuid(),
  sport_key text not null,
  objective_key text not null,
  module_key text not null references vital.module_catalog(key) on delete cascade,
  weight_pct smallint not null default 25,
  max_sessions_per_week smallint,
  min_recovery_gap_hours smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sport_objective_blend_rules_weight_check check (weight_pct between 0 and 100)
);

create unique index if not exists sport_objective_blend_rules_unique_idx
  on vital.sport_objective_blend_rules (sport_key, objective_key, module_key);

create table if not exists vital.module_interference_rules (
  id uuid primary key default gen_random_uuid(),
  primary_module_key text not null references vital.module_catalog(key) on delete cascade,
  secondary_module_key text not null references vital.module_catalog(key) on delete cascade,
  same_day_penalty smallint not null default 0,
  next_day_penalty smallint not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint module_interference_rules_penalty_check check (
    same_day_penalty between 0 and 40 and next_day_penalty between 0 and 40
  )
);

create unique index if not exists module_interference_rules_unique_idx
  on vital.module_interference_rules (primary_module_key, secondary_module_key);

alter table vital.sport_objective_blend_rules enable row level security;
alter table vital.module_interference_rules enable row level security;

drop policy if exists sport_objective_blend_rules_read_authenticated on vital.sport_objective_blend_rules;
create policy sport_objective_blend_rules_read_authenticated
  on vital.sport_objective_blend_rules
  for select
  using (auth.uid() is not null);

drop policy if exists sport_objective_blend_rules_manage_admin on vital.sport_objective_blend_rules;
create policy sport_objective_blend_rules_manage_admin
  on vital.sport_objective_blend_rules
  for all
  using (vital.is_vital_admin() or vital.is_service_role())
  with check (vital.is_vital_admin() or vital.is_service_role());

drop policy if exists module_interference_rules_read_authenticated on vital.module_interference_rules;
create policy module_interference_rules_read_authenticated
  on vital.module_interference_rules
  for select
  using (auth.uid() is not null);

drop policy if exists module_interference_rules_manage_admin on vital.module_interference_rules;
create policy module_interference_rules_manage_admin
  on vital.module_interference_rules
  for all
  using (vital.is_vital_admin() or vital.is_service_role())
  with check (vital.is_vital_admin() or vital.is_service_role());

insert into vital.sport_objective_blend_rules (
  sport_key, objective_key, module_key, weight_pct, max_sessions_per_week, min_recovery_gap_hours
)
values
  ('football', 'performance', 'training', 40, 4, 24),
  ('football', 'performance', 'recovery', 30, 4, 24),
  ('football', 'performance', 'nutrition', 20, 7, 0),
  ('football', 'performance', 'habits', 10, 7, 0),

  ('football', 'strength', 'training', 45, 4, 24),
  ('football', 'strength', 'recovery', 25, 4, 24),
  ('football', 'strength', 'nutrition', 20, 7, 0),
  ('football', 'strength', 'habits', 10, 7, 0),

  ('gym', 'strength', 'training', 50, 5, 24),
  ('gym', 'strength', 'recovery', 20, 4, 24),
  ('gym', 'strength', 'nutrition', 20, 7, 0),
  ('gym', 'strength', 'habits', 10, 7, 0),

  ('volleyball', 'performance', 'training', 40, 4, 24),
  ('volleyball', 'performance', 'recovery', 30, 4, 24),
  ('volleyball', 'performance', 'nutrition', 20, 7, 0),
  ('volleyball', 'performance', 'habits', 10, 7, 0),

  ('generic', 'any', 'training', 35, 4, 24),
  ('generic', 'any', 'recovery', 25, 4, 24),
  ('generic', 'any', 'nutrition', 25, 7, 0),
  ('generic', 'any', 'habits', 15, 7, 0)
on conflict (sport_key, objective_key, module_key) do update
set
  weight_pct = excluded.weight_pct,
  max_sessions_per_week = excluded.max_sessions_per_week,
  min_recovery_gap_hours = excluded.min_recovery_gap_hours,
  updated_at = now();

insert into vital.module_interference_rules (
  primary_module_key, secondary_module_key, same_day_penalty, next_day_penalty, note
)
values
  ('training', 'training', 10, 8, 'Evitar sesiones intensas de entrenamiento repetidas sin recuperacion.'),
  ('training', 'recovery', 0, 0, 'Combinacion permitida y recomendada.'),
  ('training', 'nutrition', 0, 0, 'Soporte positivo de recuperacion y rendimiento.'),
  ('training', 'habits', 0, 0, 'Habitos de soporte no penalizan carga.'),
  ('recovery', 'training', 2, 0, 'Si hay recovery intenso, reducir carga total del mismo dia.'),
  ('nutrition', 'training', 0, 0, 'Nutricion no interfiere con entrenamiento.'),
  ('habits', 'training', 0, 0, 'Habitos no interfiere con entrenamiento.')
on conflict (primary_module_key, secondary_module_key) do update
set
  same_day_penalty = excluded.same_day_penalty,
  next_day_penalty = excluded.next_day_penalty,
  note = excluded.note,
  updated_at = now();

create or replace function vital.plan_weekly_fused_schedule(
  p_week_start date default date_trunc('week', (now() at time zone 'utc'))::date,
  p_dominant_objective text default null
)
returns table (
  plan_date date,
  module_key text,
  task_type text,
  title text,
  estimated_minutes smallint,
  blend_weight smallint,
  conflict_penalty smallint,
  priority_hint integer,
  interference_note text
)
language plpgsql
security invoker
set search_path = public, vital, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_week_start date := coalesce(p_week_start, date_trunc('week', (now() at time zone 'utc'))::date);
  v_primary_sport text := 'generic';
  v_global_objectives jsonb := '[]'::jsonb;
  v_dominant_objective text := coalesce(nullif(trim(p_dominant_objective), ''), 'any');
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select sp.primary_sport, sp.global_objectives
    into v_primary_sport, v_global_objectives
  from vital.get_sports_profile() as sp(
    sports,
    primary_sport,
    global_objectives,
    constraints,
    cycle_config,
    profile_version,
    updated_at
  );

  v_primary_sport := coalesce(nullif(v_primary_sport, ''), 'generic');

  if v_dominant_objective = 'any' and exists (
    select 1
    from jsonb_array_elements_text(coalesce(v_global_objectives, '[]'::jsonb)) go
    where go = 'performance'
  ) then
    v_dominant_objective := 'performance';
  elsif v_dominant_objective = 'any' and exists (
    select 1
    from jsonb_array_elements_text(coalesce(v_global_objectives, '[]'::jsonb)) go
    where go = 'strength'
  ) then
    v_dominant_objective := 'strength';
  end if;

  return query
  with enabled_modules as (
    select ump.module_key
    from vital.get_user_module_preferences() as ump(module_key, is_enabled, config)
    where ump.is_enabled
  ),
  week_days as (
    select generate_series(v_week_start, v_week_start + 6, interval '1 day')::date as plan_date
  ),
  base_templates as (
    select
      tt.id as task_template_id,
      tt.module_key,
      tt.task_type,
      tt.title,
      coalesce(tt.estimated_minutes, 10)::smallint as estimated_minutes,
      coalesce(tt.ordering, 1)::smallint as ordering,
      coalesce(tt.recurrence_rule, '{}'::jsonb) as recurrence_rule
    from vital.task_templates tt
    join enabled_modules em
      on em.module_key = tt.module_key
    where tt.user_id = v_user_id
      and tt.is_active
  ),
  expanded as (
    select
      wd.plan_date,
      bt.task_template_id,
      bt.module_key,
      bt.task_type,
      bt.title,
      bt.estimated_minutes,
      bt.ordering
    from base_templates bt
    join week_days wd on true
    where
      case
        when jsonb_typeof(bt.recurrence_rule -> 'days') = 'array' then
          extract(isodow from wd.plan_date)::int in (
            select value::int
            from jsonb_array_elements_text(bt.recurrence_rule -> 'days')
          )
        else true
      end
  ),
  with_blend as (
    select
      e.*,
      coalesce(sobr.weight_pct, sobr_any.weight_pct, 20)::smallint as blend_weight,
      coalesce(sobr.max_sessions_per_week, sobr_any.max_sessions_per_week, 7)::smallint as max_sessions_per_week
    from expanded e
    left join vital.sport_objective_blend_rules sobr
      on sobr.module_key = e.module_key
     and sobr.sport_key = v_primary_sport
     and sobr.objective_key = v_dominant_objective
    left join vital.sport_objective_blend_rules sobr_any
      on sobr_any.module_key = e.module_key
     and sobr_any.sport_key = 'generic'
     and sobr_any.objective_key = 'any'
  ),
  week_limited as (
    select
      wb.*,
      row_number() over (partition by wb.module_key order by wb.plan_date, wb.ordering, wb.task_template_id)::int as rn_module_week
    from with_blend wb
  ),
  valid_rows as (
    select *
    from week_limited wl
    where wl.rn_module_week <= wl.max_sessions_per_week
  ),
  same_day_counts as (
    select
      vr.plan_date,
      vr.module_key,
      count(*)::int as module_tasks_count
    from valid_rows vr
    group by vr.plan_date, vr.module_key
  ),
  scored as (
    select
      vr.plan_date,
      vr.module_key,
      vr.task_type,
      vr.title,
      vr.estimated_minutes,
      vr.blend_weight,
      coalesce((
        select max(mir.same_day_penalty)
        from same_day_counts sdc2
        join vital.module_interference_rules mir
          on mir.primary_module_key = vr.module_key
         and mir.secondary_module_key = sdc2.module_key
        where sdc2.plan_date = vr.plan_date
          and sdc2.module_key <> vr.module_key
      ), 0)::smallint as conflict_penalty,
      coalesce((
        select mir.note
        from same_day_counts sdc2
        join vital.module_interference_rules mir
          on mir.primary_module_key = vr.module_key
         and mir.secondary_module_key = sdc2.module_key
        where sdc2.plan_date = vr.plan_date
          and sdc2.module_key <> vr.module_key
        order by mir.same_day_penalty desc
        limit 1
      ), 'Sin interferencias relevantes detectadas.') as interference_note,
      vr.ordering,
      vr.task_template_id
    from valid_rows vr
  )
  select
    s.plan_date,
    s.module_key,
    s.task_type,
    s.title,
    s.estimated_minutes,
    s.blend_weight,
    s.conflict_penalty,
    greatest(
      10,
      least(
        99,
        (40 + (s.blend_weight / 2) - s.conflict_penalty - (s.ordering - 1))::int
      )
    ) as priority_hint,
    s.interference_note
  from scored s
  order by s.plan_date asc, priority_hint desc, s.module_key asc, s.title asc;
end
$$;

grant execute on function vital.plan_weekly_fused_schedule(date, text) to authenticated, service_role;

commit;
