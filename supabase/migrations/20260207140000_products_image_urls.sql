-- Ficha maestra: foto del producto y foto de catálogo (URLs; almacenamiento en Supabase Storage opcional después).
alter table public.products
  add column if not exists image_url text,
  add column if not exists catalog_image_url text;

comment on column public.products.image_url is 'URL de la foto del producto (ficha maestra).';
comment on column public.products.catalog_image_url is 'URL de la foto de catálogo (listados, reportes).';
