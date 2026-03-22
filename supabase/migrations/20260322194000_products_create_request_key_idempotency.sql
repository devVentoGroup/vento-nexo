alter table if exists public.products
  add column if not exists create_request_key text;

create unique index if not exists ux_products_create_request_key
  on public.products (create_request_key)
  where create_request_key is not null;

comment on column public.products.create_request_key
  is 'Llave de idempotencia para alta de producto. Evita duplicados por doble submit/reintento de red.';
