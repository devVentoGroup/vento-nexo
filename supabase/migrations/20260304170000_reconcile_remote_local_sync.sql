begin;

-- Reconciliation migration for objects that are not present in remote schema
-- while historical migrations were executed manually outside Supabase history.

create table if not exists public.inventory_form_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  form_key text not null,
  entity_id text,
  site_id uuid references public.sites(id) on delete set null,
  step_id text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  entity_scope text generated always as (coalesce(entity_id, '')) stored,
  site_scope uuid generated always as (
    coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) stored
);

create unique index if not exists ux_inventory_form_drafts_scope
  on public.inventory_form_drafts (user_id, form_key, entity_scope, site_scope);

create index if not exists idx_inventory_form_drafts_user_form_updated
  on public.inventory_form_drafts (user_id, form_key, updated_at desc);

create index if not exists idx_inventory_form_drafts_expires_at
  on public.inventory_form_drafts (expires_at);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_inventory_form_drafts_updated_at'
  ) then
    create trigger trg_inventory_form_drafts_updated_at
      before update on public.inventory_form_drafts
      for each row execute function public.update_updated_at();
  end if;
end
$$;

alter table public.inventory_form_drafts enable row level security;

drop policy if exists inventory_form_drafts_select_own on public.inventory_form_drafts;
drop policy if exists inventory_form_drafts_insert_own on public.inventory_form_drafts;
drop policy if exists inventory_form_drafts_update_own on public.inventory_form_drafts;
drop policy if exists inventory_form_drafts_delete_own on public.inventory_form_drafts;

create policy inventory_form_drafts_select_own
  on public.inventory_form_drafts
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy inventory_form_drafts_insert_own
  on public.inventory_form_drafts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy inventory_form_drafts_update_own
  on public.inventory_form_drafts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy inventory_form_drafts_delete_own
  on public.inventory_form_drafts
  for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists vital.sports_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sports jsonb not null default '[]'::jsonb,
  primary_sport text,
  global_objectives jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '{}'::jsonb,
  cycle_config jsonb not null default '{"dominant_focus":"balanced","cycle_weeks":4}'::jsonb,
  profile_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_sports_profiles_updated_at on vital.sports_profiles;
create trigger trg_sports_profiles_updated_at
before update on vital.sports_profiles
for each row execute function vital.set_updated_at();

alter table vital.sports_profiles enable row level security;
drop policy if exists sports_profiles_select on vital.sports_profiles;
create policy sports_profiles_select
  on vital.sports_profiles
  for select
  using (auth.uid() = user_id or vital.is_service_role());
drop policy if exists sports_profiles_insert on vital.sports_profiles;
create policy sports_profiles_insert
  on vital.sports_profiles
  for insert
  with check (auth.uid() = user_id or vital.is_service_role());
drop policy if exists sports_profiles_update on vital.sports_profiles;
create policy sports_profiles_update
  on vital.sports_profiles
  for update
  using (auth.uid() = user_id or vital.is_service_role())
  with check (auth.uid() = user_id or vital.is_service_role());
drop policy if exists sports_profiles_delete on vital.sports_profiles;
create policy sports_profiles_delete
  on vital.sports_profiles
  for delete
  using (auth.uid() = user_id or vital.is_service_role());

create or replace function vital.get_sports_profile()
returns table (
  sports jsonb,
  primary_sport text,
  global_objectives jsonb,
  constraints jsonb,
  cycle_config jsonb,
  profile_version integer,
  updated_at timestamptz
)
language sql
security invoker
set search_path = public, vital, auth
as $$
  with default_row as (
    select
      '[]'::jsonb as sports,
      null::text as primary_sport,
      '[]'::jsonb as global_objectives,
      '{}'::jsonb as constraints,
      '{"dominant_focus":"balanced","cycle_weeks":4}'::jsonb as cycle_config,
      1::integer as profile_version,
      now() as updated_at
  )
  select
    coalesce(sp.sports, d.sports) as sports,
    coalesce(sp.primary_sport, d.primary_sport) as primary_sport,
    coalesce(sp.global_objectives, d.global_objectives) as global_objectives,
    coalesce(sp.constraints, d.constraints) as constraints,
    coalesce(sp.cycle_config, d.cycle_config) as cycle_config,
    coalesce(sp.profile_version, d.profile_version) as profile_version,
    coalesce(sp.updated_at, d.updated_at) as updated_at
  from default_row d
  left join vital.sports_profiles sp
    on sp.user_id = auth.uid();
$$;

create or replace function vital.upsert_sports_profile(
  p_payload jsonb
)
returns table (
  sports jsonb,
  primary_sport text,
  global_objectives jsonb,
  constraints jsonb,
  cycle_config jsonb,
  profile_version integer,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = public, vital, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_sports jsonb := coalesce(v_payload -> 'sports', '[]'::jsonb);
  v_primary_sport text := nullif(trim(v_payload ->> 'primary_sport'), '');
  v_global_objectives jsonb := coalesce(v_payload -> 'global_objectives', '[]'::jsonb);
  v_constraints jsonb := coalesce(v_payload -> 'constraints', '{}'::jsonb);
  v_cycle_config jsonb := coalesce(v_payload -> 'cycle_config', '{"dominant_focus":"balanced","cycle_weeks":4}'::jsonb);
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;
  if jsonb_typeof(v_sports) <> 'array' then
    raise exception 'sports must be a json array';
  end if;
  if jsonb_typeof(v_global_objectives) <> 'array' then
    raise exception 'global_objectives must be a json array';
  end if;
  if jsonb_typeof(v_constraints) <> 'object' then
    raise exception 'constraints must be a json object';
  end if;
  if jsonb_typeof(v_cycle_config) <> 'object' then
    raise exception 'cycle_config must be a json object';
  end if;
  if v_primary_sport is not null and not exists (
    select 1
    from jsonb_array_elements(v_sports) s
    where s ->> 'key' = v_primary_sport
  ) then
    raise exception 'primary_sport must exist in sports list';
  end if;

  insert into vital.sports_profiles (
    user_id,
    sports,
    primary_sport,
    global_objectives,
    constraints,
    cycle_config
  )
  values (
    v_user_id,
    v_sports,
    v_primary_sport,
    v_global_objectives,
    v_constraints,
    v_cycle_config
  )
  on conflict (user_id) do update
  set
    sports = excluded.sports,
    primary_sport = excluded.primary_sport,
    global_objectives = excluded.global_objectives,
    constraints = excluded.constraints,
    cycle_config = excluded.cycle_config,
    profile_version = vital.sports_profiles.profile_version + 1,
    updated_at = now();

  return query
  select *
  from vital.get_sports_profile();
end
$$;

grant execute on function vital.get_sports_profile() to authenticated, service_role;
grant execute on function vital.upsert_sports_profile(jsonb) to authenticated, service_role;

commit;
