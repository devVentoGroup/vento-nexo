begin;

create table if not exists vital.sport_module_template_catalog (
  id uuid primary key default gen_random_uuid(),
  module_key text not null references vital.module_catalog(key) on delete cascade,
  sport_key text not null,
  objective_key text not null default 'any',
  level_key text not null default 'all',
  task_type text not null check (task_type in ('workout', 'cardio', 'nutrition', 'supplement', 'sleep', 'metrics', 'recovery')),
  title text not null,
  days_of_week smallint[] not null default '{1,2,3,4,5,6,7}'::smallint[],
  ordering smallint not null default 1,
  estimated_minutes smallint,
  payload jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  version smallint not null default 1,
  created_at timestamptz not null default now(),
  constraint sport_module_template_catalog_days_check check (array_length(days_of_week, 1) >= 1 and days_of_week <@ array[1,2,3,4,5,6,7]::smallint[])
);

create unique index if not exists sport_module_template_catalog_unique_idx
  on vital.sport_module_template_catalog (module_key, sport_key, objective_key, level_key, title);

alter table vital.sport_module_template_catalog enable row level security;

drop policy if exists sport_module_template_catalog_read_authenticated on vital.sport_module_template_catalog;
create policy sport_module_template_catalog_read_authenticated
  on vital.sport_module_template_catalog
  for select
  using (auth.uid() is not null);

drop policy if exists sport_module_template_catalog_manage_admin on vital.sport_module_template_catalog;
create policy sport_module_template_catalog_manage_admin
  on vital.sport_module_template_catalog
  for all
  using (vital.is_vital_admin() or vital.is_service_role())
  with check (vital.is_vital_admin() or vital.is_service_role());

insert into vital.sport_module_template_catalog (
  module_key, sport_key, objective_key, level_key, task_type, title, days_of_week, ordering, estimated_minutes, payload
)
values
  ('training', 'football', 'performance', 'beginner', 'workout', 'Tecnica de control y pase', '{1,3,5}', 1, 45, '{"focus":"ball_control","intensity":"moderate"}'::jsonb),
  ('training', 'football', 'performance', 'intermediate', 'workout', 'Potencia y cambios de direccion', '{1,3,5}', 1, 55, '{"focus":"agility_power","intensity":"medium_high"}'::jsonb),
  ('recovery', 'football', 'performance', 'all', 'recovery', 'Movilidad de cadera y tobillo', '{2,4,6}', 1, 18, '{"focus":"mobility_lower_body"}'::jsonb),
  ('nutrition', 'football', 'performance', 'all', 'nutrition', 'Carga de carbohidratos pre-entreno', '{1,2,3,4,5,6,7}', 1, 8, '{"focus":"carb_timing"}'::jsonb),
  ('habits', 'football', 'performance', 'all', 'metrics', 'Checklist de activacion pre-sesion', '{1,2,3,4,5,6,7}', 1, 4, '{"focus":"readiness"}'::jsonb),

  ('training', 'volleyball', 'performance', 'beginner', 'workout', 'Tecnica de salto y aterrizaje', '{1,3,5}', 1, 45, '{"focus":"jump_mechanics"}'::jsonb),
  ('training', 'volleyball', 'performance', 'intermediate', 'workout', 'Potencia de salto y hombro', '{1,3,5}', 1, 55, '{"focus":"jump_and_shoulder_power"}'::jsonb),
  ('recovery', 'volleyball', 'performance', 'all', 'recovery', 'Recuperacion de hombro y gemelos', '{2,4,6}', 1, 16, '{"focus":"shoulder_calf_recovery"}'::jsonb),
  ('nutrition', 'volleyball', 'performance', 'all', 'nutrition', 'Proteina y recuperacion post-juego', '{1,2,3,4,5,6,7}', 1, 8, '{"focus":"protein_recovery"}'::jsonb),
  ('habits', 'volleyball', 'performance', 'all', 'metrics', 'Registro de carga de salto', '{1,2,3,4,5,6,7}', 1, 4, '{"focus":"jump_load_tracking"}'::jsonb),

  ('training', 'gym', 'strength', 'beginner', 'workout', 'Fuerza base full body', '{1,3,5}', 1, 50, '{"focus":"compound_strength"}'::jsonb),
  ('training', 'gym', 'strength', 'intermediate', 'workout', 'Fuerza y progresion de cargas', '{1,3,5}', 1, 60, '{"focus":"progressive_overload"}'::jsonb),
  ('recovery', 'gym', 'strength', 'all', 'recovery', 'Descarga miofascial post-fuerza', '{2,4,6}', 1, 15, '{"focus":"myofascial_release"}'::jsonb),
  ('nutrition', 'gym', 'strength', 'all', 'nutrition', 'Distribucion proteica diaria', '{1,2,3,4,5,6,7}', 1, 8, '{"focus":"protein_distribution"}'::jsonb),
  ('habits', 'gym', 'strength', 'all', 'metrics', 'Control de progreso de cargas', '{1,2,3,4,5,6,7}', 1, 4, '{"focus":"load_progress_tracking"}'::jsonb),

  ('recovery', 'generic', 'any', 'all', 'recovery', 'Respiracion y relajacion guiada', '{2,4,6}', 9, 10, '{"focus":"nervous_system_reset"}'::jsonb),
  ('nutrition', 'generic', 'any', 'all', 'nutrition', 'Checklist nutricional del dia', '{1,2,3,4,5,6,7}', 9, 6, '{"focus":"consistency"}'::jsonb),
  ('habits', 'generic', 'any', 'all', 'metrics', 'Check-in de energia y estres', '{1,2,3,4,5,6,7}', 9, 3, '{"focus":"self_report"}'::jsonb)
on conflict (module_key, sport_key, objective_key, level_key, title) do nothing;

create or replace function vital.apply_sport_templates_from_profile(
  p_objective text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, vital, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_sports jsonb := '[]'::jsonb;
  v_primary_sport text := 'generic';
  v_global_objectives jsonb := '[]'::jsonb;
  v_selected_objective text := coalesce(nullif(trim(p_objective), ''), 'any');
  v_level text := 'all';
  v_module text;
  v_program_id uuid;
  v_program_version_id uuid;
  v_inserted integer := 0;
  v_total_inserted integer := 0;
  v_modules_used jsonb := '[]'::jsonb;
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

  v_primary_sport := coalesce(nullif(v_primary_sport, ''), 'generic');

  select coalesce(elem ->> 'level', 'all')
    into v_level
  from jsonb_array_elements(coalesce(v_sports, '[]'::jsonb)) as elem
  where elem ->> 'key' = v_primary_sport
  order by case coalesce(elem ->> 'priority', 'Z') when 'A' then 1 when 'B' then 2 when 'C' then 3 else 9 end
  limit 1;

  v_level := coalesce(nullif(v_level, ''), 'all');

  if v_selected_objective = 'any' and exists (
    select 1 from jsonb_array_elements_text(coalesce(v_global_objectives, '[]'::jsonb)) as go where go = 'performance'
  ) then
    v_selected_objective := 'performance';
  elsif v_selected_objective = 'any' and exists (
    select 1 from jsonb_array_elements_text(coalesce(v_global_objectives, '[]'::jsonb)) as go where go = 'strength'
  ) then
    v_selected_objective := 'strength';
  end if;

  for v_module in
    select ump.module_key
    from vital.get_user_module_preferences() as ump(module_key, is_enabled, config)
    where ump.is_enabled
  loop
    if v_module in ('nutrition', 'habits', 'recovery') then
      select p.id, pv.id
        into v_program_id, v_program_version_id
      from vital.programs p
      join vital.program_versions pv
        on pv.program_id = p.id
       and pv.user_id = p.user_id
       and pv.is_active
      where p.user_id = v_user_id
        and p.is_active
        and p.objective = format('%s_core', v_module)
      order by pv.created_at desc
      limit 1;
    else
      select p.id, pv.id
        into v_program_id, v_program_version_id
      from vital.programs p
      join vital.program_versions pv
        on pv.program_id = p.id
       and pv.user_id = p.user_id
       and pv.is_active
      where p.user_id = v_user_id
        and p.is_active
        and p.objective not like '%_core'
      order by pv.created_at desc
      limit 1;
    end if;

    if v_program_version_id is null then
      continue;
    end if;

    insert into vital.task_templates (
      user_id,
      program_version_id,
      module_key,
      task_type,
      title,
      recurrence_rule,
      ordering,
      estimated_minutes,
      payload,
      is_active
    )
    select
      v_user_id,
      v_program_version_id,
      smtc.module_key,
      smtc.task_type,
      smtc.title,
      jsonb_build_object('type', 'weekly', 'days', to_jsonb(smtc.days_of_week)),
      (100 + smtc.ordering)::smallint,
      smtc.estimated_minutes,
      jsonb_build_object(
        'source', 'sport_template_catalog_v1',
        'sport_key', smtc.sport_key,
        'objective_key', smtc.objective_key,
        'level_key', smtc.level_key
      ) || coalesce(smtc.payload, '{}'::jsonb),
      true
    from vital.sport_module_template_catalog smtc
    where smtc.is_active
      and smtc.module_key = v_module
      and smtc.sport_key in (v_primary_sport, 'generic')
      and smtc.objective_key in (v_selected_objective, 'any')
      and smtc.level_key in (v_level, 'all')
      and not exists (
        select 1
        from vital.task_templates tt
        where tt.user_id = v_user_id
          and tt.program_version_id = v_program_version_id
          and tt.module_key = smtc.module_key
          and tt.title = smtc.title
      );

    get diagnostics v_inserted = row_count;
    if coalesce(v_inserted, 0) > 0 then
      v_total_inserted := v_total_inserted + v_inserted;
      v_modules_used := v_modules_used || to_jsonb(v_module);
    end if;
  end loop;

  return jsonb_build_object(
    'primary_sport', v_primary_sport,
    'objective_key', v_selected_objective,
    'level_key', v_level,
    'templates_inserted', v_total_inserted,
    'modules_touched', v_modules_used
  );
end
$$;

grant execute on function vital.apply_sport_templates_from_profile(text) to authenticated, service_role;

commit;

