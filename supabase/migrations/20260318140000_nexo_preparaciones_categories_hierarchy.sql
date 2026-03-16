-- Reorganiza las categorías de preparaciones en jerarquía Raíz → Padres → Hojas.
-- Las 20 categorías ya insertadas (preparacion-*) pasan a ser HOJAS bajo PADREs; la RAIZ es única.
-- Depende de: 20260318120000_nexo_preparaciones_categories_expanded (categorías preparacion-* ya existen).

begin;

do $$
declare
  raiz_id uuid;
  padre_fondos uuid;
  padre_salsas uuid;
  padre_marinadas_proteina uuid;
  padre_mise_vegetal uuid;
  padre_rellenos uuid;
  padre_masas_saladas uuid;
  padre_reposteria_dulces uuid;
  padre_guarniciones uuid;
  padre_mezclas_bar uuid;
  padre_fermentos uuid;
  padre_listas_regenerar uuid;
  padre_frituras uuid;
  padre_otros uuid;
begin
  -- 1) Crear RAIZ: Preparaciones / Semi-elaborados (si no existe)
  insert into public.product_categories (
    id, name, slug, description, display_order, is_active, created_at, updated_at,
    domain, site_id, parent_id, applies_to_kinds
  )
  select
    gen_random_uuid(),
    'Preparaciones / Semi-elaborados',
    'preparaciones-semi-elaborados',
    'Raíz para categorías de preparaciones y semi-elaborados (WIP). Solo organizacional; no asignar productos aquí.',
    0,
    true,
    now(),
    now(),
    null,
    null,
    null,
    array['preparacion']::text[]
  where not exists (
    select 1 from public.product_categories pc
    where pc.slug = 'preparaciones-semi-elaborados'
      and pc.site_id is null and pc.parent_id is null
  );

  select pc.id into raiz_id
  from public.product_categories pc
  where pc.slug = 'preparaciones-semi-elaborados'
    and pc.site_id is null and pc.parent_id is null
  limit 1;

  if raiz_id is null then
    raise exception 'No se pudo obtener la raíz preparaciones-semi-elaborados';
  end if;

  -- 2) Crear PADREs bajo la raíz (idempotente por slug)
  insert into public.product_categories (
    id, name, slug, description, display_order, is_active, created_at, updated_at,
    domain, site_id, parent_id, applies_to_kinds
  )
  select gen_random_uuid(), v.name, v.slug, v.descr, v.ord, true, now(), now(),
    null, null, raiz_id, array['preparacion']::text[]
  from (values
    ('Fondos, caldos y bases líquidas', 'preparaciones-padre-fondos-caldos',
     'Fondos, caldos y bases para sopas o salsas.', 10),
    ('Salsas', 'preparaciones-padre-salsas',
     'Salsas madre, bases y salsas listas para servicio.', 20),
    ('Marinadas y preparados de proteína', 'preparaciones-padre-marinadas-proteina',
     'Marinadas, adobos, salmueras y mise en place de proteína.', 30),
    ('Mise en place vegetal', 'preparaciones-padre-mise-vegetal',
     'Cortes y preparaciones previas de vegetales.', 40),
    ('Rellenos y farces', 'preparaciones-padre-rellenos',
     'Rellenos y farces saladas para pastas, masas o vegetales.', 50),
    ('Masas y bases saladas', 'preparaciones-padre-masas-saladas',
     'Masas crudas o prehorneadas para productos salados.', 60),
    ('Repostería y dulces', 'preparaciones-padre-reposteria-dulces',
     'Masas dulces, cremas, salsas dulces, toppings y decoraciones.', 70),
    ('Guarniciones y acompañamientos', 'preparaciones-padre-guarniciones',
     'Guarniciones y acompañamientos listos.', 80),
    ('Mezclas secas y bar', 'preparaciones-padre-mezclas-bar',
     'Mezclas secas, rubs y preparados para bebidas y barras.', 90),
    ('Fermentos y masas madre', 'preparaciones-padre-fermentos',
     'Fermentos y masas madre para panadería y bebidas.', 100),
    ('Preparaciones listas para regenerar', 'preparaciones-padre-listas-regenerar',
     'Platos o componentes armados listos para regenerar.', 110),
    ('Frituras y empanizados', 'preparaciones-padre-frituras',
     'Bases y mezclas para frituras y empanizados.', 120),
    ('Otros', 'preparaciones-padre-otros',
     'Preparaciones que no encajan en las demás categorías.', 999)
  ) as v(name, slug, descr, ord)
  where not exists (
    select 1 from public.product_categories pc
    where pc.slug = v.slug and pc.parent_id = raiz_id and pc.site_id is null
  );

  -- Obtener ids de cada padre
  select id into padre_fondos from public.product_categories where slug = 'preparaciones-padre-fondos-caldos' and parent_id = raiz_id and site_id is null limit 1;
  select id into padre_salsas from public.product_categories where slug = 'preparaciones-padre-salsas' and parent_id = raiz_id and site_id is null limit 1;
  select id into padre_marinadas_proteina from public.product_categories where slug = 'preparaciones-padre-marinadas-proteina' and parent_id = raiz_id and site_id is null limit 1;
  select id into padre_mise_vegetal from public.product_categories where slug = 'preparaciones-padre-mise-vegetal' and parent_id = raiz_id and site_id is null limit 1;
  select id into padre_rellenos from public.product_categories where slug = 'preparaciones-padre-rellenos' and parent_id = raiz_id and site_id is null limit 1;
  select id into padre_masas_saladas from public.product_categories where slug = 'preparaciones-padre-masas-saladas' and parent_id = raiz_id and site_id is null limit 1;
  select id into padre_reposteria_dulces from public.product_categories where slug = 'preparaciones-padre-reposteria-dulces' and parent_id = raiz_id and site_id is null limit 1;
  select id into padre_guarniciones from public.product_categories where slug = 'preparaciones-padre-guarniciones' and parent_id = raiz_id and site_id is null limit 1;
  select id into padre_mezclas_bar from public.product_categories where slug = 'preparaciones-padre-mezclas-bar' and parent_id = raiz_id and site_id is null limit 1;
  select id into padre_fermentos from public.product_categories where slug = 'preparaciones-padre-fermentos' and parent_id = raiz_id and site_id is null limit 1;
  select id into padre_listas_regenerar from public.product_categories where slug = 'preparaciones-padre-listas-regenerar' and parent_id = raiz_id and site_id is null limit 1;
  select id into padre_frituras from public.product_categories where slug = 'preparaciones-padre-frituras' and parent_id = raiz_id and site_id is null limit 1;
  select id into padre_otros from public.product_categories where slug = 'preparaciones-padre-otros' and parent_id = raiz_id and site_id is null limit 1;

  -- 3) Reubicar las 20 HOJAs (preparacion-*) bajo el padre correspondiente
  update public.product_categories set parent_id = padre_fondos, updated_at = now()
  where slug in ('preparacion-fondos-caldos', 'preparacion-bases-sopas-cremas')
    and site_id is null and applies_to_kinds @> array['preparacion']::text[];

  update public.product_categories set parent_id = padre_salsas, updated_at = now()
  where slug in ('preparacion-salsas-madre-bases-saladas', 'preparacion-salsas-listas')
    and site_id is null and applies_to_kinds @> array['preparacion']::text[];

  update public.product_categories set parent_id = padre_marinadas_proteina, updated_at = now()
  where slug in ('preparacion-marinadas-adobos-salmueras', 'preparacion-mise-en-place-proteina')
    and site_id is null and applies_to_kinds @> array['preparacion']::text[];

  update public.product_categories set parent_id = padre_mise_vegetal, updated_at = now()
  where slug = 'preparacion-mise-en-place-vegetal'
    and site_id is null and applies_to_kinds @> array['preparacion']::text[];

  update public.product_categories set parent_id = padre_rellenos, updated_at = now()
  where slug = 'preparacion-rellenos-salados'
    and site_id is null and applies_to_kinds @> array['preparacion']::text[];

  update public.product_categories set parent_id = padre_masas_saladas, updated_at = now()
  where slug = 'preparacion-masas-bases-saladas'
    and site_id is null and applies_to_kinds @> array['preparacion']::text[];

  update public.product_categories set parent_id = padre_reposteria_dulces, updated_at = now()
  where slug in (
    'preparacion-masas-bases-dulces',
    'preparacion-cremas-rellenos-dulces',
    'preparacion-salsas-coulis-dulces',
    'preparacion-toppings-decoraciones'
  )
    and site_id is null and applies_to_kinds @> array['preparacion']::text[];

  update public.product_categories set parent_id = padre_guarniciones, updated_at = now()
  where slug = 'preparacion-guarniciones-listas'
    and site_id is null and applies_to_kinds @> array['preparacion']::text[];

  update public.product_categories set parent_id = padre_mezclas_bar, updated_at = now()
  where slug in ('preparacion-mezclas-secas-rubs', 'preparacion-preparados-bebidas-barra')
    and site_id is null and applies_to_kinds @> array['preparacion']::text[];

  update public.product_categories set parent_id = padre_fermentos, updated_at = now()
  where slug = 'preparacion-fermentos-masas-madre'
    and site_id is null and applies_to_kinds @> array['preparacion']::text[];

  update public.product_categories set parent_id = padre_listas_regenerar, updated_at = now()
  where slug = 'preparacion-listas-regenerar'
    and site_id is null and applies_to_kinds @> array['preparacion']::text[];

  update public.product_categories set parent_id = padre_frituras, updated_at = now()
  where slug = 'preparacion-bases-frituras-empanizados'
    and site_id is null and applies_to_kinds @> array['preparacion']::text[];

  update public.product_categories set parent_id = padre_otros, updated_at = now()
  where slug = 'preparacion-otros'
    and site_id is null and applies_to_kinds @> array['preparacion']::text[];

end $$;

commit;
