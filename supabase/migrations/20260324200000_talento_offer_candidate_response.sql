set check_function_bodies = off;

create or replace function talento.respond_to_offer(
  p_application_id uuid,
  p_decision talento.offer_status,
  p_public_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = talento, public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_candidate_id uuid;
  v_offer_status talento.offer_status;
  v_application_stage talento.stage_code;
  v_offer_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_decision not in ('accepted', 'rejected_by_candidate') then
    raise exception 'Invalid offer decision';
  end if;

  select o.id, a.candidate_id, o.status, a.current_stage_code
    into v_offer_id, v_candidate_id, v_offer_status, v_application_stage
  from talento.offers o
  join talento.applications a
    on a.id = o.application_id
  where a.id = p_application_id
    and a.candidate_id = talento.current_candidate_id()
  for update of o, a;

  if v_offer_id is null then
    raise exception 'Offer not found for current candidate';
  end if;

  if v_offer_status <> 'pending' then
    raise exception 'Offer already has a recorded response';
  end if;

  update talento.offers
     set status = p_decision,
         candidate_response_at = now(),
         public_note = coalesce(p_public_note, public_note)
   where id = v_offer_id;

  if p_decision = 'rejected_by_candidate' then
    update talento.application_stage_history
       set exited_at = now()
     where application_id = p_application_id
       and exited_at is null;

    update talento.applications
       set status = 'withdrawn',
           is_primary_active = false,
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
      v_application_stage,
      'withdrawn',
      now(),
      v_auth_user_id,
      'candidate_rejected_offer',
      coalesce(p_public_note, 'El candidato rechazo la oferta.'),
      'Offer rejected by candidate via respond_to_offer().'
    );
  end if;

  perform talento.log_application_event(
    p_application_id,
    case when p_decision = 'accepted' then 'offer_accepted' else 'offer_rejected_by_candidate' end,
    'candidate',
    v_auth_user_id,
    jsonb_build_object(
      'offer_id', v_offer_id,
      'decision', p_decision,
      'public_note', p_public_note
    )
  );

  return p_application_id;
end
$$;

grant execute on function talento.respond_to_offer(uuid, talento.offer_status, text) to authenticated;
