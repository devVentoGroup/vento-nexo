begin;

create temporary table tmp_sbx_products on commit drop as
select id
from public.products
where sku like 'SBXV1-%'
   or name like 'SANDBOX V1 %';

create temporary table tmp_sbx_requests on commit drop as
select distinct r.id
from public.restock_requests r
join public.restock_request_items rri
  on rri.request_id = r.id
where rri.product_id in (select id from tmp_sbx_products);

create temporary table tmp_sbx_entries on commit drop as
select distinct ie.id
from public.inventory_entries ie
join public.inventory_entry_items iei
  on iei.entry_id = ie.id
where iei.product_id in (select id from tmp_sbx_products)
   or ie.notes ilike 'SANDBOX V1%'
   or ie.supplier_name ilike 'SANDBOX V1%';

create temporary table tmp_sbx_transfers on commit drop as
select distinct it.id
from public.inventory_transfers it
left join public.inventory_transfer_items iti
  on iti.transfer_id = it.id
where iti.product_id in (select id from tmp_sbx_products)
   or exists (
     select 1
     from public.inventory_locations loc
     where loc.id in (it.from_loc_id, it.to_loc_id)
       and loc.code like 'LOC-CP-SBX-%'
   );

delete from public.inventory_movements
where product_id in (select id from tmp_sbx_products)
   or related_restock_request_id in (select id from tmp_sbx_requests)
   or note ilike 'SANDBOX V1%';

delete from public.inventory_entry_items
where product_id in (select id from tmp_sbx_products)
   or entry_id in (select id from tmp_sbx_entries);

delete from public.inventory_entries
where id in (select id from tmp_sbx_entries)
   or notes ilike 'SANDBOX V1%'
   or supplier_name ilike 'SANDBOX V1%';

delete from public.inventory_transfer_items
where product_id in (select id from tmp_sbx_products)
   or transfer_id in (select id from tmp_sbx_transfers);

delete from public.inventory_transfers
where id in (select id from tmp_sbx_transfers)
   or notes ilike 'SANDBOX V1%';

delete from public.restock_request_items
where request_id in (select id from tmp_sbx_requests)
   or product_id in (select id from tmp_sbx_products);

delete from public.restock_requests
where id in (select id from tmp_sbx_requests)
   or notes ilike 'SANDBOX V1%';

delete from public.inventory_stock_by_location
where product_id in (select id from tmp_sbx_products)
   or location_id in (
     select id
     from public.inventory_locations
     where code like 'LOC-CP-SBX-%'
   );

delete from public.inventory_stock_by_site
where product_id in (select id from tmp_sbx_products);

delete from public.product_site_settings
where product_id in (select id from tmp_sbx_products);

delete from public.product_cost_events
where product_id in (select id from tmp_sbx_products);

delete from public.inventory_locations
where code like 'LOC-CP-SBX-%';

delete from public.products
where id in (select id from tmp_sbx_products);

delete from public.product_categories
where slug in ('sbx-v1-insumos', 'sbx-v1-preparaciones', 'sbx-v1-venta', 'sbx-v1-root');

commit;
