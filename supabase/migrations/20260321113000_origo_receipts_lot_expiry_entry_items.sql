-- ORIGO/NEXO V2: recepciones con trazabilidad operativa de lote y vencimiento.
-- Fuente de verdad: vento-shell.

alter table if exists public.inventory_entry_items
  add column if not exists lot_number text;

alter table if exists public.inventory_entry_items
  add column if not exists expiry_date date;

create index if not exists idx_inventory_entry_items_lot_number
  on public.inventory_entry_items(lot_number);

create index if not exists idx_inventory_entry_items_expiry_date
  on public.inventory_entry_items(expiry_date);

create index if not exists idx_inventory_entry_items_product_lot
  on public.inventory_entry_items(product_id, lot_number);

create index if not exists idx_inventory_entry_items_product_expiry
  on public.inventory_entry_items(product_id, expiry_date);
