-- Crea pass_satellites (negocios en VISO) para sedes existentes que no tengan uno.
-- El seed original busca site code 'vento_cafe'/'saudo'; las sedes suelen tener 'VCF'/'SAU'.
-- Esta migración rellena negocios para VCF y SAU si faltan.

begin;

-- Vento Café (sede VCF)
insert into pass.pass_satellites (
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
  sort_order,
  is_active
)
select
  'vento_cafe',
  'Restaurante & Café',
  'Desayunos, Fuertes & Bakery',
  array['Brunch', 'Almuerzos', 'Café & Pastelería']::text[],
  s.id,
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
  10,
  true
from public.sites s
where lower(s.code) in ('vcf', 'vento_cafe')
  and not exists (select 1 from pass.pass_satellites ps where ps.site_id = s.id)
limit 1
on conflict (code) do update set
  site_id = excluded.site_id,
  name = excluded.name,
  subtitle = excluded.subtitle,
  is_active = true;

-- Saudo (sede SAU)
insert into pass.pass_satellites (
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
  sort_order,
  is_active
)
select
  'saudo',
  'Pan & Pizza Masa Madre',
  'Pizzas Napolitanas & Brunch',
  array['Pizzas Napolitanas', 'Bikinis', 'Vino']::text[],
  s.id,
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
  20,
  true
from public.sites s
where lower(s.code) in ('sau', 'saudo')
  and not exists (select 1 from pass.pass_satellites ps where ps.site_id = s.id)
limit 1
on conflict (code) do update set
  site_id = excluded.site_id,
  name = excluded.name,
  subtitle = excluded.subtitle,
  is_active = true;

commit;
