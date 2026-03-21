-- LIMPIEZA TOTAL DE PRUEBAS (NEXO)
-- Objetivo:
-- 1) Eliminar todas las remisiones actuales (solo pruebas según confirmación).
-- 2) Eliminar productos sandbox (SBXV1 / SANDBOX V1) y todo lo relacionado.
--
-- Recomendado:
-- - Ejecutar primero en horario de baja actividad.
-- - Correr en una sola transacción.
-- - Revisar el bloque PREVIEW antes del bloque DELETE.

begin;

-- =========================
-- PREVIEW (conteos)
-- =========================
create temporary table tmp_sbx_products on commit drop as
select p.id
from public.products p
where p.sku like 'SBXV1-%'
   or p.name ilike 'SANDBOX V1 %';

create temporary table tmp_all_restock_requests on commit drop as
select rr.id
from public.restock_requests rr;

select 'sandbox_products' as bucket, count(*)::bigint as rows from tmp_sbx_products
union all
select 'all_restock_requests', count(*)::bigint from tmp_all_restock_requests
union all
select 'restock_request_items_by_all_requests', count(*)::bigint
from public.restock_request_items rri
where rri.request_id in (select id from tmp_all_restock_requests)
union all
select 'inventory_movements_by_restock', count(*)::bigint
from public.inventory_movements im
where im.related_restock_request_id in (select id from tmp_all_restock_requests)
union all
select 'inventory_movements_by_sandbox_product', count(*)::bigint
from public.inventory_movements im
where im.product_id in (select id from tmp_sbx_products)
union all
select 'inventory_stock_by_site_sandbox', count(*)::bigint
from public.inventory_stock_by_site iss
where iss.product_id in (select id from tmp_sbx_products)
union all
select 'inventory_stock_by_location_sandbox', count(*)::bigint
from public.inventory_stock_by_location isl
where isl.product_id in (select id from tmp_sbx_products)
union all
select 'product_site_settings_sandbox', count(*)::bigint
from public.product_site_settings pss
where pss.product_id in (select id from tmp_sbx_products)
union all
select 'product_suppliers_sandbox', count(*)::bigint
from public.product_suppliers ps
where ps.product_id in (select id from tmp_sbx_products)
union all
select 'product_uom_profiles_sandbox', count(*)::bigint
from public.product_uom_profiles pup
where pup.product_id in (select id from tmp_sbx_products)
union all
select 'products_sandbox', count(*)::bigint
from public.products p
where p.id in (select id from tmp_sbx_products);

-- =========================
-- DELETE remisiones (todas)
-- =========================
delete from public.inventory_movements im
where im.related_restock_request_id in (select id from tmp_all_restock_requests);

delete from public.restock_request_items rri
where rri.request_id in (select id from tmp_all_restock_requests);

delete from public.restock_requests rr
where rr.id in (select id from tmp_all_restock_requests);

-- =========================
-- DELETE sandbox (productos + derivados)
-- =========================
-- Trazas de inventario vinculadas a productos sandbox
delete from public.inventory_movements im
where im.product_id in (select id from tmp_sbx_products)
   or im.note ilike 'SANDBOX V1%';

-- Entradas / transferencias sandbox (si existen)
delete from public.inventory_entry_items iei
where iei.product_id in (select id from tmp_sbx_products);

delete from public.inventory_entries ie
where ie.notes ilike 'SANDBOX V1%'
   or ie.supplier_name ilike 'SANDBOX V1%';

delete from public.inventory_transfer_items iti
where iti.product_id in (select id from tmp_sbx_products);

delete from public.inventory_transfers it
where it.notes ilike 'SANDBOX V1%';

-- Stock agregado / por ubicación
delete from public.inventory_stock_by_location isl
where isl.product_id in (select id from tmp_sbx_products)
   or isl.location_id in (
     select loc.id
     from public.inventory_locations loc
     where loc.code like 'LOC-CP-SBX-%'
   );

delete from public.inventory_stock_by_site iss
where iss.product_id in (select id from tmp_sbx_products);

-- Configuración de producto sandbox
delete from public.product_site_settings pss
where pss.product_id in (select id from tmp_sbx_products);

delete from public.product_cost_events pce
where pce.product_id in (select id from tmp_sbx_products);

delete from public.product_uom_profiles pup
where pup.product_id in (select id from tmp_sbx_products);

delete from public.product_inventory_profiles pip
where pip.product_id in (select id from tmp_sbx_products);

delete from public.product_suppliers ps
where ps.product_id in (select id from tmp_sbx_products);

delete from public.recipes r
where r.product_id in (select id from tmp_sbx_products)
   or r.ingredient_product_id in (select id from tmp_sbx_products);

-- Ubicaciones sandbox
delete from public.inventory_locations loc
where loc.code like 'LOC-CP-SBX-%';

-- Productos sandbox
delete from public.products p
where p.id in (select id from tmp_sbx_products);

-- Categorías sandbox
delete from public.product_categories pc
where pc.slug in ('sbx-v1-insumos', 'sbx-v1-preparaciones', 'sbx-v1-venta', 'sbx-v1-root');

commit;

-- Si quieres validar después:
-- 1) Corre docs/DIAGNOSTICO-PROVEEDORES-REMISIONES.sql
-- 2) Verifica que no queden SKUs SBXV1-% ni notas SANDBOX V1%
