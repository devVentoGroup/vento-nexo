begin;

create table if not exists vital.ai_plan_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'applied', 'rejected')),
  context_payload jsonb not null default '{}'::jsonb,
  proposal_payload jsonb not null default '{}'::jsonb,
  confidence_score numeric(5,2) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 100)),
  model_name text,
  prompt_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists ai_plan_proposals_user_created_idx
  on vital.ai_plan_proposals(user_id, created_at desc);

create table if not exists vital.ai_decision_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  reason_code text not null,
  reason_text text not null,
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'ai',
  model_name text,
  prompt_version text not null default 'v1',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists ai_decision_logs_user_occurred_idx
  on vital.ai_decision_logs(user_id, occurred_at desc);

create table if not exists vital.user_nutrition_profiles_v1 (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_payload jsonb not null default '{}'::jsonb,
  hydration_goal_l numeric(6,2) not null default 2.00 check (hydration_goal_l > 0 and hydration_goal_l <= 10),
  meals_per_day smallint not null default 3 check (meals_per_day between 1 and 8),
  calories_target integer check (calories_target is null or calories_target between 800 and 7000),
  protein_g_target integer check (protein_g_target is null or protein_g_target between 20 and 500),
  carbs_g_target integer check (carbs_g_target is null or carbs_g_target between 20 and 1000),
  fat_g_target integer check (fat_g_target is null or fat_g_target between 10 and 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vital.daily_nutrition_logs_v1 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_date date not null,
  meals_logged smallint not null default 0 check (meals_logged between 0 and 12),
  hydration_l numeric(6,2) not null default 0 check (hydration_l >= 0 and hydration_l <= 20),
  calories_consumed integer check (calories_consumed is null or calories_consumed between 0 and 12000),
  protein_g integer check (protein_g is null or protein_g between 0 and 800),
  carbs_g integer check (carbs_g is null or carbs_g between 0 and 2000),
  fat_g integer check (fat_g is null or fat_g between 0 and 800),
  adherence_score smallint not null default 0 check (adherence_score between 0 and 100),
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, input_date)
);

create index if not exists daily_nutrition_logs_v1_user_date_idx
  on vital.daily_nutrition_logs_v1(user_id, input_date desc);

create table if not exists vital.module_goal_weights_v1 (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  objective_key text not null,
  weight_pct smallint not null check (weight_pct between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, module_key, objective_key)
);

create index if not exists module_goal_weights_v1_user_module_idx
  on vital.module_goal_weights_v1(user_id, module_key);

drop trigger if exists trg_ai_plan_proposals_updated_at on vital.ai_plan_proposals;
create trigger trg_ai_plan_proposals_updated_at
before update on vital.ai_plan_proposals
for each row execute function vital.set_updated_at();

drop trigger if exists trg_user_nutrition_profiles_v1_updated_at on vital.user_nutrition_profiles_v1;
create trigger trg_user_nutrition_profiles_v1_updated_at
before update on vital.user_nutrition_profiles_v1
for each row execute function vital.set_updated_at();

drop trigger if exists trg_daily_nutrition_logs_v1_updated_at on vital.daily_nutrition_logs_v1;
create trigger trg_daily_nutrition_logs_v1_updated_at
before update on vital.daily_nutrition_logs_v1
for each row execute function vital.set_updated_at();

drop trigger if exists trg_module_goal_weights_v1_updated_at on vital.module_goal_weights_v1;
create trigger trg_module_goal_weights_v1_updated_at
before update on vital.module_goal_weights_v1
for each row execute function vital.set_updated_at();

alter table vital.ai_plan_proposals enable row level security;
alter table vital.ai_decision_logs enable row level security;
alter table vital.user_nutrition_profiles_v1 enable row level security;
alter table vital.daily_nutrition_logs_v1 enable row level security;
alter table vital.module_goal_weights_v1 enable row level security;

drop policy if exists ai_plan_proposals_select on vital.ai_plan_proposals;
create policy ai_plan_proposals_select on vital.ai_plan_proposals
  for select using (auth.uid() = user_id or vital.is_service_role());
drop policy if exists ai_plan_proposals_insert on vital.ai_plan_proposals;
create policy ai_plan_proposals_insert on vital.ai_plan_proposals
  for insert with check (auth.uid() = user_id or vital.is_service_role());
drop policy if exists ai_plan_proposals_update on vital.ai_plan_proposals;
create policy ai_plan_proposals_update on vital.ai_plan_proposals
  for update using (auth.uid() = user_id or vital.is_service_role())
  with check (auth.uid() = user_id or vital.is_service_role());
drop policy if exists ai_plan_proposals_delete on vital.ai_plan_proposals;
create policy ai_plan_proposals_delete on vital.ai_plan_proposals
  for delete using (auth.uid() = user_id or vital.is_service_role());

drop policy if exists ai_decision_logs_select on vital.ai_decision_logs;
create policy ai_decision_logs_select on vital.ai_decision_logs
  for select using (auth.uid() = user_id or vital.is_service_role());
drop policy if exists ai_decision_logs_insert on vital.ai_decision_logs;
create policy ai_decision_logs_insert on vital.ai_decision_logs
  for insert with check (auth.uid() = user_id or vital.is_service_role());

drop policy if exists user_nutrition_profiles_v1_select on vital.user_nutrition_profiles_v1;
create policy user_nutrition_profiles_v1_select on vital.user_nutrition_profiles_v1
  for select using (auth.uid() = user_id or vital.is_service_role());
drop policy if exists user_nutrition_profiles_v1_insert on vital.user_nutrition_profiles_v1;
create policy user_nutrition_profiles_v1_insert on vital.user_nutrition_profiles_v1
  for insert with check (auth.uid() = user_id or vital.is_service_role());
drop policy if exists user_nutrition_profiles_v1_update on vital.user_nutrition_profiles_v1;
create policy user_nutrition_profiles_v1_update on vital.user_nutrition_profiles_v1
  for update using (auth.uid() = user_id or vital.is_service_role())
  with check (auth.uid() = user_id or vital.is_service_role());
drop policy if exists user_nutrition_profiles_v1_delete on vital.user_nutrition_profiles_v1;
create policy user_nutrition_profiles_v1_delete on vital.user_nutrition_profiles_v1
  for delete using (auth.uid() = user_id or vital.is_service_role());

drop policy if exists daily_nutrition_logs_v1_select on vital.daily_nutrition_logs_v1;
create policy daily_nutrition_logs_v1_select on vital.daily_nutrition_logs_v1
  for select using (auth.uid() = user_id or vital.is_service_role());
drop policy if exists daily_nutrition_logs_v1_insert on vital.daily_nutrition_logs_v1;
create policy daily_nutrition_logs_v1_insert on vital.daily_nutrition_logs_v1
  for insert with check (auth.uid() = user_id or vital.is_service_role());
drop policy if exists daily_nutrition_logs_v1_update on vital.daily_nutrition_logs_v1;
create policy daily_nutrition_logs_v1_update on vital.daily_nutrition_logs_v1
  for update using (auth.uid() = user_id or vital.is_service_role())
  with check (auth.uid() = user_id or vital.is_service_role());
drop policy if exists daily_nutrition_logs_v1_delete on vital.daily_nutrition_logs_v1;
create policy daily_nutrition_logs_v1_delete on vital.daily_nutrition_logs_v1
  for delete using (auth.uid() = user_id or vital.is_service_role());

drop policy if exists module_goal_weights_v1_select on vital.module_goal_weights_v1;
create policy module_goal_weights_v1_select on vital.module_goal_weights_v1
  for select using (auth.uid() = user_id or vital.is_service_role());
drop policy if exists module_goal_weights_v1_insert on vital.module_goal_weights_v1;
create policy module_goal_weights_v1_insert on vital.module_goal_weights_v1
  for insert with check (auth.uid() = user_id or vital.is_service_role());
drop policy if exists module_goal_weights_v1_update on vital.module_goal_weights_v1;
create policy module_goal_weights_v1_update on vital.module_goal_weights_v1
  for update using (auth.uid() = user_id or vital.is_service_role())
  with check (auth.uid() = user_id or vital.is_service_role());
drop policy if exists module_goal_weights_v1_delete on vital.module_goal_weights_v1;
create policy module_goal_weights_v1_delete on vital.module_goal_weights_v1
  for delete using (auth.uid() = user_id or vital.is_service_role());

create or replace function vital.get_ai_context_bundle(
  p_target_date date default ((now() at time zone 'utc')::date)
)
returns jsonb
language plpgsql
security invoker
set search_path = public, vital, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_date date := coalesce(p_target_date, (now() at time zone 'utc')::date);
  v_week_start date;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  v_week_start := v_target_date - ((extract(isodow from v_target_date)::int) - 1);

  return jsonb_build_object(
    'target_date', v_target_date,
    'week_start', v_week_start,
    'modules', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'module_key', mp.module_key,
          'is_enabled', mp.is_enabled,
          'config', coalesce(mp.config, '{}'::jsonb)
        )
      )
      from vital.get_user_module_preferences() as mp(module_key, is_enabled, config)
    ), '[]'::jsonb),
    'sports_profile', coalesce((
      select to_jsonb(sp)
      from vital.get_sports_profile() as sp(
        sports,
        primary_sport,
        global_objectives,
        constraints,
        cycle_config,
        profile_version,
        updated_at
      )
    ), '{}'::jsonb),
    'safety_status', coalesce((
      select to_jsonb(ss)
      from vital.get_safety_status() as ss(risk_level, blocked_modules, requires_professional_check, updated_at)
    ), '{}'::jsonb),
    'cycle_adjustment', coalesce((
      select jsonb_agg(to_jsonb(ca))
      from vital.plan_cycle_adjustment(v_target_date) as ca(
        module_key,
        phase,
        volume_delta_pct,
        intensity_delta_pct,
        reason_code,
        reason_text
      )
    ), '[]'::jsonb),
    'weekly_plan', coalesce((
      select jsonb_agg(to_jsonb(wp))
      from vital.plan_weekly_fused_schedule(v_week_start, null) as wp(
        plan_date,
        module_key,
        task_type,
        title,
        estimated_minutes,
        blend_weight,
        conflict_penalty,
        priority_hint,
        interference_note
      )
    ), '[]'::jsonb),
    'nutrition_profile', coalesce((
      select to_jsonb(np)
      from vital.user_nutrition_profiles_v1 np
      where np.user_id = v_user_id
    ), '{}'::jsonb)
  );
end;
$$;

create or replace function vital.create_ai_plan_proposal_v1(
  p_context_payload jsonb,
  p_proposal_payload jsonb,
  p_confidence_score numeric default null,
  p_model_name text default null,
  p_prompt_version text default 'v1'
)
returns vital.ai_plan_proposals
language plpgsql
security invoker
set search_path = public, vital, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_row vital.ai_plan_proposals;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  insert into vital.ai_plan_proposals(
    user_id,
    status,
    context_payload,
    proposal_payload,
    confidence_score,
    model_name,
    prompt_version
  )
  values (
    v_user_id,
    'draft',
    coalesce(p_context_payload, '{}'::jsonb),
    coalesce(p_proposal_payload, '{}'::jsonb),
    p_confidence_score,
    nullif(trim(coalesce(p_model_name, '')), ''),
    coalesce(nullif(trim(coalesce(p_prompt_version, '')), ''), 'v1')
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function vital.upsert_nutrition_profile_v1(
  p_payload jsonb
)
returns vital.user_nutrition_profiles_v1
language plpgsql
security invoker
set search_path = public, vital, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_row vital.user_nutrition_profiles_v1;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  insert into vital.user_nutrition_profiles_v1(
    user_id,
    profile_payload,
    hydration_goal_l,
    meals_per_day,
    calories_target,
    protein_g_target,
    carbs_g_target,
    fat_g_target
  )
  values (
    v_user_id,
    v_payload,
    coalesce((v_payload ->> 'hydration_goal_l')::numeric, 2.0),
    coalesce((v_payload ->> 'meals_per_day')::smallint, 3),
    (v_payload ->> 'calories_target')::integer,
    (v_payload ->> 'protein_g_target')::integer,
    (v_payload ->> 'carbs_g_target')::integer,
    (v_payload ->> 'fat_g_target')::integer
  )
  on conflict (user_id) do update
  set
    profile_payload = excluded.profile_payload,
    hydration_goal_l = excluded.hydration_goal_l,
    meals_per_day = excluded.meals_per_day,
    calories_target = excluded.calories_target,
    protein_g_target = excluded.protein_g_target,
    carbs_g_target = excluded.carbs_g_target,
    fat_g_target = excluded.fat_g_target,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function vital.get_nutrition_profile_v1()
returns vital.user_nutrition_profiles_v1
language plpgsql
security invoker
set search_path = public, vital, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_row vital.user_nutrition_profiles_v1;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select *
    into v_row
  from vital.user_nutrition_profiles_v1
  where user_id = v_user_id;

  if v_row.user_id is null then
    insert into vital.user_nutrition_profiles_v1(user_id)
    values (v_user_id)
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

create or replace function vital.upsert_daily_nutrition_log_v1(
  p_input_date date,
  p_payload jsonb default '{}'::jsonb
)
returns vital.daily_nutrition_logs_v1
language plpgsql
security invoker
set search_path = public, vital, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_date date := coalesce(p_input_date, (now() at time zone 'utc')::date);
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_row vital.daily_nutrition_logs_v1;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  insert into vital.daily_nutrition_logs_v1(
    user_id,
    input_date,
    meals_logged,
    hydration_l,
    calories_consumed,
    protein_g,
    carbs_g,
    fat_g,
    adherence_score,
    payload,
    source
  )
  values (
    v_user_id,
    v_date,
    coalesce((v_payload ->> 'meals_logged')::smallint, 0),
    coalesce((v_payload ->> 'hydration_l')::numeric, 0),
    (v_payload ->> 'calories_consumed')::integer,
    (v_payload ->> 'protein_g')::integer,
    (v_payload ->> 'carbs_g')::integer,
    (v_payload ->> 'fat_g')::integer,
    coalesce((v_payload ->> 'adherence_score')::smallint, 0),
    v_payload,
    coalesce(nullif(trim(coalesce(v_payload ->> 'source', '')), ''), 'manual')
  )
  on conflict (user_id, input_date) do update
  set
    meals_logged = excluded.meals_logged,
    hydration_l = excluded.hydration_l,
    calories_consumed = excluded.calories_consumed,
    protein_g = excluded.protein_g,
    carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g,
    adherence_score = excluded.adherence_score,
    payload = excluded.payload,
    source = excluded.source,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function vital.list_daily_nutrition_logs_v1(
  p_from date default null,
  p_to date default null
)
returns setof vital.daily_nutrition_logs_v1
language sql
security invoker
set search_path = public, vital, auth
as $$
  select d.*
  from vital.daily_nutrition_logs_v1 d
  where d.user_id = auth.uid()
    and (p_from is null or d.input_date >= p_from)
    and (p_to is null or d.input_date <= p_to)
  order by d.input_date desc;
$$;

create or replace function vital.apply_ai_weekly_plan(
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, vital, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_items jsonb := coalesce(v_payload -> 'weekly_blocks', '[]'::jsonb);
  v_program_version_id uuid;
  v_item jsonb;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_module_key text;
  v_task_type text;
  v_title text;
  v_days jsonb;
  v_minutes smallint;
  v_payload_item jsonb;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if jsonb_typeof(v_items) <> 'array' then
    raise exception 'weekly_blocks must be a json array';
  end if;

  select pv.id
    into v_program_version_id
  from vital.program_versions pv
  where pv.user_id = v_user_id
    and pv.is_active
  order by pv.created_at desc
  limit 1;

  if v_program_version_id is null then
    raise exception 'No active program_version found for this user';
  end if;

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_module_key := coalesce(nullif(trim(coalesce(v_item ->> 'module_key', '')), ''), 'training');
    v_task_type := coalesce(
      nullif(trim(coalesce(v_item ->> 'task_type', '')), ''),
      case
        when v_module_key = 'nutrition' then 'nutrition'
        when v_module_key = 'recovery' then 'recovery'
        when v_module_key = 'habits' then 'metrics'
        else 'workout'
      end
    );
    v_title := nullif(trim(coalesce(v_item ->> 'title', '')), '');
    v_days := coalesce(v_item -> 'days', '[1,2,3,4,5,6,7]'::jsonb);
    v_minutes := coalesce((v_item ->> 'estimated_minutes')::smallint, 20);
    v_payload_item := coalesce(v_item -> 'payload', '{}'::jsonb);

    if v_title is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into vital.task_templates(
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
    values (
      v_user_id,
      v_program_version_id,
      v_module_key,
      v_task_type,
      v_title,
      jsonb_build_object('days', v_days),
      coalesce((v_item ->> 'ordering')::smallint, 100),
      v_minutes,
      v_payload_item || jsonb_build_object(
        'source', 'ai_weekly_plan_v1',
        'applied_at', now()
      ),
      true
    );

    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object(
    'inserted_templates', v_inserted,
    'skipped_templates', v_skipped
  );
end;
$$;

create or replace function vital.log_ai_decision_event(
  p_event_name text,
  p_reason_code text,
  p_reason_text text,
  p_payload jsonb default '{}'::jsonb,
  p_source text default 'ai',
  p_model_name text default null,
  p_prompt_version text default 'v1',
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security invoker
set search_path = public, vital, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  insert into vital.ai_decision_logs(
    user_id,
    event_name,
    reason_code,
    reason_text,
    payload,
    source,
    model_name,
    prompt_version,
    occurred_at
  )
  values (
    v_user_id,
    coalesce(nullif(trim(coalesce(p_event_name, '')), ''), 'ai_event'),
    coalesce(nullif(trim(coalesce(p_reason_code, '')), ''), 'none'),
    coalesce(nullif(trim(coalesce(p_reason_text, '')), ''), 'no_reason'),
    coalesce(p_payload, '{}'::jsonb),
    coalesce(nullif(trim(coalesce(p_source, '')), ''), 'ai'),
    nullif(trim(coalesce(p_model_name, '')), ''),
    coalesce(nullif(trim(coalesce(p_prompt_version, '')), ''), 'v1'),
    coalesce(p_occurred_at, now())
  )
  returning id into v_id;

  perform vital.track_decision_event(
    coalesce(nullif(trim(coalesce(p_event_name, '')), ''), 'ai_event'),
    coalesce(nullif(trim(coalesce(p_reason_code, '')), ''), 'none'),
    coalesce(nullif(trim(coalesce(p_reason_text, '')), ''), 'no_reason'),
    coalesce(p_payload, '{}'::jsonb),
    coalesce(nullif(trim(coalesce(p_source, '')), ''), 'ai'),
    coalesce(p_occurred_at, now()),
    'v1'
  );

  return v_id;
end;
$$;

grant execute on function vital.get_ai_context_bundle(date) to authenticated, service_role;
grant execute on function vital.create_ai_plan_proposal_v1(jsonb, jsonb, numeric, text, text) to authenticated, service_role;
grant execute on function vital.apply_ai_weekly_plan(jsonb) to authenticated, service_role;
grant execute on function vital.log_ai_decision_event(text, text, text, jsonb, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function vital.get_nutrition_profile_v1() to authenticated, service_role;
grant execute on function vital.upsert_nutrition_profile_v1(jsonb) to authenticated, service_role;
grant execute on function vital.upsert_daily_nutrition_log_v1(date, jsonb) to authenticated, service_role;
grant execute on function vital.list_daily_nutrition_logs_v1(date, date) to authenticated, service_role;

commit;

