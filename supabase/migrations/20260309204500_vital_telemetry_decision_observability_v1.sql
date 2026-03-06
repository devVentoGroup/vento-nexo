begin;

create or replace function vital.track_decision_event(
  p_event_name text,
  p_reason_code text,
  p_reason_text text,
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
  v_reason_code text := nullif(trim(coalesce(p_reason_code, '')), '');
  v_reason_text text := nullif(trim(coalesce(p_reason_text, '')), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if v_event_name is null then
    raise exception 'p_event_name is required';
  end if;

  if v_reason_code is null then
    raise exception 'p_reason_code is required';
  end if;

  if v_reason_text is null then
    raise exception 'p_reason_text is required';
  end if;

  return vital.track_event(
    v_event_name,
    jsonb_build_object(
      'reason_code', v_reason_code,
      'reason_text', v_reason_text,
      'observability_source', 'decision_trace'
    ) || v_payload,
    coalesce(nullif(trim(coalesce(p_source, '')), ''), 'app'),
    coalesce(p_occurred_at, now()),
    coalesce(nullif(trim(coalesce(p_event_version, '')), ''), 'v1')
  );
end
$$;

create or replace function vital.list_decision_events(
  p_limit integer default 50,
  p_event_name text default null
)
returns table (
  id uuid,
  user_id uuid,
  event_name text,
  reason_code text,
  reason_text text,
  source text,
  event_version text,
  occurred_at timestamptz,
  payload jsonb
)
language sql
security invoker
set search_path = public, vital, auth
as $$
  select
    te.id,
    te.user_id,
    te.event_name,
    te.payload ->> 'reason_code' as reason_code,
    te.payload ->> 'reason_text' as reason_text,
    te.source,
    te.event_version,
    te.occurred_at,
    te.payload
  from vital.telemetry_events te
  where te.user_id = auth.uid()
    and (p_event_name is null or te.event_name = p_event_name)
    and te.payload ? 'reason_code'
  order by te.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function vital.track_decision_event(text, text, text, jsonb, text, timestamptz, text) to authenticated, service_role;
grant execute on function vital.list_decision_events(integer, text) to authenticated, service_role;

commit;
