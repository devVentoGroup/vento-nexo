begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'pass-satellite-logos',
  'pass-satellite-logos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pass_satellite_logos_read" on storage.objects;
drop policy if exists "pass_satellite_logos_insert" on storage.objects;
drop policy if exists "pass_satellite_logos_update" on storage.objects;
drop policy if exists "pass_satellite_logos_delete" on storage.objects;

create policy "pass_satellite_logos_read"
on storage.objects
for select
using (bucket_id = 'pass-satellite-logos');

create policy "pass_satellite_logos_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pass-satellite-logos'
  and (public.is_owner() or public.is_global_manager())
);

create policy "pass_satellite_logos_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pass-satellite-logos'
  and (public.is_owner() or public.is_global_manager())
)
with check (
  bucket_id = 'pass-satellite-logos'
  and (public.is_owner() or public.is_global_manager())
);

create policy "pass_satellite_logos_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pass-satellite-logos'
  and (public.is_owner() or public.is_global_manager())
);

alter table public.pass_satellites enable row level security;

drop policy if exists "pass_satellites_select_admin" on public.pass_satellites;
drop policy if exists "pass_satellites_insert_admin" on public.pass_satellites;
drop policy if exists "pass_satellites_update_admin" on public.pass_satellites;
drop policy if exists "pass_satellites_delete_admin" on public.pass_satellites;

create policy "pass_satellites_select_admin"
on public.pass_satellites
for select
to authenticated
using (public.is_owner() or public.is_global_manager());

create policy "pass_satellites_insert_admin"
on public.pass_satellites
for insert
to authenticated
with check (public.is_owner() or public.is_global_manager());

create policy "pass_satellites_update_admin"
on public.pass_satellites
for update
to authenticated
using (public.is_owner() or public.is_global_manager())
with check (public.is_owner() or public.is_global_manager());

create policy "pass_satellites_delete_admin"
on public.pass_satellites
for delete
to authenticated
using (public.is_owner() or public.is_global_manager());

alter table public.users enable row level security;

drop policy if exists "users_insert_admin" on public.users;
drop policy if exists "users_update_admin" on public.users;
drop policy if exists "users_delete_admin" on public.users;

create policy "users_insert_admin"
on public.users
for insert
to authenticated
with check (public.is_owner() or public.is_global_manager());

create policy "users_update_admin"
on public.users
for update
to authenticated
using (public.is_owner() or public.is_global_manager())
with check (public.is_owner() or public.is_global_manager());

create policy "users_delete_admin"
on public.users
for delete
to authenticated
using (public.is_owner() or public.is_global_manager());

commit;
