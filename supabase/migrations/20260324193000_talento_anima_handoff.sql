-- Vento Talento - Real handoff to ANIMA
-- Draft inicial usando public.employees, public.employee_sites y public.employee_settings

create or replace function talento.handoff_to_anima(
  p_application_id uuid,
  p_target_site_id uuid,
  p_target_role text,
  p_actor_id uuid default auth.uid(),
  p_area_id uuid default null,
  p_full_name_override text default null,
  p_selected_site_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = talento, public
as $$
declare
  v_candidate_id uuid;
  v_candidate_auth_user_id uuid;
  v_first_name text;
  v_last_name text;
  v_full_name text;
  v_existing_employee_id uuid;
  v_has_pending_preboarding boolean;
  v_selected_site_id uuid;
begin
  select a.candidate_id
    into v_candidate_id
  from talento.applications a
  where a.id = p_application_id
  for update;

  if v_candidate_id is null then
    raise exception 'Application not found';
  end if;

  if exists (
    select 1
    from talento.candidate_employee_links l
    where l.application_id = p_application_id
  ) then
    raise exception 'Application already transferred';
  end if;

  select c.auth_user_id, c.first_name, c.last_name
    into v_candidate_auth_user_id, v_first_name, v_last_name
  from talento.candidates c
  where c.id = v_candidate_id;

  if v_candidate_auth_user_id is null then
    raise exception 'Candidate has no auth_user_id; cannot provision employee';
  end if;

  if not exists (
    select 1
    from public.sites s
    where s.id = p_target_site_id
  ) then
    raise exception 'Target site does not exist';
  end if;

  if not exists (
    select 1
    from public.roles r
    where r.code = p_target_role
      and coalesce(r.is_active, true) = true
  ) then
    raise exception 'Target role does not exist or is inactive';
  end if;

  if p_area_id is not null and not exists (
    select 1
    from public.areas a
    where a.id = p_area_id
      and a.site_id = p_target_site_id
      and coalesce(a.is_active, true) = true
  ) then
    raise exception 'Area does not exist or does not belong to target site';
  end if;

  select exists (
    select 1
    from talento.preboarding_tasks t
    where t.application_id = p_application_id
      and t.status in ('pending', 'rejected')
  ) into v_has_pending_preboarding;

  if coalesce(v_has_pending_preboarding, false) then
    raise exception 'Pending preboarding tasks prevent handoff';
  end if;

  v_full_name := coalesce(nullif(btrim(p_full_name_override), ''), concat_ws(' ', v_first_name, v_last_name));
  v_selected_site_id := coalesce(p_selected_site_id, p_target_site_id);

  select e.id
    into v_existing_employee_id
  from public.employees e
  where e.id = v_candidate_auth_user_id;

  insert into public.employees (
    id,
    site_id,
    role,
    full_name,
    is_active,
    joined_at,
    updated_at,
    area_id
  ) values (
    v_candidate_auth_user_id,
    p_target_site_id,
    p_target_role,
    v_full_name,
    true,
    now(),
    now(),
    p_area_id
  )
  on conflict (id) do update
  set site_id = excluded.site_id,
      role = excluded.role,
      full_name = excluded.full_name,
      is_active = true,
      updated_at = now(),
      area_id = excluded.area_id;

  update public.employee_sites
     set is_primary = false
   where employee_id = v_candidate_auth_user_id
     and site_id <> p_target_site_id;

  insert into public.employee_sites (
    employee_id,
    site_id,
    is_primary,
    is_active
  ) values (
    v_candidate_auth_user_id,
    p_target_site_id,
    true,
    true
  )
  on conflict (employee_id, site_id) do update
  set is_primary = true,
      is_active = true;

  insert into public.employee_settings (
    employee_id,
    selected_site_id,
    selected_area_id,
    updated_at
  ) values (
    v_candidate_auth_user_id,
    v_selected_site_id,
    p_area_id,
    now()
  )
  on conflict (employee_id) do update
  set selected_site_id = excluded.selected_site_id,
      selected_area_id = excluded.selected_area_id,
      updated_at = now();

  update talento.application_stage_history
     set exited_at = now()
   where application_id = p_application_id
     and exited_at is null;

  update talento.applications
     set current_stage_code = 'handoff',
         status = 'hired',
         last_stage_changed_at = now(),
         is_primary_active = false
   where id = p_application_id;

  insert into talento.application_stage_history (
    application_id,
    stage_code,
    status,
    entered_at,
    changed_by,
    public_note,
    internal_note
  ) values (
    p_application_id,
    'handoff',
    'hired',
    now(),
    p_actor_id,
    'Aprobado para ingreso.',
    coalesce(p_notes, 'Provisioned into ANIMA employee domain.')
  );

  insert into talento.candidate_employee_links (
    candidate_id,
    application_id,
    employee_id,
    transferred_at,
    transferred_by,
    notes
  ) values (
    v_candidate_id,
    p_application_id,
    v_candidate_auth_user_id,
    now(),
    p_actor_id,
    p_notes
  );

  perform talento.log_application_event(
    p_application_id,
    'application_handoff_to_anima',
    'internal_user',
    p_actor_id,
    jsonb_build_object(
      'employee_id', v_candidate_auth_user_id,
      'target_site_id', p_target_site_id,
      'target_role', p_target_role,
      'existing_employee', v_existing_employee_id is not null,
      'selected_site_id', v_selected_site_id,
      'area_id', p_area_id,
      'notes', p_notes
    )
  );

  return v_candidate_auth_user_id;
end
$$;

grant execute on function talento.handoff_to_anima(uuid, uuid, text, uuid, uuid, text, uuid, text) to service_role;
