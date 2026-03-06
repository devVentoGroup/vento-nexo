-- NEXO: Link inventory entries to suppliers

begin;

alter table public.inventory_entries
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

create index if not exists idx_inventory_entries_supplier
  on public.inventory_entries(supplier_id);

commit;
