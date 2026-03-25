begin;

-- Quitar stack de IA en NEXO (inventario)
-- Mantiene columnas fiscales de inventory_entry_items, porque ya sirven en flujo normal.

-- Storage (bucket IA)
drop policy if exists "nexo_ai_documents_read" on storage.objects;
drop policy if exists "nexo_ai_documents_insert" on storage.objects;
drop policy if exists "nexo_ai_documents_update" on storage.objects;
drop policy if exists "nexo_ai_documents_delete" on storage.objects;

-- Nota: el borrado fisico del bucket/objetos se hace via Storage API (no por SQL directo).
-- Aqui solo quitamos politicas para dejarlo inactivo desde base de datos.

-- Policies public (si quedaron)
drop policy if exists inventory_ai_ingestions_select_permission on public.inventory_ai_ingestions;
drop policy if exists inventory_ai_ingestions_insert_permission on public.inventory_ai_ingestions;
drop policy if exists inventory_ai_ingestions_update_permission on public.inventory_ai_ingestions;
drop policy if exists inventory_ai_ingestions_delete_permission on public.inventory_ai_ingestions;

drop policy if exists inventory_ai_ingestion_items_select_permission on public.inventory_ai_ingestion_items;
drop policy if exists inventory_ai_ingestion_items_insert_permission on public.inventory_ai_ingestion_items;
drop policy if exists inventory_ai_ingestion_items_update_permission on public.inventory_ai_ingestion_items;
drop policy if exists inventory_ai_ingestion_items_delete_permission on public.inventory_ai_ingestion_items;

drop policy if exists inventory_ai_ingestion_matches_select_permission on public.inventory_ai_ingestion_matches;
drop policy if exists inventory_ai_ingestion_matches_insert_permission on public.inventory_ai_ingestion_matches;

drop policy if exists inventory_ai_ingestion_actions_select_permission on public.inventory_ai_ingestion_actions;
drop policy if exists inventory_ai_ingestion_actions_insert_permission on public.inventory_ai_ingestion_actions;

drop policy if exists inventory_supplier_aliases_select_permission on public.inventory_supplier_aliases;
drop policy if exists inventory_supplier_aliases_insert_permission on public.inventory_supplier_aliases;
drop policy if exists inventory_supplier_aliases_update_permission on public.inventory_supplier_aliases;
drop policy if exists inventory_supplier_aliases_delete_permission on public.inventory_supplier_aliases;

-- Tablas IA

drop table if exists public.inventory_ai_ingestion_actions;
drop table if exists public.inventory_ai_ingestion_matches;
drop table if exists public.inventory_ai_ingestion_items;
drop table if exists public.inventory_ai_ingestions;
drop table if exists public.inventory_supplier_aliases;

commit;
