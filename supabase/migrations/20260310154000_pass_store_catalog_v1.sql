begin;

create table if not exists pass.catalog_items (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  product_id uuid null references public.products(id) on delete set null,
  code text not null,
  name text not null,
  description text null,
  category_label text null,
  image_url text null,
  price_amount numeric not null default 0,
  compare_at_amount numeric null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  badges text[] not null default '{}'::text[],
  fulfillment_modes text[] not null default array['delivery','pickup','on_premise']::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pass_catalog_items_site_code_key unique (site_id, code),
  constraint pass_catalog_items_price_nonnegative check (price_amount >= 0),
  constraint pass_catalog_items_compare_nonnegative check (compare_at_amount is null or compare_at_amount >= 0),
  constraint pass_catalog_items_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint pass_catalog_items_fulfillment_modes_check check (
    fulfillment_modes <@ array['delivery','pickup','on_premise']::text[]
    and cardinality(fulfillment_modes) > 0
  )
);

comment on table pass.catalog_items is 'Dominio Pass: catalogo comercial editable para menu de compra por satelite/site. Separa menu de venta de loyalty rewards.';
comment on column pass.catalog_items.product_id is 'Referencia opcional al producto maestro de inventario/core cuando exista mapeo.';
comment on column pass.catalog_items.category_label is 'Categoria visible del menu digital. Se mantiene desacoplada del catalogo de rewards.';
comment on column pass.catalog_items.fulfillment_modes is 'Modalidades habilitadas para este item en el MVP de pedidos.';

create index if not exists pass_catalog_items_site_active_sort_idx
  on pass.catalog_items (site_id, is_active, sort_order, name);

create index if not exists pass_catalog_items_site_category_idx
  on pass.catalog_items (site_id, category_label, sort_order)
  where is_active = true;

create index if not exists pass_catalog_items_featured_idx
  on pass.catalog_items (site_id, is_featured, sort_order)
  where is_active = true;

drop trigger if exists pass_catalog_items_set_updated_at on pass.catalog_items;
create trigger pass_catalog_items_set_updated_at
before update on pass.catalog_items
for each row
execute function public._set_updated_at();

alter table pass.catalog_items enable row level security;

grant select on table pass.catalog_items to anon, authenticated;
grant insert, update, delete on table pass.catalog_items to authenticated, service_role;

drop policy if exists pass_catalog_items_select_active on pass.catalog_items;
create policy pass_catalog_items_select_active
on pass.catalog_items
for select
using (is_active = true);

drop policy if exists pass_catalog_items_select_admin on pass.catalog_items;
create policy pass_catalog_items_select_admin
on pass.catalog_items
for select
to authenticated
using (public.is_owner() or public.is_global_manager());

drop policy if exists pass_catalog_items_insert_admin on pass.catalog_items;
create policy pass_catalog_items_insert_admin
on pass.catalog_items
for insert
to authenticated
with check (public.is_owner() or public.is_global_manager());

drop policy if exists pass_catalog_items_update_admin on pass.catalog_items;
create policy pass_catalog_items_update_admin
on pass.catalog_items
for update
to authenticated
using (public.is_owner() or public.is_global_manager())
with check (public.is_owner() or public.is_global_manager());

drop policy if exists pass_catalog_items_delete_admin on pass.catalog_items;
create policy pass_catalog_items_delete_admin
on pass.catalog_items
for delete
to authenticated
using (public.is_owner() or public.is_global_manager());

create or replace view public.catalog_items
with (security_invoker = true)
as
select * from pass.catalog_items;

comment on view public.catalog_items is 'Compat view. Canonical table lives in pass.catalog_items.';

grant select on public.catalog_items to anon, authenticated;
grant insert, update, delete on public.catalog_items to authenticated, service_role;

commit;
