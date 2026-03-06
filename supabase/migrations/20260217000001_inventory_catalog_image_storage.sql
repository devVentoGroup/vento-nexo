begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'nexo-catalog-images',
  'nexo-catalog-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "nexo_catalog_images_read" on storage.objects;
drop policy if exists "nexo_catalog_images_insert" on storage.objects;
drop policy if exists "nexo_catalog_images_update" on storage.objects;
drop policy if exists "nexo_catalog_images_delete" on storage.objects;

create policy "nexo_catalog_images_read"
on storage.objects
for select
to authenticated
using (bucket_id = 'nexo-catalog-images');

create policy "nexo_catalog_images_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'nexo-catalog-images');

create policy "nexo_catalog_images_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'nexo-catalog-images')
with check (bucket_id = 'nexo-catalog-images');

create policy "nexo_catalog_images_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'nexo-catalog-images');

commit;
