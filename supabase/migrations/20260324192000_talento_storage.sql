-- Vento Talento - Storage SQL
-- Draft inicial para buckets y politicas de storage.objects

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('talento-cv', 'talento-cv', false, 10485760, array['application/pdf']),
  ('talento-documents', 'talento-documents', false, 15728640, array['application/pdf', 'image/jpeg', 'image/png']),
  ('talento-medical', 'talento-medical', false, 15728640, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function talento.storage_object_belongs_to_current_candidate(p_name text)
returns boolean
language sql
stable
as $$
  select
    coalesce((storage.foldername(p_name))[1], '') = 'candidate'
    and coalesce((storage.foldername(p_name))[2], '') = coalesce(talento.current_candidate_id()::text, '__none__')
$$;

drop policy if exists talento_storage_select_own_cv on storage.objects;
create policy talento_storage_select_own_cv
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'talento-cv'
    and talento.storage_object_belongs_to_current_candidate(name)
  );

drop policy if exists talento_storage_insert_own_cv on storage.objects;
create policy talento_storage_insert_own_cv
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'talento-cv'
    and talento.storage_object_belongs_to_current_candidate(name)
  );

drop policy if exists talento_storage_update_own_cv on storage.objects;
create policy talento_storage_update_own_cv
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'talento-cv'
    and talento.storage_object_belongs_to_current_candidate(name)
  )
  with check (
    bucket_id = 'talento-cv'
    and talento.storage_object_belongs_to_current_candidate(name)
  );

drop policy if exists talento_storage_select_own_documents on storage.objects;
create policy talento_storage_select_own_documents
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'talento-documents'
    and talento.storage_object_belongs_to_current_candidate(name)
  );

drop policy if exists talento_storage_insert_own_documents on storage.objects;
create policy talento_storage_insert_own_documents
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'talento-documents'
    and talento.storage_object_belongs_to_current_candidate(name)
  );

drop policy if exists talento_storage_update_own_documents on storage.objects;
create policy talento_storage_update_own_documents
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'talento-documents'
    and talento.storage_object_belongs_to_current_candidate(name)
  )
  with check (
    bucket_id = 'talento-documents'
    and talento.storage_object_belongs_to_current_candidate(name)
  );

drop policy if exists talento_storage_select_own_medical on storage.objects;
create policy talento_storage_select_own_medical
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'talento-medical'
    and talento.storage_object_belongs_to_current_candidate(name)
  );

drop policy if exists talento_storage_insert_own_medical on storage.objects;
create policy talento_storage_insert_own_medical
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'talento-medical'
    and talento.storage_object_belongs_to_current_candidate(name)
  );

drop policy if exists talento_storage_update_own_medical on storage.objects;
create policy talento_storage_update_own_medical
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'talento-medical'
    and talento.storage_object_belongs_to_current_candidate(name)
  )
  with check (
    bucket_id = 'talento-medical'
    and talento.storage_object_belongs_to_current_candidate(name)
  );
