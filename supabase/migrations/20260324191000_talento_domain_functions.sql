-- Vento Talento - Domain Functions SQL
-- Draft inicial sobre 001_talento_foundation.sql

create or replace function talento.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists trg_talento_candidates_updated_at on talento.candidates;
create trigger trg_talento_candidates_updated_at
before update on talento.candidates
for each row execute function talento.set_updated_at();

drop trigger if exists trg_talento_candidate_profiles_updated_at on talento.candidate_profiles;
create trigger trg_talento_candidate_profiles_updated_at
before update on talento.candidate_profiles
for each row execute function talento.set_updated_at();

drop trigger if exists trg_talento_vacancies_updated_at on talento.vacancies;
create trigger trg_talento_vacancies_updated_at
before update on talento.vacancies
for each row execute function talento.set_updated_at();

drop trigger if exists trg_talento_applications_updated_at on talento.applications;
create trigger trg_talento_applications_updated_at
before update on talento.applications
for each row execute function talento.set_updated_at();

drop trigger if exists trg_talento_application_requirements_updated_at on talento.application_requirements;
create trigger trg_talento_application_requirements_updated_at
before update on talento.application_requirements
for each row execute function talento.set_updated_at();

drop trigger if exists trg_talento_candidate_documents_updated_at on talento.candidate_documents;
create trigger trg_talento_candidate_documents_updated_at
before update on talento.candidate_documents
for each row execute function talento.set_updated_at();

drop trigger if exists trg_talento_interviews_updated_at on talento.interviews;
create trigger trg_talento_interviews_updated_at
before update on talento.interviews
for each row execute function talento.set_updated_at();

drop trigger if exists trg_talento_medical_evaluations_updated_at on talento.medical_evaluations;
create trigger trg_talento_medical_evaluations_updated_at
before update on talento.medical_evaluations
for each row execute function talento.set_updated_at();

drop trigger if exists trg_talento_offers_updated_at on talento.offers;
create trigger trg_talento_offers_updated_at
before update on talento.offers
for each row execute function talento.set_updated_at();

drop trigger if exists trg_talento_preboarding_tasks_updated_at on talento.preboarding_tasks;
create trigger trg_talento_preboarding_tasks_updated_at
before update on talento.preboarding_tasks
for each row execute function talento.set_updated_at();

create or replace function talento.log_application_event(
  p_application_id uuid,
  p_event_type text,
  p_actor_type text,
  p_actor_id uuid default auth.uid(),
  p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = talento, public
as $$
  insert into talento.application_events (
    application_id,
    event_type,
    actor_type,
    actor_id,
    payload
  )
  values (
    p_application_id,
    p_event_type,
    p_actor_type,
    p_actor_id,
    coalesce(p_payload, '{}'::jsonb)
  );
$$;

create or replace function talento.stage_rank(p_stage talento.stage_code)
returns integer
language sql
immutable
as $$
  select case p_stage
    when 'applied' then 10
    when 'documents' then 20
    when 'screening' then 30
    when 'interview' then 40
    when 'medical' then 50
    when 'offer' then 60
    when 'preboarding' then 70
    when 'handoff' then 80
    else 0
  end
$$;

create or replace function talento.status_for_stage(p_stage talento.stage_code)
returns talento.application_status
language sql
immutable
as $$
  select case p_stage
    when 'applied' then 'submitted'::talento.application_status
    when 'documents' then 'in_review'::talento.application_status
    when 'screening' then 'in_review'::talento.application_status
    when 'interview' then 'interview'::talento.application_status
    when 'medical' then 'validation'::talento.application_status
    when 'offer' then 'offer'::talento.application_status
    when 'preboarding' then 'preboarding'::talento.application_status
    when 'handoff' then 'hired'::talento.application_status
  end
$$;

create or replace function talento.set_primary_application(
  p_application_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = talento, public
as $$
declare
  v_candidate_id uuid;
  v_auth_user_id uuid;
begin
  v_auth_user_id := auth.uid();
  if v_auth_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select a.candidate_id
    into v_candidate_id
  from talento.applications a
  join talento.candidates c on c.id = a.candidate_id
  where a.id = p_application_id
    and c.auth_user_id = v_auth_user_id;

  if v_candidate_id is null then
    raise exception 'Application not found for current candidate';
  end if;

  update talento.applications
     set is_primary_active = false
   where candidate_id = v_candidate_id
     and is_primary_active = true;

  update talento.applications
     set is_primary_active = true
   where id = p_application_id;

  perform talento.log_application_event(
    p_application_id,
    'application_primary_selected',
    'candidate',
    v_auth_user_id,
    jsonb_build_object('application_id', p_application_id)
  );

  return p_application_id;
end
$$;

create or replace function talento.submit_application(
  p_vacancy_id uuid,
  p_source text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = talento, public
as $$
declare
  v_auth_user_id uuid;
  v_candidate_id uuid;
  v_existing_application_id uuid;
  v_application_id uuid;
  v_vacancy_status text;
begin
  v_auth_user_id := auth.uid();
  if v_auth_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select c.id
    into v_candidate_id
  from talento.candidates c
  where c.auth_user_id = v_auth_user_id;

  if v_candidate_id is null then
    raise exception 'Candidate profile not found for current user';
  end if;

  select v.status
    into v_vacancy_status
  from talento.vacancies v
  where v.id = p_vacancy_id;

  if v_vacancy_status is null then
    raise exception 'Vacancy not found';
  end if;

  if v_vacancy_status <> 'published' then
    raise exception 'Vacancy is not open for applications';
  end if;

  select a.id
    into v_existing_application_id
  from talento.applications a
  where a.candidate_id = v_candidate_id
    and a.vacancy_id = p_vacancy_id
    and a.status not in ('rejected', 'withdrawn', 'expired', 'hired')
  order by a.created_at desc
  limit 1;

  if v_existing_application_id is not null then
    perform talento.set_primary_application(v_existing_application_id);
    return v_existing_application_id;
  end if;

  update talento.applications
     set is_primary_active = false
   where candidate_id = v_candidate_id
     and is_primary_active = true;

  insert into talento.applications (
    candidate_id,
    vacancy_id,
    status,
    current_stage_code,
    is_primary_active,
    applied_at,
    last_stage_changed_at,
    source,
    metadata
  )
  values (
    v_candidate_id,
    p_vacancy_id,
    'submitted',
    'applied',
    true,
    now(),
    now(),
    p_source,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_application_id;

  insert into talento.application_stage_history (
    application_id,
    stage_code,
    status,
    entered_at,
    changed_by,
    public_note,
    internal_note
  )
  values (
    v_application_id,
    'applied',
    'submitted',
    now(),
    v_auth_user_id,
    'Postulacion recibida.',
    'Application created by candidate submit_application().'
  );

  perform talento.log_application_event(
    v_application_id,
    'application_submitted',
    'candidate',
    v_auth_user_id,
    jsonb_build_object(
      'vacancy_id', p_vacancy_id,
      'source', p_source
    )
  );

  return v_application_id;
end
$$;

create or replace function talento.advance_application_stage(
  p_application_id uuid,
  p_new_stage talento.stage_code,
  p_reason_code text default null,
  p_public_note text default null,
  p_internal_note text default null,
  p_actor_id uuid default auth.uid(),
  p_force boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = talento, public
as $$
declare
  v_current_stage talento.stage_code;
  v_current_status talento.application_status;
  v_new_status talento.application_status;
  v_current_rank integer;
  v_new_rank integer;
  v_has_completed_interview boolean;
  v_has_pending_required_items boolean;
begin
  if p_new_stage = 'handoff' then
    raise exception 'Use transfer_candidate_to_employee() for handoff stage';
  end if;

  select a.current_stage_code, a.status
    into v_current_stage, v_current_status
  from talento.applications a
  where a.id = p_application_id
  for update;

  if v_current_stage is null then
    raise exception 'Application not found';
  end if;

  if v_current_status in ('hired', 'rejected', 'withdrawn', 'expired') and not p_force then
    raise exception 'Cannot advance a terminal application';
  end if;

  if v_current_stage = p_new_stage and not p_force then
    return p_application_id;
  end if;

  v_current_rank := talento.stage_rank(v_current_stage);
  v_new_rank := talento.stage_rank(p_new_stage);

  if v_new_rank < v_current_rank and not p_force then
    raise exception 'Backward stage transition requires force=true';
  end if;

  if p_new_stage in ('medical', 'offer') and not p_force then
    select exists (
      select 1
      from talento.interviews i
      where i.application_id = p_application_id
        and i.status = 'completed'
    ) into v_has_completed_interview;

    if not coalesce(v_has_completed_interview, false) then
      raise exception 'Completed interview required before moving to %', p_new_stage;
    end if;
  end if;

  if p_new_stage = 'preboarding' and not p_force then
    select exists (
      select 1
      from talento.application_requirements r
      where r.application_id = p_application_id
        and r.is_required = true
        and r.status in ('pending', 'rejected')
    ) into v_has_pending_required_items;

    if coalesce(v_has_pending_required_items, false) then
      raise exception 'Required items must be approved before preboarding';
    end if;
  end if;

  v_new_status := talento.status_for_stage(p_new_stage);

  update talento.application_stage_history
     set exited_at = now()
   where application_id = p_application_id
     and exited_at is null;

  update talento.applications
     set current_stage_code = p_new_stage,
         status = v_new_status,
         last_stage_changed_at = now()
   where id = p_application_id;

  insert into talento.application_stage_history (
    application_id,
    stage_code,
    status,
    entered_at,
    changed_by,
    reason_code,
    public_note,
    internal_note
  )
  values (
    p_application_id,
    p_new_stage,
    v_new_status,
    now(),
    p_actor_id,
    p_reason_code,
    p_public_note,
    p_internal_note
  );

  perform talento.log_application_event(
    p_application_id,
    'application_stage_changed',
    'internal_user',
    p_actor_id,
    jsonb_build_object(
      'from_stage', v_current_stage,
      'to_stage', p_new_stage,
      'from_status', v_current_status,
      'to_status', v_new_status,
      'reason_code', p_reason_code,
      'forced', p_force
    )
  );

  return p_application_id;
end
$$;

create or replace function talento.review_candidate_document(
  p_document_id uuid,
  p_status talento.document_status,
  p_rejection_reason text default null,
  p_actor_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = talento, public
as $$
declare
  v_application_id uuid;
  v_candidate_id uuid;
begin
  if p_status not in ('in_review', 'approved', 'rejected') then
    raise exception 'Invalid review status: %', p_status;
  end if;

  update talento.candidate_documents d
     set status = p_status,
         reviewed_at = now(),
         reviewed_by = p_actor_id,
         rejection_reason = case when p_status = 'rejected' then p_rejection_reason else null end
   where d.id = p_document_id
  returning d.application_id, d.candidate_id into v_application_id, v_candidate_id;

  if v_candidate_id is null then
    raise exception 'Document not found';
  end if;

  if v_application_id is not null then
    perform talento.log_application_event(
      v_application_id,
      'document_reviewed',
      'internal_user',
      p_actor_id,
      jsonb_build_object(
        'document_id', p_document_id,
        'status', p_status,
        'rejection_reason', p_rejection_reason
      )
    );
  end if;

  return p_document_id;
end
$$;

create or replace function talento.schedule_interview(
  p_application_id uuid,
  p_scheduled_at timestamptz,
  p_format text,
  p_location text default null,
  p_meeting_url text default null,
  p_public_note text default null,
  p_internal_note text default null,
  p_actor_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = talento, public
as $$
declare
  v_interview_id uuid;
  v_current_stage talento.stage_code;
begin
  select current_stage_code
    into v_current_stage
  from talento.applications
  where id = p_application_id
  for update;

  if v_current_stage is null then
    raise exception 'Application not found';
  end if;

  if talento.stage_rank(v_current_stage) < talento.stage_rank('interview') then
    perform talento.advance_application_stage(
      p_application_id,
      'interview',
      'interview_scheduled',
      'Entrevista agendada.',
      'Moved to interview by schedule_interview().',
      p_actor_id,
      false
    );
  end if;

  insert into talento.interviews (
    application_id,
    scheduled_at,
    format,
    location,
    meeting_url,
    status,
    public_note,
    internal_note
  )
  values (
    p_application_id,
    p_scheduled_at,
    p_format,
    p_location,
    p_meeting_url,
    'scheduled',
    p_public_note,
    p_internal_note
  )
  returning id into v_interview_id;

  perform talento.log_application_event(
    p_application_id,
    'interview_scheduled',
    'internal_user',
    p_actor_id,
    jsonb_build_object(
      'interview_id', v_interview_id,
      'scheduled_at', p_scheduled_at,
      'format', p_format,
      'location', p_location,
      'meeting_url', p_meeting_url
    )
  );

  return v_interview_id;
end
$$;

create or replace function talento.transfer_candidate_to_employee(
  p_application_id uuid,
  p_employee_id uuid,
  p_actor_id uuid default auth.uid(),
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = talento, public
as $$
declare
  v_candidate_id uuid;
  v_current_status talento.application_status;
  v_has_pending_preboarding boolean;
begin
  select a.candidate_id, a.status
    into v_candidate_id, v_current_status
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

  select exists (
    select 1
    from talento.preboarding_tasks t
    where t.application_id = p_application_id
      and t.status in ('pending', 'rejected')
  ) into v_has_pending_preboarding;

  if coalesce(v_has_pending_preboarding, false) then
    raise exception 'Pending preboarding tasks prevent handoff';
  end if;

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
  )
  values (
    p_application_id,
    'handoff',
    'hired',
    now(),
    p_actor_id,
    'Aprobado para ingreso.',
    coalesce(p_notes, 'Transferred to employee domain.')
  );

  insert into talento.candidate_employee_links (
    candidate_id,
    application_id,
    employee_id,
    transferred_at,
    transferred_by,
    notes
  )
  values (
    v_candidate_id,
    p_application_id,
    p_employee_id,
    now(),
    p_actor_id,
    p_notes
  );

  perform talento.log_application_event(
    p_application_id,
    'application_transferred_to_employee',
    'internal_user',
    p_actor_id,
    jsonb_build_object(
      'employee_id', p_employee_id,
      'notes', p_notes
    )
  );

  return p_application_id;
end
$$;

grant execute on function talento.submit_application(uuid, text, jsonb) to authenticated;
grant execute on function talento.set_primary_application(uuid) to authenticated;

grant execute on function talento.advance_application_stage(uuid, talento.stage_code, text, text, text, uuid, boolean) to service_role;
grant execute on function talento.review_candidate_document(uuid, talento.document_status, text, uuid) to service_role;
grant execute on function talento.schedule_interview(uuid, timestamptz, text, text, text, text, text, uuid) to service_role;
grant execute on function talento.transfer_candidate_to_employee(uuid, uuid, uuid, text) to service_role;
