-- Categorías de preparaciones expandidas: lista canon con descripciones y reasignación de productos existentes.
-- Depende de: 20260313103000_nexo_preparaciones_dulces_categories (product_categories con applies_to_kinds).

begin;

-- 1) Insertar categorías de preparación (top-level, solo 'preparacion'). Idempotente por slug global (site_id null, parent_id null).
insert into public.product_categories (
  id,
  name,
  slug,
  description,
  display_order,
  is_active,
  created_at,
  updated_at,
  domain,
  site_id,
  parent_id,
  applies_to_kinds
)
select
  gen_random_uuid(),
  v.name,
  v.slug,
  v.description,
  v.display_order,
  true,
  now(),
  now(),
  null,
  null,
  null,
  array['preparacion']::text[]
from (values
  ('Fondos y caldos', 'preparacion-fondos-caldos',
   'Preparaciones líquidas de base obtenidas por cocción prolongada de huesos, carnes, vegetales o pescados, usadas como base de salsas, sopas y guisos. Ej: fondo de pollo, fumet.',
   10),
  ('Salsas madre y bases saladas', 'preparacion-salsas-madre-bases-saladas',
   'Salsas base que sirven como punto de partida para derivar otras salsas (bechamel, velouté, demi-glace, bases de tomate). No listas para pase directo.',
   20),
  ('Salsas listas para servicio', 'preparacion-salsas-listas',
   'Salsas terminadas que se utilizan directamente en pase o solo requieren regeneración o calentar. Ej: salsa de champiñones lista, salsa BBQ de la casa.',
   30),
  ('Marinadas, adobos y salmueras', 'preparacion-marinadas-adobos-salmueras',
   'Líquidos o pastas para marinar, adobar o salar proteínas y vegetales antes de cocción. Ej: salmuera para pollo asado, adobo de cerdo.',
   40),
  ('Mise en place vegetal', 'preparacion-mise-en-place-vegetal',
   'Cortes y preparaciones previas de vegetales listas para cocción o armado (brunoise, sofrito, mirepoix, verduras blanqueadas).',
   50),
  ('Mise en place de proteína', 'preparacion-mise-en-place-proteina',
   'Proteínas porcionadas, marinadas o pretratadas listas para cocción final o armado. Ej: pechuga porcionada y marinada, hamburguesa formada cruda.',
   60),
  ('Rellenos y farces saladas', 'preparacion-rellenos-salados',
   'Mezclas saladas para rellenar pastas, masas o vegetales (empanadas, lasañas, canelones, farces).',
   70),
  ('Masas y bases saladas', 'preparacion-masas-bases-saladas',
   'Masas crudas o prehorneadas para productos salados: pizza, pan, tartaletas saladas, quiches.',
   80),
  ('Masas y bases dulces', 'preparacion-masas-bases-dulces',
   'Masas y bases de pastelería y repostería (bizcochuelos, masas quebradas dulces, bases de cheesecake).',
   90),
  ('Cremas y rellenos dulces', 'preparacion-cremas-rellenos-dulces',
   'Preparaciones cremosas dulces para rellenar, cubrir o montar postres: crema pastelera, chantilly, mousses, ganache.',
   100),
  ('Salsas y coulis dulces', 'preparacion-salsas-coulis-dulces',
   'Salsas dulces fluidas para acompañar o napar postres: coulis de frutos rojos, salsa de chocolate, caramelo, siropes.',
   110),
  ('Guarniciones y acompañamientos listos', 'preparacion-guarniciones-listas',
   'Guarniciones cocinadas o casi listas que acompañan platos principales: puré listo, arroz base cocido, vegetales salteados listos.',
   120),
  ('Bases para sopas y cremas', 'preparacion-bases-sopas-cremas',
   'Preparaciones concentradas o semi-terminadas que se convierten en sopas o cremas con poca intervención (crema de champiñones base, sopas concentradas).',
   130),
  ('Mezclas secas y rubs', 'preparacion-mezclas-secas-rubs',
   'Mezclas de ingredientes secos como condimento, rebozo o base de recetas: rubs para parrilla, mezclas de especias, premezclas para rebozar.',
   140),
  ('Preparados para bebidas y barras', 'preparacion-preparados-bebidas-barra',
   'Preparaciones líquidas o semi-líquidas para bar y bebidas: siropes, bases de jugos, concentrados, mezclas de coctelería sin alcohol.',
   150),
  ('Fermentos y masas madre', 'preparacion-fermentos-masas-madre',
   'Cultivos activos y masas en fermentación para panadería, bebidas u otros fermentados (masa madre, starters, kombucha).',
   160),
  ('Toppings, crumbles y decoraciones', 'preparacion-toppings-decoraciones',
   'Elementos listos para textura, sabor o decoración: crumble dulce, granola, semillas tostadas, crocantes, chips decorativos.',
   170),
  ('Preparaciones listas para regenerar', 'preparacion-listas-regenerar',
   'Platos o componentes armados y cocinados listos para regenerar y pasar a pase (lasañas armadas, sous-vide, platos al vacío).',
   180),
  ('Bases para frituras y empanizados', 'preparacion-bases-frituras-empanizados',
   'Preparaciones líquidas o mezclas húmedas para freír o empanizar: tempura, batidos para apanado.',
   190),
  ('Otros (preparaciones)', 'preparacion-otros',
   'Categoría de respaldo para preparaciones que no encajan en las anteriores. Revisar periódicamente.',
   999)
) as v(name, slug, description, display_order)
where not exists (
  select 1 from public.product_categories pc
  where pc.slug = v.slug
    and pc.site_id is null
    and pc.parent_id is null
    and pc.applies_to_kinds @> array['preparacion']::text[]
);

-- 2) Reasignar productos tipo preparación a las nuevas categorías por nombre (solo si aún no tienen categoría de preparación o queremos reasignar por reglas).
--    Orden de updates: de más específico a más genérico para no pisar asignaciones ya hechas. Solo tocamos product_type = 'preparacion'.

-- Fondos y caldos
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-fondos-caldos'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%fondo%' or p.name ilike '%caldo%' or p.name ilike '%fumet%');

-- Salsas madre y bases saladas
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-salsas-madre-bases-saladas'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%bechamel%' or p.name ilike '%veloute%' or p.name ilike '%velouté%' or p.name ilike '%demi%' or p.name ilike '%salsa madre%' or p.name ilike '%base salsa%');

-- Salsas listas (evitar que fondos/salsas madre ya asignados se pisen: solo si no están en fondos ni salsas madre)
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-salsas-listas'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%salsa %' or p.name ilike 'salsa%' or p.name ilike '%gravy%' or p.name ilike '%reducción%' or p.name ilike '%reduccion%')
  and p.category_id not in (select id from public.product_categories where slug in ('preparacion-fondos-caldos','preparacion-salsas-madre-bases-saladas') and site_id is null and parent_id is null);

-- Marinadas, adobos y salmueras
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-marinadas-adobos-salmueras'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%marin%' or p.name ilike '%adobo%' or p.name ilike '%salmuera%' or p.name ilike '%brine%');

-- Mise en place vegetal
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-mise-en-place-vegetal'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%brunoise%' or p.name ilike '%mirepoix%' or p.name ilike '%sofrito%' or p.name ilike '%picado%' or p.name ilike '%vegetal%' or p.name ilike '%verdura%');

-- Mise en place de proteína
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-mise-en-place-proteina'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%porcionado%' or p.name ilike '%porcionada%' or p.name ilike '%hamburguesa%' or p.name ilike '%albondiga%' or p.name ilike '%albóndiga%');

-- Rellenos y farces saladas
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-rellenos-salados'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%relleno%' or p.name ilike '%farce%');

-- Masas y bases saladas (excluir dulces)
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-masas-bases-saladas'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and p.name ilike '%masa%' and p.name not ilike '%dulce%' and p.name not ilike '%galleta%' and p.name not ilike '%torta%';

-- Masas y bases dulces
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-masas-bases-dulces'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%masa%dulce%' or p.name ilike '%bizcochuelo%' or p.name ilike '%base cheesecake%' or p.name ilike '%galleta%' or p.name ilike '%torta%');

-- Cremas y rellenos dulces
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-cremas-rellenos-dulces'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%crema pastelera%' or p.name ilike '%crema pastelera%' or p.name ilike '%mousse%' or p.name ilike '%ganache%' or p.name ilike '%chantilly%');

-- Salsas y coulis dulces
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-salsas-coulis-dulces'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%coulis%' or p.name ilike '%salsa de chocolate%' or p.name ilike '%caramelo%' or p.name ilike '%sirope%' or p.name ilike '%syrup%');

-- Guarniciones listas
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-guarniciones-listas'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%puré%' or p.name ilike '%pure%' or p.name ilike '%guarnicion%' or p.name ilike '%guarnición%' or p.name ilike '%acompañamiento%');

-- Bases para sopas y cremas
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-bases-sopas-cremas'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%sopa%' or p.name ilike '%crema de %');

-- Mezclas secas y rubs
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-mezclas-secas-rubs'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%mix%' or p.name ilike '%mezcla%' or p.name ilike '%rub%' or p.name ilike '%sazonador%');

-- Preparados bebidas y barras
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-preparados-bebidas-barra'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%limonada%' or p.name ilike '%base bebida%' or p.name ilike '%jarabe%' or p.name ilike '%jugo base%');

-- Fermentos y masas madre
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-fermentos-masas-madre'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%masa madre%' or p.name ilike '%starter%' or p.name ilike '%fermento%' or p.name ilike '%levain%');

-- Toppings y decoraciones
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-toppings-decoraciones'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%crumble%' or p.name ilike '%granola%' or p.name ilike '%topping%' or p.name ilike '%crujiente%' or p.name ilike '%crocante%');

-- Preparaciones listas para regenerar
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-listas-regenerar'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%lasaña%' or p.name ilike '%lasagna%' or p.name ilike '%sous vide%' or p.name ilike '%sous-vide%' or p.name ilike '%listo para regenerar%' or p.name ilike '%plato armado%');

-- Bases frituras y empanizados
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-bases-frituras-empanizados'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and (p.name ilike '%apanado%' or p.name ilike '%empanizado%' or p.name ilike '%tempura%' or p.name ilike '%rebozado%' or p.name ilike '%rebosado%');

-- Otros: preparaciones que sigan con categoría que no sea de esta lista (opcional, no forzamos para no pisar categorías ya útiles como bases-de-reposteria)
-- Si se desea llevar todo lo no asignado a "Otros", descomentar el bloque siguiente:
/*
update public.products p
set category_id = c.id
from public.product_categories c
where c.slug = 'preparacion-otros'
  and c.site_id is null and c.parent_id is null
  and p.product_type = 'preparacion'
  and not exists (
    select 1 from public.product_categories pc
    where pc.id = p.category_id and pc.slug like 'preparacion-%' and pc.site_id is null
  );
*/

commit;
