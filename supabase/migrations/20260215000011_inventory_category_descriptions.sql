begin;

alter table if exists public.product_categories
  add column if not exists description text;

comment on column public.product_categories.description is
  'Descripcion operativa de referencia para clasificar items. Opcional para categorias de venta.';

with candidates as (
  select
    id,
    trim(name) as clean_name,
    coalesce(applies_to_kinds, array[]::text[]) as kinds,
    nullif(trim(description), '') as clean_description
  from public.product_categories
), generated as (
  select
    id,
    case
      when clean_description is not null then clean_description
      when clean_name is null or clean_name = '' then null
      when kinds @> array['venta']::text[] and kinds <@ array['venta']::text[] then null
      else
        concat(
          'Categoria orientativa para ',
          clean_name,
          '. Puede incluir ',
          case
            when nullif(trim(both '; ' from concat(
              case when kinds @> array['insumo']::text[] then 'materias primas, insumos de uso diario y consumibles; ' else '' end,
              case when kinds @> array['preparacion']::text[] then 'bases, premezclas, salsas y mise en place; ' else '' end,
              case when kinds @> array['equipo']::text[] then 'utensilios, herramientas y activos operativos; ' else '' end
            )), '') is not null
              then trim(both '; ' from concat(
                case when kinds @> array['insumo']::text[] then 'materias primas, insumos de uso diario y consumibles; ' else '' end,
                case when kinds @> array['preparacion']::text[] then 'bases, premezclas, salsas y mise en place; ' else '' end,
                case when kinds @> array['equipo']::text[] then 'utensilios, herramientas y activos operativos; ' else '' end
              ))
            else 'insumos o preparaciones relacionadas con la operacion'
          end,
          '.'
        )
    end as suggested_description
  from candidates
)
update public.product_categories pc
set description = generated.suggested_description
from generated
where pc.id = generated.id
  and nullif(trim(pc.description), '') is null
  and generated.suggested_description is not null;

commit;
