set check_function_bodies = off;

create or replace function talento.confirm_interview(
  p_interview_id uuid,
  p_public_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = talento, public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_application_id uuid;
  v_status talento.interview_status;
begin
  if v_auth_user_id is null then
    raise exception 'Authentication required';
  end if;

  select i.application_id, i.status
    into v_application_id, v_status
  from talento.interviews i
  join talento.applications a
    on a.id = i.application_id
  where i.id = p_interview_id
    and a.candidate_id = talento.current_candidate_id()
  for update of i;

  if v_application_id is null then
    raise exception 'Interview not found for current candidate';
  end if;

  if v_status = 'confirmed' then
    return p_interview_id;
  end if;

  if v_status <> 'scheduled' then
    raise exception 'Only scheduled interviews can be confirmed';
  end if;

  update talento.interviews
     set status = 'confirmed',
         confirmed_at = now(),
         public_note = coalesce(p_public_note, public_note)
   where id = p_interview_id;

  perform talento.log_application_event(
    v_application_id,
    'interview_confirmed',
    'candidate',
    v_auth_user_id,
    jsonb_build_object(
      'interview_id', p_interview_id,
      'public_note', p_public_note
    )
  );

  return p_interview_id;
end
$$;

grant execute on function talento.confirm_interview(uuid, text) to authenticated;
