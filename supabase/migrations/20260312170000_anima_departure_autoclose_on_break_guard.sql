begin;

create or replace function public.register_shift_departure_event_autoclose(
  p_site_id uuid,
  p_distance_meters integer,
  p_accuracy_meters integer default null,
  p_source text default 'mobile',
  p_notes text default null,
  p_occurred_at timestamptz default now(),
  p_auto_checkout_threshold_meters integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_shift_site_id uuid;
  v_shift_start_at timestamptz;
  v_event_id uuid;
  v_distance integer := greatest(coalesce(p_distance_meters, 0), 0);
  v_accuracy integer := case
    when p_accuracy_meters is null then null
    else greatest(p_accuracy_meters, 0)
  end;
  v_event_time timestamptz := coalesce(p_occurred_at, now());
  v_threshold integer := greatest(coalesce(p_auto_checkout_threshold_meters, 500), 100);
  v_is_outside boolean;
  v_auto_checkout_applied boolean := false;
  v_auto_checkout_reason text := null;
begin
  if v_employee_id is null then
    raise exception 'No autenticado';
  end if;

  select *
    into v_employee
  from public.employees
  where id = v_employee_id;

  if not found then
    raise exception 'Empleado no encontrado';
  end if;

  if coalesce(v_employee.is_active, false) is false then
    raise exception 'Empleado inactivo';
  end if;

  select al.site_id, al.occurred_at
    into v_shift_site_id, v_shift_start_at
  from public.attendance_logs al
  where al.employee_id = v_employee_id
    and al.action = 'check_in'
    and not exists (
      select 1
      from public.attendance_logs ao
      where ao.employee_id = al.employee_id
        and ao.action = 'check_out'
        and ao.occurred_at > al.occurred_at
    )
  order by al.occurred_at desc, al.created_at desc
  limit 1;

  if v_shift_start_at is null then
    return jsonb_build_object('inserted', false, 'reason', 'no_open_shift');
  end if;

  if p_site_id is not null and p_site_id is distinct from v_shift_site_id then
    return jsonb_build_object('inserted', false, 'reason', 'site_mismatch');
  end if;

  -- Regla de negocio: no autocerrar turno cuando hay descanso activo.
  if exists (
    select 1
    from public.attendance_breaks b
    where b.employee_id = v_employee_id
      and b.ended_at is null
  ) then
    return jsonb_build_object(
      'inserted', false,
      'reason', 'on_break',
      'auto_checkout_applied', false,
      'auto_checkout_reason', 'on_break'
    );
  end if;

  insert into public.attendance_shift_events (
    employee_id,
    site_id,
    shift_start_at,
    event_type,
    occurred_at,
    distance_meters,
    accuracy_meters,
    source,
    notes
  )
  values (
    v_employee_id,
    coalesce(p_site_id, v_shift_site_id),
    v_shift_start_at,
    'left_site_open_shift',
    v_event_time,
    v_distance,
    v_accuracy,
    coalesce(p_source, 'mobile'),
    p_notes
  )
  on conflict (employee_id, shift_start_at, event_type) do nothing
  returning id
    into v_event_id;

  v_is_outside := (v_distance + coalesce(v_accuracy, 0)) >= v_threshold;

  if v_is_outside then
    begin
      update public.attendance_breaks
      set
        ended_at = coalesce(ended_at, v_event_time),
        end_source = 'system',
        end_notes = coalesce(end_notes, 'Cierre automático por salida de sede')
      where employee_id = v_employee_id
        and ended_at is null;

      insert into public.attendance_logs (
        employee_id,
        site_id,
        action,
        source,
        latitude,
        longitude,
        accuracy_meters,
        device_info,
        notes,
        occurred_at
      )
      values (
        v_employee_id,
        coalesce(p_site_id, v_shift_site_id),
        'check_out',
        'system',
        null,
        null,
        coalesce(v_accuracy, 0),
        jsonb_build_object(
          'autoCheckout', true,
          'origin', 'departure_monitor',
          'distanceMeters', v_distance,
          'accuracyMeters', v_accuracy,
          'thresholdMeters', v_threshold
        ),
        'Auto check-out por salida de sede',
        v_event_time
      );

      v_auto_checkout_applied := true;
      v_auto_checkout_reason := 'auto_checkout_applied';
    exception
      when others then
        v_auto_checkout_applied := false;
        v_auto_checkout_reason := sqlerrm;
    end;
  else
    v_auto_checkout_reason := 'below_threshold';
  end if;

  return jsonb_build_object(
    'inserted', v_event_id is not null,
    'reason', case when v_event_id is null then 'already_recorded' else null end,
    'event_id', v_event_id,
    'shift_start_at', v_shift_start_at,
    'auto_checkout_applied', v_auto_checkout_applied,
    'auto_checkout_reason', v_auto_checkout_reason,
    'threshold_meters', v_threshold
  );
end;
$$;

grant execute on function public.register_shift_departure_event_autoclose(
  uuid,
  integer,
  integer,
  text,
  text,
  timestamptz,
  integer
) to authenticated, service_role;

commit;
