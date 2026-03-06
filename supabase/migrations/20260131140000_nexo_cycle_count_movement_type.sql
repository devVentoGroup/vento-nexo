-- NEXO: Movimiento de conteo cíclico (count)

begin;

insert into public.inventory_movement_types (code, name, description, affects_stock)
values ('count', 'Conteo', 'Conteo cíclico de inventario', 1)
on conflict (code) do nothing;

commit;
