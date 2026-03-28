begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'website-media',
  'website-media',
  true,
  41943040,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "website_media_read" on storage.objects;
drop policy if exists "website_media_insert" on storage.objects;
drop policy if exists "website_media_update" on storage.objects;
drop policy if exists "website_media_delete" on storage.objects;

create policy "website_media_read"
on storage.objects
for select
using (bucket_id = 'website-media');

create policy "website_media_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'website-media'
  and (public.is_owner() or public.is_global_manager())
);

create policy "website_media_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'website-media'
  and (public.is_owner() or public.is_global_manager())
)
with check (
  bucket_id = 'website-media'
  and (public.is_owner() or public.is_global_manager())
);

create policy "website_media_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'website-media'
  and (public.is_owner() or public.is_global_manager())
);

commit;
