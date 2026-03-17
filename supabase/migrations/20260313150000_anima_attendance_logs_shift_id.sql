-- Relacionar check-in con turno programado (opcional): permite ver/registrar
-- la relación entre asistencia y turno cuando el check-in es en la misma sede/fecha
-- que un turno publicado. No bloquea check-in si no hay turno.
alter table public.attendance_logs
  add column if not exists shift_id uuid references public.employee_shifts(id) on delete set null;

comment on column public.attendance_logs.shift_id is 'Turno programado asociado al registro (check-in en sede/fecha del turno publicado). Opcional.';

-- Extender sync_attendance_events para aceptar shift_id y persistirlo.
create or replace function public.sync_attendance_events(p_events jsonb)
returns table (
  event_id text,
  result text,
  message text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_employee_id uuid := auth.uid();
  v_item jsonb;
  v_event_id text;
  v_action text;
  v_site_id uuid;
  v_occurred_at timestamptz;
  v_lat numeric;
  v_lng numeric;
  v_accuracy numeric;
  v_source text;
  v_notes text;
  v_device_info jsonb;
  v_shift_id uuid;
begin
  if v_employee_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'p_events must be a json array';
  end if;

  for v_item in select value from jsonb_array_elements(p_events)
  loop
    v_event_id := nullif(trim(coalesce(v_item ->> 'eventId', v_item ->> 'event_id', '')), '');
    v_action := lower(trim(coalesce(v_item ->> 'eventType', v_item ->> 'event_type', v_item ->> 'action', '')));
    v_source := nullif(trim(coalesce(v_item ->> 'source', 'mobile')), '');
    v_notes := nullif(trim(coalesce(v_item ->> 'notes', '')), '');
    v_occurred_at := coalesce(
      nullif(v_item ->> 'occurredAt', '')::timestamptz,
      nullif(v_item ->> 'occurred_at', '')::timestamptz,
      now()
    );
    v_site_id := nullif(coalesce(v_item ->> 'siteId', v_item ->> 'site_id', ''), '')::uuid;
    v_lat := nullif(coalesce(v_item #>> '{geoSnapshot,lat}', v_item ->> 'latitude', ''), '')::numeric;
    v_lng := nullif(coalesce(v_item #>> '{geoSnapshot,lng}', v_item ->> 'longitude', ''), '')::numeric;
    v_accuracy := nullif(
      coalesce(v_item #>> '{geoSnapshot,accuracy}', v_item ->> 'accuracy_meters', ''),
      ''
    )::numeric;
    v_device_info := coalesce(v_item -> 'deviceInfo', v_item -> 'device_info', '{}'::jsonb);
    v_shift_id := nullif(coalesce(v_item ->> 'shiftId', v_item ->> 'shift_id', ''), '')::uuid;

    if v_event_id is null then
      return query select null::text, 'error'::text, 'event_id missing'::text;
      continue;
    end if;

    if v_action not in ('check_in', 'check_out') then
      return query select v_event_id, 'error'::text, 'event_type not supported'::text;
      continue;
    end if;

    if v_site_id is null then
      return query select v_event_id, 'error'::text, 'site_id missing'::text;
      continue;
    end if;

    begin
      insert into public.attendance_logs (
        employee_id,
        site_id,
        action,
        occurred_at,
        source,
        latitude,
        longitude,
        accuracy_meters,
        notes,
        device_info,
        client_event_id,
        shift_id
      )
      values (
        v_employee_id,
        v_site_id,
        v_action,
        v_occurred_at,
        coalesce(v_source, 'mobile'),
        v_lat,
        v_lng,
        v_accuracy,
        v_notes,
        jsonb_set(coalesce(v_device_info, '{}'::jsonb), '{clientEventId}', to_jsonb(v_event_id), true),
        v_event_id,
        v_shift_id
      );

      return query select v_event_id, 'applied'::text, null::text;
    exception
      when unique_violation then
        return query select v_event_id, 'duplicate'::text, 'Evento ya aplicado previamente.'::text;
      when others then
        insert into public.attendance_sync_conflicts (
          employee_id,
          event_id,
          event_type,
          site_id,
          occurred_at,
          reason,
          payload
        )
        values (
          v_employee_id,
          v_event_id,
          v_action,
          v_site_id::text,
          v_occurred_at,
          sqlerrm,
          v_item
        );

        if sqlstate = 'P0001' then
          return query select v_event_id, 'conflict'::text, sqlerrm;
        else
          return query select v_event_id, 'error'::text, sqlerrm;
        end if;
    end;
  end loop;
end;
$$;
