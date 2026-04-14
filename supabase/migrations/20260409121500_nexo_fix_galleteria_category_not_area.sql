-- Corrección solicitada:
-- "Galletería" debe existir como categoría operativa de productos (NO como área de remisión).
-- 1) crea/normaliza la categoría de productos bajo raíz "Venta"
-- 2) desactiva el uso por remisión en area_kinds.galleteria
-- 3) elimina area_kinds.galleteria si no tiene referencias

begin;

-- 1) Categoría operativa de productos: Venta > Galletería
with venta_root as (
  select id
  from public.product_categories
  where lower(trim(name)) = 'venta'
    and parent_id is null
    and site_id is null
    and coalesce(nullif(trim(domain), ''), '') = ''
  order by id
  limit 1
)
insert into public.product_categories (
  id,
  name,
  slug,
  parent_id,
  site_id,
  domain,
  description,
  display_order,
  is_active,
  applies_to_kinds
)
select
  gen_random_uuid(),
  'Galletería',
  'venta-galleteria',
  vr.id,
  null,
  null,
  'Categoría operativa para productos de galletería en remisión/abastecimiento.',
  146,
  true,
  array['venta']::text[]
from venta_root vr
where not exists (
  select 1
  from public.product_categories pc
  where pc.parent_id = vr.id
    and pc.site_id is null
    and coalesce(nullif(trim(pc.domain), ''), '') = ''
    and (
      lower(trim(coalesce(pc.slug, ''))) = 'venta-galleteria'
      or lower(trim(pc.name)) in ('galleteria', 'galletería')
    )
);

with venta_root as (
  select id
  from public.product_categories
  where lower(trim(name)) = 'venta'
    and parent_id is null
    and site_id is null
    and coalesce(nullif(trim(domain), ''), '') = ''
  order by id
  limit 1
)
update public.product_categories pc
set
  name = 'Galletería',
  slug = 'venta-galleteria',
  parent_id = vr.id,
  site_id = null,
  domain = null,
  description = 'Categoría operativa para productos de galletería en remisión/abastecimiento.',
  display_order = 146,
  is_active = true,
  applies_to_kinds = array['venta']::text[],
  updated_at = now()
from venta_root vr
where pc.parent_id = vr.id
  and (
    lower(trim(coalesce(pc.slug, ''))) = 'venta-galleteria'
    or lower(trim(pc.name)) in ('galleteria', 'galletería')
  );

-- 2) No usar "galleteria" como área de remisión (fue un cambio equivocado)
update public.area_kinds
set use_for_remission = false, updated_at = now()
where code = 'galleteria';

-- 3) Intentar borrar el area_kind si no está siendo usado en ninguna tabla relacionada
delete from public.area_kinds ak
where ak.code = 'galleteria'
  and not exists (select 1 from public.areas a where a.kind = ak.code)
  and not exists (select 1 from public.products p where p.production_area_kind = ak.code)
  and not exists (select 1 from public.production_request_items pri where pri.production_area_kind = ak.code)
  and not exists (select 1 from public.restock_request_items rri where rri.production_area_kind = ak.code)
  and not exists (select 1 from public.product_site_settings pss where pss.default_area_kind = ak.code)
  and not exists (select 1 from public.site_area_purpose_rules sapr where sapr.area_kind = ak.code)
  and not exists (select 1 from public.role_permissions rp where rp.scope_area_kind = ak.code)
  and not exists (select 1 from public.employee_permissions ep where ep.scope_area_kind = ak.code);

commit;

