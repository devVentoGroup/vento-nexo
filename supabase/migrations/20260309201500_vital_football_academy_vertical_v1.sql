begin;

create table if not exists vital.football_preset_catalog (
  key text primary key,
  name text not null,
  description text not null,
  objective_key text not null,
  dominant_focus text not null,
  cycle_weeks smallint not null default 4,
  modules jsonb not null default '["training","recovery","nutrition","habits"]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint football_preset_catalog_cycle_weeks_check check (cycle_weeks between 2 and 8)
);

alter table vital.football_preset_catalog enable row level security;

drop policy if exists football_preset_catalog_read_authenticated on vital.football_preset_catalog;
create policy football_preset_catalog_read_authenticated
  on vital.football_preset_catalog
  for select
  using (auth.uid() is not null);

drop policy if exists football_preset_catalog_manage_admin on vital.football_preset_catalog;
create policy football_preset_catalog_manage_admin
  on vital.football_preset_catalog
  for all
  using (vital.is_vital_admin() or vital.is_service_role())
  with check (vital.is_vital_admin() or vital.is_service_role());

insert into vital.football_preset_catalog (key, name, description, objective_key, dominant_focus, cycle_weeks, modules, config, is_active)
values
  (
    'football_performance',
    'Futbol Rendimiento',
    'Desarrollo integral para rendimiento competitivo en futbol.',
    'performance',
    'sport_performance',
    4,
    '["training","recovery","nutrition","habits"]'::jsonb,
    '{"days_per_week":5,"minutes_per_session":60,"priority":"agility_power"}'::jsonb,
    true
  ),
  (
    'football_injury_prevention',
    'Futbol Prevencion Lesion',
    'Bloque enfocado en estabilidad, movilidad y control de carga.',
    'health',
    'injury_prevention',
    4,
    '["training","recovery","habits"]'::jsonb,
    '{"days_per_week":4,"minutes_per_session":50,"priority":"mobility_stability"}'::jsonb,
    true
  ),
  (
    'football_power',
    'Futbol Potencia',
    'Enfoque en potencia, aceleracion y acciones explosivas.',
    'strength',
    'power_development',
    5,
    '["training","recovery","nutrition","habits"]'::jsonb,
    '{"days_per_week":5,"minutes_per_session":65,"priority":"power_speed"}'::jsonb,
    true
  ),
  (
    'football_return_to_play',
    'Futbol Retorno Progresivo',
    'Retorno gradual post pausa/lesion con progresion segura.',
    'health',
    'return_to_play',
    6,
    '["training","recovery","nutrition","habits"]'::jsonb,
    '{"days_per_week":4,"minutes_per_session":45,"priority":"progressive_exposure"}'::jsonb,
    true
  )
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  objective_key = excluded.objective_key,
  dominant_focus = excluded.dominant_focus,
  cycle_weeks = excluded.cycle_weeks,
  modules = excluded.modules,
  config = excluded.config,
  is_active = excluded.is_active,
  updated_at = now();

create table if not exists vital.academy_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references vital.squads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  staff_role text not null check (staff_role in ('head_coach', 'assistant_coach', 'physio', 'nutritionist', 'analyst')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists academy_staff_assignments_unique_idx
  on vital.academy_staff_assignments (squad_id, user_id, staff_role);

alter table vital.academy_staff_assignments enable row level security;

drop policy if exists academy_staff_assignments_select on vital.academy_staff_assignments;
create policy academy_staff_assignments_select
  on vital.academy_staff_assignments
  for select
  using (
    vital.is_vital_admin()
    or vital.is_service_role()
    or exists (
      select 1
      from vital.squads s
      where s.id = academy_staff_assignments.squad_id
        and s.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from vital.academy_staff_assignments asa
      where asa.squad_id = academy_staff_assignments.squad_id
        and asa.user_id = auth.uid()
        and asa.active
    )
  );

drop policy if exists academy_staff_assignments_manage on vital.academy_staff_assignments;
create policy academy_staff_assignments_manage
  on vital.academy_staff_assignments
  for all
  using (
    vital.is_vital_admin()
    or vital.is_service_role()
    or exists (
      select 1
      from vital.squads s
      where s.id = academy_staff_assignments.squad_id
        and s.owner_user_id = auth.uid()
    )
  )
  with check (
    vital.is_vital_admin()
    or vital.is_service_role()
    or exists (
      select 1
      from vital.squads s
      where s.id = academy_staff_assignments.squad_id
        and s.owner_user_id = auth.uid()
    )
  );

create or replace function vital.list_football_presets()
returns setof vital.football_preset_catalog
language sql
security invoker
set search_path = public, vital, auth
as $$
  select *
  from vital.football_preset_catalog
  where is_active
  order by key;
$$;

create or replace function vital.apply_football_preset(
  p_preset_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, vital, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_preset vital.football_preset_catalog;
  v_modules jsonb;
  v_sport_result jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select *
    into v_preset
  from vital.football_preset_catalog fpc
  where fpc.key = p_preset_key
    and fpc.is_active;

  if v_preset.key is null then
    raise exception 'football preset not found or inactive';
  end if;

  v_modules := coalesce(v_preset.modules, '[]'::jsonb);

  perform vital.upsert_user_module_preferences(
    (
      select jsonb_agg(
        jsonb_build_object(
          'module_key', mc.key,
          'is_enabled', exists (
            select 1
            from jsonb_array_elements_text(v_modules) m
            where m = mc.key
          ),
          'config', '{}'::jsonb
        )
      )
      from vital.module_catalog mc
      where mc.is_active
    )
  );

  perform vital.upsert_sports_profile(
    jsonb_build_object(
      'sports', jsonb_build_array(
        jsonb_build_object('key', 'football', 'priority', 'A', 'level', 'intermediate'),
        jsonb_build_object('key', 'gym', 'priority', 'B', 'level', 'intermediate')
      ),
      'primary_sport', 'football',
      'global_objectives', jsonb_build_array(v_preset.objective_key),
      'constraints', jsonb_build_object(
        'days_per_week', coalesce((v_preset.config ->> 'days_per_week')::int, 5),
        'minutes_per_session', coalesce((v_preset.config ->> 'minutes_per_session')::int, 60)
      ),
      'cycle_config', jsonb_build_object(
        'dominant_focus', v_preset.dominant_focus,
        'cycle_weeks', v_preset.cycle_weeks
      )
    )
  );

  select vital.apply_sport_templates_from_profile(v_preset.objective_key)
    into v_sport_result;

  return jsonb_build_object(
    'preset_key', v_preset.key,
    'objective_key', v_preset.objective_key,
    'dominant_focus', v_preset.dominant_focus,
    'cycle_weeks', v_preset.cycle_weeks,
    'modules', v_modules,
    'sport_templates', coalesce(v_sport_result, '{}'::jsonb)
  );
end
$$;

create or replace function vital.staff_weekly_squad_overview(
  p_squad_id uuid,
  p_week_start date default date_trunc('week', (now() at time zone 'utc'))::date
)
returns table (
  user_id uuid,
  display_name text,
  tasks_planned integer,
  tasks_completed integer,
  adherence_pct numeric,
  training_load integer,
  recovery_load integer,
  last_readiness integer,
  risk_level text
)
language plpgsql
security definer
set search_path = public, vital, auth
as $$
declare
  v_requester uuid := auth.uid();
  v_allowed boolean := false;
  v_week_start date := coalesce(p_week_start, date_trunc('week', (now() at time zone 'utc'))::date);
begin
  if v_requester is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_squad_id is null then
    raise exception 'p_squad_id is required';
  end if;

  select (
    vital.is_vital_admin()
    or vital.is_service_role()
    or exists (
      select 1
      from vital.squads s
      where s.id = p_squad_id
        and s.owner_user_id = v_requester
    )
    or exists (
      select 1
      from vital.academy_staff_assignments asa
      where asa.squad_id = p_squad_id
        and asa.user_id = v_requester
        and asa.active
    )
  ) into v_allowed;

  if not coalesce(v_allowed, false) then
    raise exception 'access denied for squad overview';
  end if;

  return query
  with members as (
    select distinct sm.user_id
    from vital.squad_memberships sm
    where sm.squad_id = p_squad_id
      and sm.active
  ),
  week_tasks as (
    select
      ti.user_id,
      count(*)::int as tasks_planned,
      sum(case when ti.status = 'completed' then 1 else 0 end)::int as tasks_completed,
      sum(case when ti.module_key = 'training' and ti.status = 'completed' then 1 else 0 end)::int as training_load,
      sum(case when ti.module_key = 'recovery' and ti.status = 'completed' then 1 else 0 end)::int as recovery_load
    from vital.task_instances ti
    join members m on m.user_id = ti.user_id
    where ti.task_date between v_week_start and (v_week_start + 6)
    group by ti.user_id
  ),
  latest_readiness as (
    select distinct on (dri.user_id)
      dri.user_id,
      round((dri.sleep_score + (100 - dri.stress_score) + dri.energy_score) / 3.0)::int as readiness
    from vital.daily_readiness_inputs dri
    join members m on m.user_id = dri.user_id
    where dri.input_date between v_week_start and (v_week_start + 6)
    order by dri.user_id, dri.input_date desc
  )
  select
    m.user_id,
    coalesce(up.display_name, 'Sin nombre') as display_name,
    coalesce(wt.tasks_planned, 0)::int as tasks_planned,
    coalesce(wt.tasks_completed, 0)::int as tasks_completed,
    coalesce(round((100.0 * wt.tasks_completed::numeric) / nullif(wt.tasks_planned, 0), 2), 0)::numeric as adherence_pct,
    coalesce(wt.training_load, 0)::int as training_load,
    coalesce(wt.recovery_load, 0)::int as recovery_load,
    coalesce(lr.readiness, null)::int as last_readiness,
    coalesce(si.risk_level, 'low')::text as risk_level
  from members m
  left join vital.user_profiles up on up.user_id = m.user_id
  left join week_tasks wt on wt.user_id = m.user_id
  left join latest_readiness lr on lr.user_id = m.user_id
  left join vital.safety_intake si on si.user_id = m.user_id
  order by adherence_pct desc, training_load desc, m.user_id;
end
$$;

grant execute on function vital.list_football_presets() to authenticated, service_role;
grant execute on function vital.apply_football_preset(text) to authenticated, service_role;
grant execute on function vital.staff_weekly_squad_overview(uuid, date) to authenticated, service_role;

commit;
