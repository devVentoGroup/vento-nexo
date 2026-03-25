create or replace function talento.bootstrap_my_candidate(
  p_first_name text default null,
  p_last_name text default null,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = talento, public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_metadata jsonb := coalesce(v_claims -> 'user_metadata', v_claims -> 'raw_user_meta_data', '{}'::jsonb);
  v_email text := nullif(lower(trim(coalesce(v_claims ->> 'email', ''))), '');
  v_phone text := nullif(
    trim(
      coalesce(
        p_phone,
        v_claims ->> 'phone',
        v_metadata ->> 'phone',
        ''
      )
    ),
    ''
  );
  v_first_name text := nullif(
    trim(
      coalesce(
        p_first_name,
        v_metadata ->> 'first_name',
        v_metadata ->> 'firstName',
        ''
      )
    ),
    ''
  );
  v_last_name text := nullif(
    trim(
      coalesce(
        p_last_name,
        v_metadata ->> 'last_name',
        v_metadata ->> 'lastName',
        ''
      )
    ),
    ''
  );
  v_candidate_id uuid;
  v_conflict_candidate_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'bootstrap_my_candidate() requires an authenticated user';
  end if;

  if v_email is null then
    raise exception 'Authenticated user email is required to bootstrap talento.candidates';
  end if;

  if v_first_name is null then
    v_first_name := split_part(v_email, '@', 1);
  end if;

  if v_last_name is null then
    v_last_name := 'Pendiente';
  end if;

  select c.id
    into v_candidate_id
    from talento.candidates c
   where c.auth_user_id = v_auth_user_id
   limit 1;

  select c.id
    into v_conflict_candidate_id
    from talento.candidates c
   where lower(c.email) = v_email
     and c.auth_user_id is not null
     and c.auth_user_id <> v_auth_user_id
   limit 1;

  if v_conflict_candidate_id is not null then
    raise exception 'The email % is already linked to another candidate account', v_email;
  end if;

  if v_candidate_id is null then
    select c.id
      into v_candidate_id
      from talento.candidates c
     where lower(c.email) = v_email
       and (c.auth_user_id is null or c.auth_user_id = v_auth_user_id)
     order by c.created_at asc
     limit 1;
  end if;

  if v_candidate_id is null then
    insert into talento.candidates (
      auth_user_id,
      email,
      phone,
      first_name,
      last_name,
      status
    )
    values (
      v_auth_user_id,
      v_email,
      v_phone,
      v_first_name,
      v_last_name,
      'active'
    )
    returning id into v_candidate_id;
  else
    update talento.candidates
       set auth_user_id = v_auth_user_id,
           email = v_email,
           phone = coalesce(v_phone, talento.candidates.phone),
           first_name = coalesce(v_first_name, talento.candidates.first_name),
           last_name = coalesce(v_last_name, talento.candidates.last_name),
           updated_at = now()
     where id = v_candidate_id;
  end if;

  insert into talento.candidate_profiles (candidate_id)
  values (v_candidate_id)
  on conflict (candidate_id) do nothing;

  return v_candidate_id;
end;
$$;

comment on function talento.bootstrap_my_candidate(text, text, text)
is 'Creates or binds the authenticated auth user to talento.candidates and ensures candidate_profiles exists.';

revoke all on function talento.bootstrap_my_candidate(text, text, text) from public;
grant execute on function talento.bootstrap_my_candidate(text, text, text) to authenticated;
