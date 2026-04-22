begin;

delete from public.inventory_movements
where product_id in (
  select id
  from public.products
  where sku like 'TEST-NEXO-OPS-%'
     or name like 'TEST NEXO OPS %'
)
   or related_restock_request_id in (
     select distinct r.id
     from public.restock_requests r
     join public.restock_request_items rri
       on rri.request_id = r.id
     where rri.product_id in (
       select id
       from public.products
       where sku like 'TEST-NEXO-OPS-%'
          or name like 'TEST NEXO OPS %'
     )
   )
   or note ilike 'TEST NEXO OPS%';

delete from public.inventory_entry_items
where product_id in (
  select id
  from public.products
  where sku like 'TEST-NEXO-OPS-%'
     or name like 'TEST NEXO OPS %'
)
   or entry_id in (
     select distinct ie.id
     from public.inventory_entries ie
     left join public.inventory_entry_items iei
       on iei.entry_id = ie.id
     where iei.product_id in (
       select id
       from public.products
       where sku like 'TEST-NEXO-OPS-%'
          or name like 'TEST NEXO OPS %'
     )
        or ie.notes ilike 'TEST NEXO OPS%'
        or ie.supplier_name ilike 'TEST NEXO OPS%'
   );

delete from public.inventory_entries
where id in (
  select distinct ie.id
  from public.inventory_entries ie
  left join public.inventory_entry_items iei
    on iei.entry_id = ie.id
  where iei.product_id in (
    select id
    from public.products
    where sku like 'TEST-NEXO-OPS-%'
       or name like 'TEST NEXO OPS %'
  )
     or ie.notes ilike 'TEST NEXO OPS%'
     or ie.supplier_name ilike 'TEST NEXO OPS%'
)
   or supplier_name ilike 'TEST NEXO OPS%';

delete from public.inventory_transfer_items
where product_id in (
  select id
  from public.products
  where sku like 'TEST-NEXO-OPS-%'
     or name like 'TEST NEXO OPS %'
)
   or transfer_id in (
     select distinct it.id
     from public.inventory_transfers it
     left join public.inventory_transfer_items iti
       on iti.transfer_id = it.id
     where iti.product_id in (
       select id
       from public.products
       where sku like 'TEST-NEXO-OPS-%'
          or name like 'TEST NEXO OPS %'
     )
        or it.notes ilike 'TEST NEXO OPS%'
   );

delete from public.inventory_transfers
where id in (
  select distinct it.id
  from public.inventory_transfers it
  left join public.inventory_transfer_items iti
    on iti.transfer_id = it.id
  where iti.product_id in (
    select id
    from public.products
    where sku like 'TEST-NEXO-OPS-%'
       or name like 'TEST NEXO OPS %'
  )
     or it.notes ilike 'TEST NEXO OPS%'
);

delete from public.restock_request_items
where request_id in (
  select distinct r.id
  from public.restock_requests r
  join public.restock_request_items rri
    on rri.request_id = r.id
  where rri.product_id in (
    select id
    from public.products
    where sku like 'TEST-NEXO-OPS-%'
       or name like 'TEST NEXO OPS %'
  )
)
   or product_id in (
     select id
     from public.products
     where sku like 'TEST-NEXO-OPS-%'
        or name like 'TEST NEXO OPS %'
   );

delete from public.restock_requests
where id in (
  select distinct r.id
  from public.restock_requests r
  join public.restock_request_items rri
    on rri.request_id = r.id
  where rri.product_id in (
    select id
    from public.products
    where sku like 'TEST-NEXO-OPS-%'
       or name like 'TEST NEXO OPS %'
  )
);

delete from public.inventory_stock_by_location
where product_id in (
  select id
  from public.products
  where sku like 'TEST-NEXO-OPS-%'
     or name like 'TEST NEXO OPS %'
);

delete from public.inventory_stock_by_site
where product_id in (
  select id
  from public.products
  where sku like 'TEST-NEXO-OPS-%'
     or name like 'TEST NEXO OPS %'
);

delete from public.product_site_settings
where product_id in (
  select id
  from public.products
  where sku like 'TEST-NEXO-OPS-%'
     or name like 'TEST NEXO OPS %'
);

delete from public.product_suppliers
where product_id in (
  select id
  from public.products
  where sku like 'TEST-NEXO-OPS-%'
     or name like 'TEST NEXO OPS %'
)
   or supplier_id in (
     select id
     from public.suppliers
     where name = 'TEST NEXO OPS Proveedor'
   );

delete from public.product_cost_events
where product_id in (
  select id
  from public.products
  where sku like 'TEST-NEXO-OPS-%'
     or name like 'TEST NEXO OPS %'
);

delete from public.products
where sku like 'TEST-NEXO-OPS-%'
   or name like 'TEST NEXO OPS %';

delete from public.suppliers
where name = 'TEST NEXO OPS Proveedor';

delete from public.product_categories
where slug in ('test-nexo-ops-inventario', 'test-nexo-ops-root');

commit;
