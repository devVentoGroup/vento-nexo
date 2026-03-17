-- Carnet laboral: foto del trabajador y serial para pase.
-- employees.photo_url: URL de la foto oficial (storage o externa).
-- employee_wallet_cards.serial_number: prefijo emp- para no colisionar con loyalty.

alter table public.employees
  add column if not exists photo_url text;

comment on column public.employees.photo_url is 'URL de la foto oficial del trabajador para carnet laboral.';

-- Asegurar que los registros de employee_wallet_cards usen serial emp-{employee_id}
update public.employee_wallet_cards
set serial_number = 'emp-' || employee_id::text
where serial_number is null or serial_number <> 'emp-' || employee_id::text;
