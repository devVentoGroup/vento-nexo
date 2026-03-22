-- NEXO v2: permitir múltiples áreas por producto/sede satélite.
-- Se conserva default_area_kind como sugerencia principal para compatibilidad.

alter table if exists public.product_site_settings
  add column if not exists area_kinds text[];

update public.product_site_settings
set area_kinds = array[default_area_kind]
where (area_kinds is null or cardinality(area_kinds) = 0)
  and default_area_kind is not null;

comment on column public.product_site_settings.area_kinds
  is 'Areas operativas habilitadas para solicitar este producto en la sede (multi-seleccion).';
