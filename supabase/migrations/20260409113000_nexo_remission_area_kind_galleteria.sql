-- NEXO v2: agregar área operativa "Galletería" para flujos de remisión.
-- Se crea/normaliza el catálogo de area_kinds y se habilita para remisiones.

alter table if exists public.area_kinds
  add column if not exists use_for_remission boolean not null default false;

insert into public.area_kinds (code, name, description, is_active)
values (
  'galleteria',
  'Galletería',
  'Área operativa para producción y alistamiento de galletería.',
  true
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  updated_at = now();

update public.area_kinds
set use_for_remission = true
where code = 'galleteria';

