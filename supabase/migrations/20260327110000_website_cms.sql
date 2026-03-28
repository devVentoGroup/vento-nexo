create extension if not exists pgcrypto;

create table if not exists public.website_blocks (
  id uuid primary key default gen_random_uuid(),
  page_slug text not null,
  block_key text not null,
  block_type text not null default 'content',
  title text,
  subtitle text,
  body text,
  cta_label text,
  cta_url text,
  media_url text,
  media_type text check (media_type in ('image', 'video') or media_type is null),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (page_slug, block_key)
);

create table if not exists public.website_items (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('restaurant', 'job', 'service', 'event', 'app')),
  slug text not null,
  title text not null,
  excerpt text,
  body text,
  location text,
  schedule_text text,
  start_at timestamptz,
  end_at timestamptz,
  image_url text,
  video_url text,
  action_label text,
  action_url text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (category, slug)
);

create index if not exists website_blocks_page_idx on public.website_blocks (page_slug, sort_order);
create index if not exists website_blocks_published_idx on public.website_blocks (is_published);
create index if not exists website_items_category_idx on public.website_items (category, sort_order);
create index if not exists website_items_published_idx on public.website_items (is_published);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists website_blocks_touch_updated_at on public.website_blocks;
create trigger website_blocks_touch_updated_at
before update on public.website_blocks
for each row execute function public.touch_updated_at();

drop trigger if exists website_items_touch_updated_at on public.website_items;
create trigger website_items_touch_updated_at
before update on public.website_items
for each row execute function public.touch_updated_at();

alter table public.website_blocks enable row level security;
alter table public.website_items enable row level security;

drop policy if exists website_blocks_public_read on public.website_blocks;
create policy website_blocks_public_read
on public.website_blocks
for select
to anon, authenticated
using (is_published = true);

drop policy if exists website_items_public_read on public.website_items;
create policy website_items_public_read
on public.website_items
for select
to anon, authenticated
using (is_published = true);

insert into public.website_blocks (
  page_slug, block_key, block_type, title, subtitle, body, cta_label, cta_url, sort_order, is_published
)
values
  (
    'home',
    'hero_main',
    'hero',
    'Vento Group',
    'Ecosistema completo para restaurantes y trabajadores',
    'Conecta restaurantes, empleos, servicios, eventos y plataformas digitales desde una sola pagina central.',
    'Ver ecosistema',
    '/ecosistema',
    10,
    true
  ),
  ('home', 'home_media_1', 'media', 'Hero visual 1', null, null, null, null, 20, true),
  ('home', 'home_media_2', 'media', 'Hero visual 2', null, null, null, null, 30, true)
on conflict (page_slug, block_key) do update
set
  block_type = excluded.block_type,
  title = excluded.title,
  subtitle = excluded.subtitle,
  body = excluded.body,
  cta_label = excluded.cta_label,
  cta_url = excluded.cta_url,
  sort_order = excluded.sort_order,
  is_published = excluded.is_published;

insert into public.website_items (
  category, slug, title, excerpt, action_label, action_url, sort_order, is_published
)
values
  ('app', 'vento-pass', 'Vento Pass', 'Membresias, beneficios y experiencia cliente.', 'Descargar', '#', 10, true),
  ('app', 'vento-anima', 'Anima', 'Cultura, bienestar y experiencia del trabajador.', 'Descargar', '#', 20, true),
  ('app', 'vento-os', 'Vento OS', 'Centro operativo del ecosistema Vento.', 'Entrar', '#', 30, true),
  ('restaurant', 'restaurante-destacado', 'Restaurante destacado', 'Bloque listo para foto, video e informacion.', 'Ver restaurante', '#', 10, true),
  ('job', 'vacante-destacada', 'Vacante destacada', 'Publica vacantes dinamicas desde VISO.', 'Aplicar', '#', 10, true),
  ('service', 'servicio-destacado', 'Servicio destacado', 'Muestra servicios del ecosistema.', 'Conocer servicio', '#', 10, true),
  ('event', 'evento-destacado', 'Evento destacado', 'Agenda de eventos y experiencias.', 'Ver evento', '#', 10, true)
on conflict (category, slug) do update
set
  title = excluded.title,
  excerpt = excluded.excerpt,
  action_label = excluded.action_label,
  action_url = excluded.action_url,
  sort_order = excluded.sort_order,
  is_published = excluded.is_published;
