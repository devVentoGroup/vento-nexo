begin;

-- Limpieza operativa de pruebas (V2)
-- Mantener intacto: products, product_*, suppliers, recipe_* (ficha maestra y recetas)

-- 1) Hijas / detalle
delete from public.inventory_entry_items;
delete from public.inventory_transfer_items;
delete from public.inventory_lpn_items;
delete from public.restock_request_items;
delete from public.purchase_order_items;
delete from public.procurement_reception_items;
delete from public.production_request_items;

-- 1b) Tabla opcional segun rama de schema
DO $$
BEGIN
  IF to_regclass('public.production_batch_consumptions') IS NOT NULL THEN
    EXECUTE 'delete from public.production_batch_consumptions';
  END IF;
END $$;

-- 2) Movimientos y stock
delete from public.inventory_movements;
delete from public.inventory_stock_by_location;
delete from public.inventory_stock_by_site;
delete from public.inventory_entries;
delete from public.inventory_transfers;
delete from public.inventory_lpns;

-- 3) Ordenes / solicitudes operativas
delete from public.procurement_receptions;
delete from public.purchase_orders;
delete from public.restock_requests;
delete from public.production_requests;
delete from public.production_batches;

commit;
