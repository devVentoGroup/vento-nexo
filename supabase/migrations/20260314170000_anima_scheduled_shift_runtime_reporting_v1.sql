begin;

alter table if exists public.shift_policy
  add column if not exists late_grace_minutes int not null default 5,
  add column if not exists end_reminder_minutes_before_end int not null default 5,
  add column if not exists auto_checkout_grace_minutes_after_end int not null default 30,
  add column if not exists end_reminder_enabled boolean not null default true,
  add column if not exists scheduled_auto_checkout_enabled boolean not null default true;

comment on column public.shift_policy.late_grace_minutes is
  'Minutos de tolerancia antes de marcar tardanza en reportes operativos.';
comment on column public.shift_policy.end_reminder_minutes_before_end is
  'Minutos antes del fin programado para enviar recordatorio de cierre de turno.';
comment on column public.shift_policy.auto_checkout_grace_minutes_after_end is
  'Minutos después del fin programado en los que el sistema puede autocerrar el turno si sigue abierto.';
comment on column public.shift_policy.end_reminder_enabled is
  'Habilita recordatorios push cerca del cierre programado.';
comment on column public.shift_policy.scheduled_auto_checkout_enabled is
  'Habilita autocierre automático por hora fin programada.';

create table if not exists public.shift_runtime_events (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.employee_shifts(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  event_type text not null check (
    event_type = any (array[
      'end_reminder_sent'::text,
      'scheduled_auto_checkout'::text
    ])
  ),
  scheduled_for timestamptz,
  processed_at timestamptz not null default now(),
  status text not null default 'applied' check (
    status = any (array['applied'::text, 'skipped'::text, 'error'::text])
  ),
  notes text,
  payload jsonb not null default '{}'::jsonb
);

comment on table public.shift_runtime_events is
  'Bitácora operativa de recordatorios y autocierres ejecutados sobre turnos programados.';

create unique index if not exists idx_shift_runtime_events_shift_event_type
  on public.shift_runtime_events (shift_id, event_type);

grant select, insert, update on table public.shift_runtime_events to service_role;

create or replace function public.scheduled_auto_close_shift(
  p_shift_id uuid,
  p_triggered_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.employee_shifts%rowtype;
  v_shift_start_at timestamptz;
  v_check_in public.attendance_logs%rowtype;
  v_existing_check_out public.attendance_logs%rowtype;
  v_closed_breaks int := 0;
begin
  if p_shift_id is null then
    raise exception 'shift_id_required';
  end if;

  select *
  into v_shift
  from public.employee_shifts
  where id = p_shift_id
  for update;

  if not found then
    return jsonb_build_object(
      'applied', false,
      'reason', 'shift_not_found'
    );
  end if;

  if v_shift.published_at is null then
    return jsonb_build_object(
      'applied', false,
      'reason', 'shift_not_published'
    );
  end if;

  if coalesce(v_shift.status, '') = 'cancelled' then
    return jsonb_build_object(
      'applied', false,
      'reason', 'shift_cancelled'
    );
  end if;

  v_shift_start_at := make_timestamptz(
    extract(year from v_shift.shift_date)::int,
    extract(month from v_shift.shift_date)::int,
    extract(day from v_shift.shift_date)::int,
    extract(hour from v_shift.start_time)::int,
    extract(minute from v_shift.start_time)::int,
    extract(second from v_shift.start_time),
    'America/Bogota'
  );

  select *
  into v_check_in
  from public.attendance_logs
  where employee_id = v_shift.employee_id
    and site_id = v_shift.site_id
    and action = 'check_in'
    and occurred_at >= v_shift_start_at - interval '6 hours'
    and occurred_at <= p_triggered_at
    and (shift_id = p_shift_id or shift_id is null)
  order by
    case when shift_id = p_shift_id then 0 else 1 end,
    occurred_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'applied', false,
      'reason', 'no_check_in'
    );
  end if;

  select *
  into v_existing_check_out
  from public.attendance_logs
  where employee_id = v_shift.employee_id
    and site_id = v_shift.site_id
    and action = 'check_out'
    and occurred_at >= v_check_in.occurred_at
    and occurred_at <= p_triggered_at
    and (shift_id = p_shift_id or shift_id is null)
  order by occurred_at asc
  limit 1;

  if found then
    return jsonb_build_object(
      'applied', false,
      'reason', 'already_closed',
      'check_out_at', v_existing_check_out.occurred_at
    );
  end if;

  update public.attendance_breaks
  set ended_at = p_triggered_at
  where employee_id = v_shift.employee_id
    and ended_at is null
    and started_at >= v_check_in.occurred_at;

  get diagnostics v_closed_breaks = row_count;

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
    v_shift.employee_id,
    v_shift.site_id,
    'check_out',
    p_triggered_at,
    'system',
    null,
    null,
    null,
    'Auto check-out por fin programado del turno',
    jsonb_build_object(
      'scheduledAutoCheckout', true,
      'closedOpenBreaks', v_closed_breaks
    ),
    null,
    p_shift_id
  );

  return jsonb_build_object(
    'applied', true,
    'reason', 'auto_closed',
    'check_in_at', v_check_in.occurred_at,
    'check_out_at', p_triggered_at,
    'closed_breaks', v_closed_breaks
  );
end;
$$;

grant execute on function public.scheduled_auto_close_shift(uuid, timestamptz) to service_role;

comment on function public.scheduled_auto_close_shift(uuid, timestamptz) is
  'Autocierra un turno programado abierto usando la hora de ejecución como check-out del sistema.';

commit;
