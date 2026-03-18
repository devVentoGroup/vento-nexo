-- Operational context policy for app actions (v1).
-- Goal: enforce shift/check-in/site match from DB, without hardcoded frontend rules.

create table if not exists public.app_operation_policies (
  app_code text primary key,
  requires_shift boolean not null default false,
  requires_checkin boolean not null default false,
  requires_site_match boolean not null default false,
  bypass_permission_code text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_operation_policies_app_code_check check (length(trim(app_code)) > 0)
);

comment on table public.app_operation_policies is
  'DB-driven rules to allow/block operational actions per app (shift, check-in, site match).';
comment on column public.app_operation_policies.bypass_permission_code is
  'Permission suffix (without app prefix). If user has app_code.permission, operational gate is bypassed.';

alter table public.app_operation_policies enable row level security;

drop policy if exists app_operation_policies_select_authenticated on public.app_operation_policies;
create policy app_operation_policies_select_authenticated
  on public.app_operation_policies
  for select
  to authenticated
  using (true);

insert into public.app_operation_policies (
  app_code,
  requires_shift,
  requires_checkin,
  requires_site_match,
  bypass_permission_code,
  is_active
) values
  ('nexo', true, true, true, 'inventory.remissions.all_sites', true)
on conflict (app_code) do update
set
  requires_shift = excluded.requires_shift,
  requires_checkin = excluded.requires_checkin,
  requires_site_match = excluded.requires_site_match,
  bypass_permission_code = excluded.bypass_permission_code,
  is_active = excluded.is_active,
  updated_at = now();

create or replace function public.get_operational_context(
  p_employee_id uuid default auth.uid(),
  p_site_id uuid default null,
  p_app_code text default 'nexo'
)
returns table (
  employee_id uuid,
  app_code text,
  active_site_id uuid,
  selected_site_id uuid,
  employee_default_site_id uuid,
  active_shift_id uuid,
  active_shift_site_id uuid,
  on_shift_now boolean,
  active_checkin_id uuid,
  active_checkin_site_id uuid,
  checked_in_now boolean,
  policy_requires_shift boolean,
  policy_requires_checkin boolean,
  policy_requires_site_match boolean,
  bypass_applied boolean,
  can_operate boolean,
  blocked_reasons text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy record;
  v_selected_site_id uuid;
  v_employee_site_id uuid;
  v_active_site_id uuid;
  v_shift_id uuid;
  v_shift_site_id uuid;
  v_on_shift boolean := false;
  v_open_checkin_id uuid;
  v_open_checkin_site_id uuid;
  v_checked_in boolean := false;
  v_now_local timestamp without time zone;
  v_today date;
  v_time_now time without time zone;
  v_bypass boolean := false;
  v_bypass_code text := null;
  v_reasons text[] := array[]::text[];
  v_can_operate boolean := true;
begin
  select *
  into v_policy
  from public.app_operation_policies p
  where p.app_code = trim(lower(coalesce(p_app_code, 'nexo')))
    and p.is_active = true
  limit 1;

  if p_employee_id is null then
    p_employee_id := auth.uid();
  end if;

  if p_employee_id is null then
    employee_id := null;
    app_code := coalesce(v_policy.app_code, trim(lower(coalesce(p_app_code, 'nexo'))));
    active_site_id := null;
    selected_site_id := null;
    employee_default_site_id := null;
    active_shift_id := null;
    active_shift_site_id := null;
    on_shift_now := false;
    active_checkin_id := null;
    active_checkin_site_id := null;
    checked_in_now := false;
    policy_requires_shift := coalesce(v_policy.requires_shift, false);
    policy_requires_checkin := coalesce(v_policy.requires_checkin, false);
    policy_requires_site_match := coalesce(v_policy.requires_site_match, false);
    bypass_applied := false;
    can_operate := false;
    blocked_reasons := array['unauthenticated'];
    return next;
    return;
  end if;

  select e.site_id
    into v_employee_site_id
  from public.employees e
  where e.id = p_employee_id
  limit 1;

  select es.selected_site_id
    into v_selected_site_id
  from public.employee_settings es
  where es.employee_id = p_employee_id
  limit 1;

  v_now_local := now() at time zone 'America/Bogota';
  v_today := v_now_local::date;
  v_time_now := v_now_local::time;

  select s.id, s.site_id
    into v_shift_id, v_shift_site_id
  from public.employee_shifts s
  where s.employee_id = p_employee_id
    and s.shift_date = v_today
    and s.published_at is not null
    and coalesce(s.status, 'scheduled') <> 'cancelled'
    and (
      (s.start_time <= s.end_time and v_time_now between s.start_time and s.end_time)
      or
      (s.start_time > s.end_time and (v_time_now >= s.start_time or v_time_now <= s.end_time))
    )
  order by s.start_time asc
  limit 1;

  v_on_shift := v_shift_id is not null;

  select al.id, al.site_id
    into v_open_checkin_id, v_open_checkin_site_id
  from public.attendance_logs al
  where al.employee_id = p_employee_id
    and al.action = 'check_in'
    and not exists (
      select 1
      from public.attendance_logs ao
      where ao.employee_id = al.employee_id
        and ao.action = 'check_out'
        and ao.occurred_at > al.occurred_at
    )
  order by al.occurred_at desc
  limit 1;

  v_checked_in := v_open_checkin_id is not null;
  v_active_site_id := coalesce(p_site_id, v_selected_site_id, v_open_checkin_site_id, v_shift_site_id, v_employee_site_id);

  if v_policy.bypass_permission_code is not null and trim(v_policy.bypass_permission_code) <> '' then
    v_bypass_code := v_policy.app_code || '.' || trim(v_policy.bypass_permission_code);
    v_bypass := public.has_permission(v_bypass_code, v_active_site_id);
  end if;

  if not v_bypass then
    if coalesce(v_policy.requires_shift, false) and not v_on_shift then
      v_reasons := array_append(v_reasons, 'out_of_shift');
    end if;
    if coalesce(v_policy.requires_checkin, false) and not v_checked_in then
      v_reasons := array_append(v_reasons, 'checkin_required');
    end if;
    if coalesce(v_policy.requires_site_match, false) then
      if v_on_shift and v_active_site_id is not null and v_shift_site_id is not null and v_shift_site_id <> v_active_site_id then
        v_reasons := array_append(v_reasons, 'shift_site_mismatch');
      end if;
      if v_checked_in and v_active_site_id is not null and v_open_checkin_site_id is not null and v_open_checkin_site_id <> v_active_site_id then
        v_reasons := array_append(v_reasons, 'checkin_site_mismatch');
      end if;
    end if;
  end if;

  v_can_operate := coalesce(array_length(v_reasons, 1), 0) = 0;

  employee_id := p_employee_id;
  app_code := coalesce(v_policy.app_code, trim(lower(coalesce(p_app_code, 'nexo'))));
  active_site_id := v_active_site_id;
  selected_site_id := v_selected_site_id;
  employee_default_site_id := v_employee_site_id;
  active_shift_id := v_shift_id;
  active_shift_site_id := v_shift_site_id;
  on_shift_now := v_on_shift;
  active_checkin_id := v_open_checkin_id;
  active_checkin_site_id := v_open_checkin_site_id;
  checked_in_now := v_checked_in;
  policy_requires_shift := coalesce(v_policy.requires_shift, false);
  policy_requires_checkin := coalesce(v_policy.requires_checkin, false);
  policy_requires_site_match := coalesce(v_policy.requires_site_match, false);
  bypass_applied := v_bypass;
  can_operate := v_can_operate;
  blocked_reasons := v_reasons;
  return next;
end;
$$;

grant execute on function public.get_operational_context(uuid, uuid, text) to authenticated;
