begin;

create table if not exists vital.telemetry_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (char_length(trim(event_name)) > 0),
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'app',
  event_version text not null default 'v1',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists telemetry_events_user_occurred_idx
  on vital.telemetry_events (user_id, occurred_at desc);

create index if not exists telemetry_events_name_occurred_idx
  on vital.telemetry_events (event_name, occurred_at desc);

alter table vital.telemetry_events enable row level security;

drop policy if exists telemetry_events_select on vital.telemetry_events;
create policy telemetry_events_select
  on vital.telemetry_events
  for select
  using (auth.uid() = user_id or vital.is_vital_admin() or vital.is_service_role());

drop policy if exists telemetry_events_insert on vital.telemetry_events;
create policy telemetry_events_insert
  on vital.telemetry_events
  for insert
  with check (auth.uid() = user_id or vital.is_vital_admin() or vital.is_service_role());

drop policy if exists telemetry_events_update on vital.telemetry_events;
create policy telemetry_events_update
  on vital.telemetry_events
  for update
  using (auth.uid() = user_id or vital.is_vital_admin() or vital.is_service_role())
  with check (auth.uid() = user_id or vital.is_vital_admin() or vital.is_service_role());

drop policy if exists telemetry_events_delete on vital.telemetry_events;
create policy telemetry_events_delete
  on vital.telemetry_events
  for delete
  using (auth.uid() = user_id or vital.is_vital_admin() or vital.is_service_role());

create or replace function vital.track_event(
  p_event_name text,
  p_payload jsonb default '{}'::jsonb,
  p_source text default 'app',
  p_occurred_at timestamptz default now(),
  p_event_version text default 'v1'
)
returns uuid
language plpgsql
security invoker
set search_path = public, vital, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_event_name text := nullif(trim(coalesce(p_event_name, '')), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_source text := coalesce(nullif(trim(coalesce(p_source, '')), ''), 'app');
  v_event_version text := coalesce(nullif(trim(coalesce(p_event_version, '')), ''), 'v1');
  v_event_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if v_event_name is null then
    raise exception 'p_event_name is required';
  end if;

  insert into vital.telemetry_events (
    user_id,
    event_name,
    payload,
    source,
    event_version,
    occurred_at
  )
  values (
    v_user_id,
    v_event_name,
    v_payload,
    v_source,
    v_event_version,
    coalesce(p_occurred_at, now())
  )
  returning id into v_event_id;

  return v_event_id;
end
$$;

grant execute on function vital.track_event(text, jsonb, text, timestamptz, text) to authenticated, service_role;

commit;
