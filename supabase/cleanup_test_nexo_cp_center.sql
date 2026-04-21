begin;

delete from public.inventory_movements
where product_id in (
  select id
  from public.products
  where sku like 'TEST-NEXO-CP-%'
     or name like 'TEST NEXO CP %'
)
   or related_restock_request_id in (
     select distinct r.id
     from public.restock_requests r
     join public.restock_request_items rri
       on rri.request_id = r.id
     where rri.product_id in (
       select id
       from public.products
       where sku like 'TEST-NEXO-CP-%'
          or name like 'TEST NEXO CP %'
     )
   )
   or note ilike 'TEST NEXO CP%';

delete from public.inventory_entry_items
where product_id in (
  select id
  from public.products
  where sku like 'TEST-NEXO-CP-%'
     or name like 'TEST NEXO CP %'
)
   or entry_id in (
     select distinct ie.id
     from public.inventory_entries ie
     left join public.inventory_entry_items iei
       on iei.entry_id = ie.id
     where iei.product_id in (
       select id
       from public.products
       where sku like 'TEST-NEXO-CP-%'
          or name like 'TEST NEXO CP %'
     )
        or ie.notes ilike 'TEST NEXO CP%'
        or ie.supplier_name ilike 'TEST NEXO CP%'
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
    where sku like 'TEST-NEXO-CP-%'
       or name like 'TEST NEXO CP %'
  )
     or ie.notes ilike 'TEST NEXO CP%'
     or ie.supplier_name ilike 'TEST NEXO CP%'
)
   or supplier_name ilike 'TEST NEXO CP%';

delete from public.inventory_transfer_items
where product_id in (
  select id
  from public.products
  where sku like 'TEST-NEXO-CP-%'
     or name like 'TEST NEXO CP %'
)
   or transfer_id in (
     select distinct it.id
     from public.inventory_transfers it
     left join public.inventory_transfer_items iti
       on iti.transfer_id = it.id
     where iti.product_id in (
       select id
       from public.products
       where sku like 'TEST-NEXO-CP-%'
          or name like 'TEST NEXO CP %'
     )
        or it.notes ilike 'TEST NEXO CP%'
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
    where sku like 'TEST-NEXO-CP-%'
       or name like 'TEST NEXO CP %'
  )
     or it.notes ilike 'TEST NEXO CP%'
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
    where sku like 'TEST-NEXO-CP-%'
       or name like 'TEST NEXO CP %'
  )
)
   or product_id in (
     select id
     from public.products
     where sku like 'TEST-NEXO-CP-%'
        or name like 'TEST NEXO CP %'
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
    where sku like 'TEST-NEXO-CP-%'
       or name like 'TEST NEXO CP %'
  )
);

delete from public.inventory_stock_by_location
where product_id in (
  select id
  from public.products
  where sku like 'TEST-NEXO-CP-%'
     or name like 'TEST NEXO CP %'
);

delete from public.inventory_stock_by_site
where product_id in (
  select id
  from public.products
  where sku like 'TEST-NEXO-CP-%'
     or name like 'TEST NEXO CP %'
);

delete from public.product_site_settings
where product_id in (
  select id
  from public.products
  where sku like 'TEST-NEXO-CP-%'
     or name like 'TEST NEXO CP %'
);

delete from public.product_cost_events
where product_id in (
  select id
  from public.products
  where sku like 'TEST-NEXO-CP-%'
     or name like 'TEST NEXO CP %'
);

delete from public.products
where sku like 'TEST-NEXO-CP-%'
   or name like 'TEST NEXO CP %';

delete from public.product_categories
where slug in ('test-nexo-cp-inventario', 'test-nexo-cp-root');

commit;
