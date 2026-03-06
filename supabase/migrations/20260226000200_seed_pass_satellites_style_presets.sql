-- Seed dynamic satellites with the current Home/brand style presets.
-- This migration is idempotent (upsert by code).

begin;

-- Vento Cafe
with vento_site as (
  select s.id
  from public.sites s
  where lower(s.code) = 'vento_cafe'
  limit 1
)
insert into public.pass_satellites (
  code,
  name,
  subtitle,
  tags,
  site_id,
  watermark_icon,
  gradient_start,
  gradient_end,
  accent_color,
  primary_color,
  background_color,
  text_color,
  text_secondary_color,
  card_color,
  border_color,
  indicator_color,
  loading_color,
  review_url,
  maps_url,
  address_override,
  latitude_override,
  longitude_override,
  sort_order,
  is_active
)
select
  'vento_cafe',
  'Restaurante & Café',
  'Desayunos, Fuertes & Bakery',
  array['Brunch', 'Almuerzos', 'Café & Pastelería']::text[],
  vs.id,
  'utensils',
  '#ECFEFF',
  '#E0F2FE',
  '#2EC9C6',
  '#2EC9C6',
  '#FFFBEB',
  '#78350F',
  '#A8A29E',
  '#FEF3C7',
  '#FDE68A',
  '#2EC9C6',
  '#2EC9C6',
  'https://g.page/r/CRf3SZtHCgeUEBM/review',
  'https://www.google.com/maps/place/Vento+Caf%C3%A9/@7.8913493,-72.4900376,17z/data=!3m1!4b1!4m6!3m5!1s0x8e664565772c2149:0x94070a479b49f717!8m2!3d7.8913493!4d-72.4900376!16s%2Fg%2F11l20qt4ps?entry=ttu',
  'Colsag Frente al parque de la Clínica Santa Ana, Av. 10 Este #8 - 08 Local 1, Cúcuta, Norte de Santander',
  7.8913493,
  -72.4900376,
  10,
  true
from vento_site vs
on conflict (code) do update
set
  name = excluded.name,
  subtitle = excluded.subtitle,
  tags = excluded.tags,
  site_id = excluded.site_id,
  watermark_icon = excluded.watermark_icon,
  gradient_start = excluded.gradient_start,
  gradient_end = excluded.gradient_end,
  accent_color = excluded.accent_color,
  primary_color = excluded.primary_color,
  background_color = excluded.background_color,
  text_color = excluded.text_color,
  text_secondary_color = excluded.text_secondary_color,
  card_color = excluded.card_color,
  border_color = excluded.border_color,
  indicator_color = excluded.indicator_color,
  loading_color = excluded.loading_color,
  review_url = excluded.review_url,
  maps_url = excluded.maps_url,
  address_override = excluded.address_override,
  latitude_override = excluded.latitude_override,
  longitude_override = excluded.longitude_override,
  sort_order = excluded.sort_order,
  is_active = true;

-- Saudo
with saudo_site as (
  select s.id
  from public.sites s
  where lower(s.code) = 'saudo'
  limit 1
)
insert into public.pass_satellites (
  code,
  name,
  subtitle,
  tags,
  site_id,
  watermark_icon,
  gradient_start,
  gradient_end,
  accent_color,
  primary_color,
  background_color,
  text_color,
  text_secondary_color,
  card_color,
  border_color,
  indicator_color,
  loading_color,
  maps_url,
  address_override,
  latitude_override,
  longitude_override,
  sort_order,
  is_active
)
select
  'saudo',
  'Pan & Pizza Masa Madre',
  'Pizzas Napolitanas & Brunch',
  array['Pizzas Napolitanas', 'Bikinis', 'Vino']::text[],
  ss.id,
  'pizza',
  '#FFEDD5',
  '#FFE4E6',
  '#0739AD',
  '#0739AD',
  '#F5F5F4',
  '#1E293B',
  '#989B9A',
  '#FAF3E3',
  '#C8C9C4',
  '#0739AD',
  '#0739AD',
  'https://maps.app.goo.gl/UMjE4XmUP6vfoP4L6',
  'Calle 3 #4e - 152 Local 4, Cúcuta, Norte de Santander',
  7.89585061,
  -72.49451878,
  20,
  true
from saudo_site ss
on conflict (code) do update
set
  name = excluded.name,
  subtitle = excluded.subtitle,
  tags = excluded.tags,
  site_id = excluded.site_id,
  watermark_icon = excluded.watermark_icon,
  gradient_start = excluded.gradient_start,
  gradient_end = excluded.gradient_end,
  accent_color = excluded.accent_color,
  primary_color = excluded.primary_color,
  background_color = excluded.background_color,
  text_color = excluded.text_color,
  text_secondary_color = excluded.text_secondary_color,
  card_color = excluded.card_color,
  border_color = excluded.border_color,
  indicator_color = excluded.indicator_color,
  loading_color = excluded.loading_color,
  maps_url = excluded.maps_url,
  address_override = excluded.address_override,
  latitude_override = excluded.latitude_override,
  longitude_override = excluded.longitude_override,
  sort_order = excluded.sort_order,
  is_active = true;

-- Optional dynamic Vaila card:
-- inserted only if a site with code vaila or vaila_vainilla exists.
-- If no matching site exists, Home keeps using the static Vaila card fallback.
with vaila_site as (
  select s.id
  from public.sites s
  where lower(s.code) in ('vaila', 'vaila_vainilla')
  order by s.created_at asc
  limit 1
)
insert into public.pass_satellites (
  code,
  name,
  subtitle,
  tags,
  site_id,
  watermark_icon,
  gradient_start,
  gradient_end,
  accent_color,
  primary_color,
  background_color,
  text_color,
  text_secondary_color,
  card_color,
  border_color,
  indicator_color,
  loading_color,
  maps_url,
  sort_order,
  is_active
)
select
  'vaila',
  'Boutique',
  'Ingredientes de Vainilla Premium',
  array['Envíos Nacionales']::text[],
  vs.id,
  'shopping-bag',
  '#F2F1F0',
  '#E3C7B0',
  '#AB7B53',
  '#AB7B53',
  '#F2F1F0',
  '#291F23',
  'rgba(41,31,35,0.70)',
  '#E3C7B0',
  '#BFC3D6',
  '#AB7B53',
  '#AB7B53',
  'https://vailavainilla.com',
  30,
  true
from vaila_site vs
on conflict (code) do update
set
  name = excluded.name,
  subtitle = excluded.subtitle,
  tags = excluded.tags,
  site_id = excluded.site_id,
  watermark_icon = excluded.watermark_icon,
  gradient_start = excluded.gradient_start,
  gradient_end = excluded.gradient_end,
  accent_color = excluded.accent_color,
  primary_color = excluded.primary_color,
  background_color = excluded.background_color,
  text_color = excluded.text_color,
  text_secondary_color = excluded.text_secondary_color,
  card_color = excluded.card_color,
  border_color = excluded.border_color,
  indicator_color = excluded.indicator_color,
  loading_color = excluded.loading_color,
  maps_url = excluded.maps_url,
  sort_order = excluded.sort_order,
  is_active = true;

commit;
