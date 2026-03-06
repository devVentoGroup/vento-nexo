-- Bucket para fotos de la ficha maestra de catálogo en NEXO (no confundir con product-images de Vento Pass).
-- Crear en Dashboard: Storage → New bucket → id = "nexo-catalog-images", Public = true,
-- File size limit 5 MB, Allowed MIME types: image/jpeg, image/png, image/webp, image/gif.

drop policy if exists "nexo_catalog_images_public_read" on storage.objects;
create policy "nexo_catalog_images_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'nexo-catalog-images');

drop policy if exists "nexo_catalog_images_authenticated_insert" on storage.objects;
create policy "nexo_catalog_images_authenticated_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'nexo-catalog-images');

drop policy if exists "nexo_catalog_images_authenticated_update" on storage.objects;
create policy "nexo_catalog_images_authenticated_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'nexo-catalog-images');

drop policy if exists "nexo_catalog_images_authenticated_delete" on storage.objects;
create policy "nexo_catalog_images_authenticated_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'nexo-catalog-images');
