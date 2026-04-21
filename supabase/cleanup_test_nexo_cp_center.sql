begin;

create temporary table tmp_test_nexo_cp_products on commit drop as
select id
from public.products
where sku like 'TEST-NEXO-CP-%'
   or name like 'TEST NEXO CP %';

create temporary table tmp_test_nexo_cp_requests on commit drop as
select distinct r.id
from public.restock_requests r
join public.restock_request_items rri
  on rri.request_id = r.id
where rri.product_id in (select id from tmp_test_nexo_cp_products);

create temporary table tmp_test_nexo_cp_entries on commit drop as
select distinct ie.id
from public.inventory_entries ie
left join public.inventory_entry_items iei
  on iei.entry_id = ie.id
where iei.product_id in (select id from tmp_test_nexo_cp_products)
   or ie.notes ilike 'TEST NEXO CP%'
   or ie.supplier_name ilike 'TEST NEXO CP%';

create temporary table tmp_test_nexo_cp_transfers on commit drop as
select distinct it.id
from public.inventory_transfers it
left join public.inventory_transfer_items iti
  on iti.transfer_id = it.id
where iti.product_id in (select id from tmp_test_nexo_cp_products)
   or it.notes ilike 'TEST NEXO CP%';

delete from public.inventory_movements
where product_id in (select id from tmp_test_nexo_cp_products)
   or related_restock_request_id in (select id from tmp_test_nexo_cp_requests)
   or note ilike 'TEST NEXO CP%';

delete from public.inventory_entry_items
where product_id in (select id from tmp_test_nexo_cp_products)
   or entry_id in (select id from tmp_test_nexo_cp_entries);

delete from public.inventory_entries
where id in (select id from tmp_test_nexo_cp_entries)
   or supplier_name ilike 'TEST NEXO CP%';

delete from public.inventory_transfer_items
where product_id in (select id from tmp_test_nexo_cp_products)
   or transfer_id in (select id from tmp_test_nexo_cp_transfers);

delete from public.inventory_transfers
where id in (select id from tmp_test_nexo_cp_transfers);

delete from public.restock_request_items
where request_id in (select id from tmp_test_nexo_cp_requests)
   or product_id in (select id from tmp_test_nexo_cp_products);

delete from public.restock_requests
where id in (select id from tmp_test_nexo_cp_requests);

delete from public.inventory_stock_by_location
where product_id in (select id from tmp_test_nexo_cp_products);

delete from public.inventory_stock_by_site
where product_id in (select id from tmp_test_nexo_cp_products);

delete from public.product_site_settings
where product_id in (select id from tmp_test_nexo_cp_products);

delete from public.product_cost_events
where product_id in (select id from tmp_test_nexo_cp_products);

delete from public.products
where id in (select id from tmp_test_nexo_cp_products);

delete from public.product_categories
where slug in ('test-nexo-cp-inventario', 'test-nexo-cp-root');

commit;

