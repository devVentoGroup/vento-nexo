begin;

create table if not exists vital.user_cycle_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cycle_start_date date not null default current_date,
  cycle_length_weeks smallint not null default 4,
  current_week smallint not null default 1,
  dominant_focus text not null default 'sport_performance',
  phase text not null default 'build' check (phase in ('build', 'maintain', 'deload')),
  last_readiness smallint,
  last_adherence smallint,
  last_interference_penalty smallint,
  updated_at timestamptz not null default now()
);

alter table vital.user_cycle_states enable row level security;

drop policy if exists user_cycle_states_select on vital.user_cycle_states;
create policy user_cycle_states_select
  on vital.user_cycle_states
  for select
  using (auth.uid() = user_id or vital.is_vital_admin() or vital.is_service_role());

drop policy if exists user_cycle_states_insert on vital.user_cycle_states;
create policy user_cycle_states_insert
  on vital.user_cycle_states
  for insert
  with check (auth.uid() = user_id or vital.is_vital_admin() or vital.is_service_role());

drop policy if exists user_cycle_states_update on vital.user_cycle_states;
create policy user_cycle_states_update
  on vital.user_cycle_states
  for update
  using (auth.uid() = user_id or vital.is_vital_admin() or vital.is_service_role())
  with check (auth.uid() = user_id or vital.is_vital_admin() or vital.is_service_role());

drop policy if exists user_cycle_states_delete on vital.user_cycle_states;
create policy user_cycle_states_delete
  on vital.user_cycle_states
  for delete
  using (auth.uid() = user_id or vital.is_vital_admin() or vital.is_service_role());

create or replace function vital.get_or_create_cycle_state()
returns vital.user_cycle_states
language plpgsql
security invoker
set search_path = public, vital, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_row vital.user_cycle_states;
  v_cycle_weeks smallint := 4;
  v_focus text := 'sport_performance';
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select
    greatest(2, least(8, coalesce((sp.cycle_config ->> 'cycle_weeks')::smallint, 4))),
    coalesce(nullif(sp.cycle_config ->> 'dominant_focus', ''), 'sport_performance')
    into v_cycle_weeks, v_focus
  from vital.get_sports_profile() as sp(
    sports,
    primary_sport,
    global_objectives,
    constraints,
    cycle_config,
    profile_version,
    updated_at
  );

  insert into vital.user_cycle_states (user_id, cycle_start_date, cycle_length_weeks, current_week, dominant_focus, phase)
  values (v_user_id, current_date, v_cycle_weeks, 1, v_focus, 'build')
  on conflict (user_id) do nothing;

  select * into v_row
  from vital.user_cycle_states ucs
  where ucs.user_id = v_user_id;

  return v_row;
end
$$;

create or replace function vital.plan_cycle_adjustment(
  p_target_date date default (now() at time zone 'utc')::date
)
returns table (
  module_key text,
  intensity_delta_pct integer,
  volume_delta_pct integer,
  frequency_delta integer,
  phase text,
  reason_code text,
  reason_text text
)
language plpgsql
security invoker
set search_path = public, vital, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_state vital.user_cycle_states;
  v_adherence integer := 60;
  v_readiness integer := 60;
  v_interference integer := 0;
  v_phase text := 'build';
  v_weeks_elapsed integer := 1;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  v_state := vital.get_or_create_cycle_state();

  select coalesce(
    round(
      100.0
      * sum(case when ti.status = 'completed' then 1 else 0 end)::numeric
      / nullif(count(*), 0)
    )::integer,
    60
  )
  into v_adherence
  from vital.task_instances ti
  where ti.user_id = v_user_id
    and ti.task_date between (p_target_date - 6) and p_target_date;

  select coalesce(
    round((dri.sleep_score::numeric + (100 - dri.stress_score)::numeric + dri.energy_score::numeric) / 3)::integer,
    60
  )
  into v_readiness
  from vital.daily_readiness_inputs dri
  where dri.user_id = v_user_id
    and dri.input_date = p_target_date;

  select coalesce(sum(mir.next_day_penalty), 0)::integer
  into v_interference
  from vital.task_instances ti
  join vital.module_interference_rules mir
    on mir.secondary_module_key = ti.module_key
  where ti.user_id = v_user_id
    and ti.task_date = p_target_date - 1
    and ti.status <> 'skipped';

  v_weeks_elapsed := greatest(1, ((p_target_date - v_state.cycle_start_date) / 7) + 1);

  if v_readiness < 45 or v_interference >= 10 then
    v_phase := 'deload';
  elsif v_adherence < 50 then
    v_phase := 'maintain';
  elsif (v_weeks_elapsed % greatest(2, v_state.cycle_length_weeks)) = 0 then
    v_phase := 'deload';
  else
    v_phase := 'build';
  end if;

  update vital.user_cycle_states
  set
    current_week = least(v_state.cycle_length_weeks, greatest(1, v_weeks_elapsed::smallint)),
    phase = v_phase,
    last_readiness = v_readiness,
    last_adherence = v_adherence,
    last_interference_penalty = v_interference,
    updated_at = now()
  where user_id = v_user_id;

  return query
  with enabled_modules as (
    select ump.module_key
    from vital.get_user_module_preferences() as ump(module_key, is_enabled, config)
    where ump.is_enabled
  )
  select
    em.module_key,
    case
      when v_phase = 'deload' and em.module_key = 'training' then -25
      when v_phase = 'deload' and em.module_key = 'recovery' then -5
      when v_phase = 'build' and em.module_key = 'training' then 10
      when v_phase = 'build' and em.module_key = 'recovery' then 5
      when v_phase = 'maintain' and em.module_key = 'training' then 0
      else 0
    end::integer as intensity_delta_pct,
    case
      when v_phase = 'deload' and em.module_key = 'training' then -30
      when v_phase = 'deload' and em.module_key = 'recovery' then -10
      when v_phase = 'build' and em.module_key = 'training' then 8
      when v_phase = 'build' and em.module_key = 'nutrition' then 5
      when v_phase = 'maintain' then 0
      else 0
    end::integer as volume_delta_pct,
    case
      when v_phase = 'deload' and em.module_key = 'training' then -1
      when v_phase = 'build' and em.module_key = 'training' then 1
      else 0
    end::integer as frequency_delta,
    v_phase,
    case
      when v_phase = 'deload' and v_interference >= 10 then 'deload_interference_guard'
      when v_phase = 'deload' and v_readiness < 45 then 'deload_low_readiness'
      when v_phase = 'deload' then 'deload_cycle_boundary'
      when v_phase = 'maintain' then 'maintain_low_adherence'
      else 'build_progression'
    end as reason_code,
    case
      when v_phase = 'deload' and v_interference >= 10 then 'Se aplica deload por interferencia alta acumulada del dia anterior.'
      when v_phase = 'deload' and v_readiness < 45 then 'Se aplica deload por readiness bajo para proteger recuperacion.'
      when v_phase = 'deload' then 'Semana de deload por limite de microciclo.'
      when v_phase = 'maintain' then 'Se mantiene carga por adherencia baja hasta estabilizar consistencia.'
      else 'Fase de progresion activa: incremento moderado de carga.'
    end as reason_text
  from enabled_modules em
  order by
    case em.module_key
      when 'training' then 1
      when 'recovery' then 2
      when 'nutrition' then 3
      when 'habits' then 4
      else 9
    end;
end
$$;

grant execute on function vital.get_or_create_cycle_state() to authenticated, service_role;
grant execute on function vital.plan_cycle_adjustment(date) to authenticated, service_role;

commit;
