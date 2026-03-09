begin;

create table if not exists public.app_content_blocks (
  id uuid primary key default gen_random_uuid(),
  app_key text not null,
  screen_key text not null,
  section_key text not null,
  locale text not null default 'es-CO',
  payload jsonb not null default '{}'::jsonb,
  sort_order integer not null default 100,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_content_blocks_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint app_content_blocks_unique unique (app_key, screen_key, section_key, locale)
);

create index if not exists app_content_blocks_lookup_idx
  on public.app_content_blocks (app_key, screen_key, locale, is_enabled, sort_order);

alter table public.app_content_blocks enable row level security;

grant select on table public.app_content_blocks to anon, authenticated;

drop policy if exists app_content_blocks_select_public on public.app_content_blocks;
create policy app_content_blocks_select_public
  on public.app_content_blocks
  for select
  using (is_enabled);

drop policy if exists app_content_blocks_write_admin on public.app_content_blocks;
create policy app_content_blocks_write_admin
  on public.app_content_blocks
  for all
  using (public.is_owner() or public.is_global_manager() or auth.role() = 'service_role')
  with check (public.is_owner() or public.is_global_manager() or auth.role() = 'service_role');

drop trigger if exists app_content_blocks_set_updated_at on public.app_content_blocks;
create trigger app_content_blocks_set_updated_at
before update on public.app_content_blocks
for each row execute function public.update_updated_at();

comment on table public.app_content_blocks is 'Contenido configurable por app/pantalla/seccion para mover copies y bloques visuales desde BD en lugar de codigo.';
comment on column public.app_content_blocks.payload is 'JSONB libre para copies, labels, metadata visual y toggles por seccion.';

insert into public.app_content_blocks (app_key, screen_key, section_key, locale, sort_order, payload)
values
  (
    'vento_pass',
    'home',
    'club_entry',
    'es-CO',
    10,
    jsonb_build_object(
      'tag', 'BETA PRIVADA',
      'title', 'Vento Club',
      'description', 'Activa tu membresia premium y gana cashback booster sobre tus compras.'
    )
  ),
  (
    'vento_pass',
    'home',
    'primary_cta',
    'es-CO',
    20,
    jsonb_build_object(
      'label', 'Escanear ID'
    )
  ),
  (
    'vento_pass',
    'home',
    'secondary_cta',
    'es-CO',
    30,
    jsonb_build_object(
      'label', 'Mis pedidos'
    )
  ),
  (
    'vento_pass',
    'home',
    'sections',
    'es-CO',
    40,
    jsonb_build_object(
      'experiences_title', 'Experiencias'
    )
  ),
  (
    'vento_pass',
    'my_orders',
    'header',
    'es-CO',
    10,
    jsonb_build_object(
      'eyebrow', 'PEDIDOS',
      'title', 'Mis pedidos',
      'subtitle', 'Aqui veras el estado de tus compras y, cuando aplique, el avance del domicilio.'
    )
  ),
  (
    'vento_pass',
    'my_orders',
    'hero',
    'es-CO',
    20,
    jsonb_build_object(
      'title', 'Pedidos y domicilios',
      'description', 'Esta base ya queda lista para pickup y delivery manual o semimanual desde la misma app.'
    )
  ),
  (
    'vento_pass',
    'my_orders',
    'empty_state',
    'es-CO',
    30,
    jsonb_build_object(
      'title', 'Todavia no tienes pedidos',
      'description', 'Cuando activemos el checkout de compras, aqui apareceran tus pedidos de pickup y domicilio.'
    )
  ),
  (
    'vento_pass',
    'my_orders',
    'status_catalog',
    'es-CO',
    40,
    jsonb_build_object(
      'pending', jsonb_build_object('label', 'Pendiente'),
      'confirmed', jsonb_build_object('label', 'Confirmado'),
      'preparing', jsonb_build_object('label', 'Preparando'),
      'ready_for_dispatch', jsonb_build_object('label', 'Listo para despacho'),
      'on_the_way', jsonb_build_object('label', 'En camino'),
      'delivered', jsonb_build_object('label', 'Entregado'),
      'cancelled', jsonb_build_object('label', 'Cancelado')
    )
  ),
  (
    'vento_pass',
    'my_orders',
    'fulfillment_catalog',
    'es-CO',
    50,
    jsonb_build_object(
      'on_premise', jsonb_build_object('label', 'En sitio'),
      'pickup', jsonb_build_object('label', 'Recoger'),
      'delivery', jsonb_build_object('label', 'Domicilio')
    )
  )
on conflict (app_key, screen_key, section_key, locale) do update
set
  payload = excluded.payload,
  sort_order = excluded.sort_order,
  is_enabled = true,
  updated_at = now();

commit;
