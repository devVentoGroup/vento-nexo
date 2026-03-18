begin;

drop policy if exists "restock_request_items_delete_permission" on public.restock_request_items;
create policy "restock_request_items_delete_permission" on public.restock_request_items
  for delete to authenticated
  using (
    exists (
      select 1
      from public.restock_requests r
      where r.id = restock_request_items.request_id
        and (
          public.has_permission('nexo.inventory.remissions.cancel')
          or (r.created_by = auth.uid() and r.status in ('pending', 'preparing'))
        )
    )
  );

commit;
