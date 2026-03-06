begin;

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
  v_sports jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select sp.sports, sp.primary_sport, sp.global_objectives
    into v_sports, v_primary_sport, v_global_objectives
  from vital.get_sports_profile() as sp(
    sports,
    primary_sport,
    global_objectives,
    constraints,
    cycle_config,
    profile_version,
    updated_at
  );

  v_sports := coalesce(v_sports, '[]'::jsonb);
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
      coalesce(tt.recurrence_rule, '{}'::jsonb) as recurrence_rule,
      coalesce(tt.payload, '{}'::jsonb) as payload
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
      bt.ordering,
      bt.payload,
      coalesce(nullif(bt.payload ->> 'sport_key', ''), 'generic') as template_sport_key
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
      coalesce(sobr.weight_pct, sobr_any.weight_pct, 20)::smallint as base_blend_weight,
      coalesce(sobr.max_sessions_per_week, sobr_any.max_sessions_per_week, 7)::smallint as max_sessions_per_week,
      coalesce((
        select case upper(coalesce(sport_item ->> 'priority', 'C'))
          when 'A' then 1.00
          when 'B' then 0.85
          when 'C' then 0.70
          else 0.65
        end
        from jsonb_array_elements(v_sports) as sport_item
        where sport_item ->> 'key' = e.template_sport_key
        limit 1
      ), case when e.template_sport_key = 'generic' then 0.80 else 0.55 end)::numeric as sport_priority_multiplier
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
      greatest(8, least(95, round(wb.base_blend_weight::numeric * wb.sport_priority_multiplier)))::smallint as blend_weight,
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
