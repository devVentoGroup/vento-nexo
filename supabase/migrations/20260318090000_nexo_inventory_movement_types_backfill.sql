begin;

insert into public.inventory_movement_types (code, name, description, affects_stock)
values
  ('receipt_in', 'Entrada', 'Entrada de inventario por recepcion', 1),
  ('transfer_internal', 'Traslado interno', 'Movimiento interno entre LOCs', 0),
  ('transfer_out', 'Salida por remision', 'Salida de inventario por remision entre sedes', -1),
  ('transfer_in', 'Entrada por remision', 'Entrada de inventario por remision entre sedes', 1),
  ('consumption', 'Retiro / consumo', 'Consumo o retiro manual desde un LOC o sede', -1),
  ('adjustment', 'Ajuste', 'Correccion manual de inventario', 1),
  ('count', 'Conteo', 'Conteo ciclico de inventario', 1),
  ('initial_count', 'Conteo inicial', 'Carga inicial de inventario fisico', 1)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  affects_stock = excluded.affects_stock;

commit;
