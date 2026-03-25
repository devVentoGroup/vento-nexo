begin;

-- Shift runtime policy:
-- - remind 5 minutes before end
-- - remind again 30 minutes after scheduled end if still open
-- - no scheduled auto-checkout by time
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'shift_policy'
      and column_name = 'end_reminder_minutes_after_end'
  ) then
    update public.shift_policy
    set
      end_reminder_enabled = true,
      end_reminder_minutes_before_end = 5,
      end_reminder_minutes_after_end = 30,
      auto_checkout_grace_minutes_after_end = 30,
      scheduled_auto_checkout_enabled = false;
  else
    update public.shift_policy
    set
      end_reminder_enabled = true,
      end_reminder_minutes_before_end = 5,
      auto_checkout_grace_minutes_after_end = 30,
      scheduled_auto_checkout_enabled = false;
  end if;
end $$;

-- Allow storing follow-up reminder runtime events.
alter table public.shift_runtime_events
  drop constraint if exists shift_runtime_events_event_type_check;

alter table public.shift_runtime_events
  add constraint shift_runtime_events_event_type_check
  check (
    event_type = any (array[
      'end_reminder_sent'::text,
      'end_reminder_followup_sent'::text,
      'scheduled_auto_checkout'::text
    ])
  );

-- Geofence departure policy:
-- - auto-checkout only by departure outside site radius + accuracy
-- - threshold tightened to 200 meters
insert into public.attendance_policy (
  geofence_check_in_max_accuracy_meters,
  geofence_check_out_max_accuracy_meters,
  late_tolerance_minutes,
  geofence_ready_cache_ms,
  geofence_latch_ttl_checkin_ms,
  geofence_latch_ttl_checkout_ms,
  shift_departure_max_accuracy_meters,
  shift_departure_threshold_meters,
  shift_departure_min_check_interval_ms
)
select 20, 25, 15, 45000, 900000, 600000, 35, 200, 45000
where not exists (select 1 from public.attendance_policy);

update public.attendance_policy
set
  shift_departure_threshold_meters = 200,
  shift_departure_max_accuracy_meters = least(shift_departure_max_accuracy_meters, 35),
  updated_at = now();

commit;
