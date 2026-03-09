begin;

create or replace function public.anonymize_user_personal_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pass
as $$
begin
  update public.users
  set
    full_name = 'Deleted User',
    document_id = null,
    document_type = null,
    phone = null,
    email = concat('deleted+', substring(p_user_id::text, 1, 8), '@deleted.local'),
    birth_date = null,
    is_active = false,
    is_client = false,
    marketing_opt_in = false,
    has_reviewed_google = false,
    last_review_prompt_date = null,
    updated_at = now()
  where id = p_user_id;

  delete from pass.user_favorites where user_id = p_user_id;
end;
$$;

alter function public.anonymize_user_personal_data(uuid) owner to postgres;
revoke all on function public.anonymize_user_personal_data(uuid) from public;
grant execute on function public.anonymize_user_personal_data(uuid) to service_role;

commit;
