alter table if exists public.restock_request_items
  add column if not exists source_location_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restock_request_items_source_location_id_fkey'
  ) then
    alter table public.restock_request_items
      add constraint restock_request_items_source_location_id_fkey
      foreign key (source_location_id)
      references public.inventory_locations(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_restock_request_items_source_location
  on public.restock_request_items(source_location_id);
