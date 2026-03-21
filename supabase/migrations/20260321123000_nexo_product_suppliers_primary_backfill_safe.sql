begin;

-- Guardrail no destructivo:
-- 1) Normaliza nulos en is_primary.
-- 2) Si un producto tiene proveedores pero ninguno marcado como primario,
--    marca exactamente uno (el mas reciente) como primario.

update public.product_suppliers
set is_primary = false
where is_primary is null;

with supplier_rank as (
  select
    ps.id,
    ps.product_id,
    row_number() over (
      partition by ps.product_id
      order by coalesce(ps.updated_at, ps.created_at, now()) desc, ps.id
    ) as rn,
    max(case when ps.is_primary then 1 else 0 end) over (
      partition by ps.product_id
    ) as has_primary
  from public.product_suppliers ps
)
update public.product_suppliers ps
set is_primary = true
from supplier_rank sr
where ps.id = sr.id
  and sr.has_primary = 0
  and sr.rn = 1;

create index if not exists idx_product_suppliers_product_primary
  on public.product_suppliers(product_id, is_primary);

commit;
