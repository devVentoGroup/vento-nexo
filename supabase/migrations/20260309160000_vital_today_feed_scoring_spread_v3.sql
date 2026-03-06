begin;

create or replace function vital.compute_hoy_scores(
  p_target_date date default (now() at time zone 'utc')::date
)
returns table (
  task_instance_id uuid,
  module_key text,
  priority_score integer,
  reason_code text,
  reason_text text,
  safety_state text
)
language plpgsql
security invoker
set search_path = public, vital, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_blocked_modules jsonb := '[]'::jsonb;
  v_risk_level text := 'low';
  v_adherence integer := 60;
  v_readiness integer := 60;
  v_risk_penalty integer := 0;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  perform 1 from vital.today_tasks(p_target_date);

  select s.blocked_modules, s.risk_level
    into v_blocked_modules, v_risk_level
  from vital.get_safety_status() s;

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
    round(
      (
        dri.sleep_score::numeric
        + (100 - dri.stress_score)::numeric
        + dri.energy_score::numeric
      ) / 3
    )::integer,
    60
  )
  into v_readiness
  from vital.daily_readiness_inputs dri
  where dri.user_id = v_user_id
    and dri.input_date = p_target_date;

  if v_risk_level = 'critical' then
    v_risk_penalty := 100;
  elsif v_risk_level = 'high' then
    v_risk_penalty := 60;
  elsif v_risk_level = 'medium' then
    v_risk_penalty := 30;
  else
    v_risk_penalty := 0;
  end if;

  return query
  with enabled_modules as (
    select ump.module_key
    from vital.get_user_module_preferences() as ump(module_key, is_enabled, config)
    where ump.is_enabled
  ),
  sport_ctx as (
    select
      coalesce(sp.primary_sport, '') as primary_sport,
      coalesce(sp.global_objectives, '[]'::jsonb) as global_objectives
    from vital.get_sports_profile() as sp(
      sports,
      primary_sport,
      global_objectives,
      constraints,
      cycle_config,
      profile_version,
      updated_at
    )
  ),
  base as (
    select
      ti.id as task_instance_id,
      ti.module_key,
      ti.status,
      coalesce(ti.priority, 50)::integer as task_priority,
      coalesce(tt.ordering, 1)::integer as task_ordering,
      case
        when exists (
          select 1
          from jsonb_array_elements_text(v_blocked_modules) b
          where b = ti.module_key
        ) then 'blocked'
        else 'ok'
      end as safety_state,
      case
        when ti.module_key = 'recovery' then 78
        when ti.module_key = 'training' then 72
        when ti.module_key = 'nutrition' then 66
        else 62
      end as objective_urgency
    from vital.task_instances ti
    join vital.task_templates tt
      on tt.id = ti.task_template_id
     and tt.user_id = ti.user_id
    join enabled_modules em
      on em.module_key = ti.module_key
    where ti.user_id = v_user_id
      and ti.task_date = p_target_date
  ),
  scored as (
    select
      b.*,
      (
        case
          when sc.primary_sport in ('football', 'volleyball', 'taekwondo', 'basketball', 'padel') then
            case
              when b.module_key = 'training' then 8
              when b.module_key = 'recovery' then 7
              when b.module_key = 'nutrition' then 4
              when b.module_key = 'habits' then 3
              else 0
            end
          when sc.primary_sport in ('cycling', 'swimming') then
            case
              when b.module_key = 'training' then 7
              when b.module_key = 'recovery' then 8
              when b.module_key = 'nutrition' then 4
              when b.module_key = 'habits' then 3
              else 0
            end
          when sc.primary_sport = 'gym' then
            case
              when b.module_key = 'training' then 8
              when b.module_key = 'nutrition' then 5
              when b.module_key = 'recovery' then 4
              when b.module_key = 'habits' then 2
              else 0
            end
          else 0
        end
        + case
            when exists (
              select 1
              from jsonb_array_elements_text(sc.global_objectives) go
              where go = 'performance'
            ) and b.module_key in ('training', 'recovery') then 2
            else 0
          end
        + case
            when exists (
              select 1
              from jsonb_array_elements_text(sc.global_objectives) go
              where go = 'aesthetics'
            ) and b.module_key in ('training', 'nutrition') then 2
            else 0
          end
        + case
            when exists (
              select 1
              from jsonb_array_elements_text(sc.global_objectives) go
              where go = 'health'
            ) and b.module_key in ('habits', 'recovery') then 2
            else 0
          end
      )::integer as sports_bonus,
      case
        when b.module_key = 'training' then 4
        when b.module_key = 'recovery' then 2
        when b.module_key = 'nutrition' then 0
        when b.module_key = 'habits' then -3
        else 0
      end as module_bias,
      greatest(0, 6 - coalesce(b.task_ordering, 6))::integer as ordering_boost
    from base b
    cross join sport_ctx sc
  )
  select
    s.task_instance_id,
    s.module_key,
    case
      when s.safety_state = 'blocked' then 0
      else greatest(
        5,
        least(
          92,
          round(
            (
              0.18 * v_adherence
              + 0.18 * v_readiness
              + 0.14 * (100 - v_risk_penalty)
              + 0.16 * s.objective_urgency
              + 0.10 * s.task_priority
            )
            + least(10, s.sports_bonus)
            + s.module_bias
            + (0.8 * s.ordering_boost)
          )::integer
        )
      )
    end as priority_score,
    case
      when s.safety_state = 'blocked' then 'safety_blocked'
      when v_readiness < 45 then 'low_readiness'
      when v_adherence < 50 and s.sports_bonus >= 6 then 'low_adherence_sport_focus'
      when v_adherence < 50 then 'low_adherence'
      when s.sports_bonus >= 6 then 'sport_focus_priority'
      else 'balanced_priority'
    end as reason_code,
    case
      when s.safety_state = 'blocked' then 'Bloqueado por safety gate activo para este modulo.'
      when v_readiness < 45 then 'Prioridad ajustada por readiness bajo del dia.'
      when v_adherence < 50 and s.sports_bonus >= 6 then 'Adherencia baja: se prioriza una accion alineada con tu deporte principal para retomar ritmo.'
      when v_adherence < 50 then 'Prioridad ajustada para recuperar adherencia semanal.'
      when s.sports_bonus >= 6 then 'Prioridad reforzada por alineacion con deporte principal y objetivos globales.'
      else 'Prioridad balanceada por adherencia, readiness, riesgo y urgencia.'
    end as reason_text,
    s.safety_state
  from scored s
  order by priority_score desc, s.task_instance_id;
end
$$;

commit;
