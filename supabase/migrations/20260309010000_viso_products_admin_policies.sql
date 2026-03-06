begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product_images_read" on storage.objects;
drop policy if exists "product_images_insert" on storage.objects;
drop policy if exists "product_images_update" on storage.objects;
drop policy if exists "product_images_delete" on storage.objects;

create policy "product_images_read"
on storage.objects
for select
using (bucket_id = 'product-images');

create policy "product_images_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (public.is_owner() or public.is_global_manager())
);

create policy "product_images_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and (public.is_owner() or public.is_global_manager())
)
with check (
  bucket_id = 'product-images'
  and (public.is_owner() or public.is_global_manager())
);

create policy "product_images_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (public.is_owner() or public.is_global_manager())
);

alter table public.loyalty_rewards enable row level security;

drop policy if exists "loyalty_rewards_select_admin" on public.loyalty_rewards;
drop policy if exists "loyalty_rewards_insert_admin" on public.loyalty_rewards;
drop policy if exists "loyalty_rewards_update_admin" on public.loyalty_rewards;
drop policy if exists "loyalty_rewards_delete_admin" on public.loyalty_rewards;

create policy "loyalty_rewards_select_admin"
on public.loyalty_rewards
for select
to authenticated
using (public.is_owner() or public.is_global_manager());

create policy "loyalty_rewards_insert_admin"
on public.loyalty_rewards
for insert
to authenticated
with check (public.is_owner() or public.is_global_manager());

create policy "loyalty_rewards_update_admin"
on public.loyalty_rewards
for update
to authenticated
using (public.is_owner() or public.is_global_manager())
with check (public.is_owner() or public.is_global_manager());

create policy "loyalty_rewards_delete_admin"
on public.loyalty_rewards
for delete
to authenticated
using (public.is_owner() or public.is_global_manager());

commit;
