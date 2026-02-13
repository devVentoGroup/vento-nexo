create table if not exists public.inventory_units (
  code text primary key,
  name text not null,
  family text not null check (family in ('volume', 'mass', 'count')),
  factor_to_base numeric not null check (factor_to_base > 0),
  symbol text,
  display_decimals integer not null default 2 check (display_decimals between 0 and 6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.inventory_units is
  'Catalogo canonic de unidades de inventario para conversion entre unidades de la misma familia.';

create table if not exists public.inventory_unit_aliases (
  alias text primary key,
  unit_code text not null references public.inventory_units(code) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.inventory_unit_aliases is
  'Aliases para mapear variantes de captura (ej. litro, lts, unidad) hacia una unidad canonica.';

create index if not exists idx_inventory_units_family
  on public.inventory_units(family, is_active);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_inventory_units_updated_at'
  ) then
    create trigger trg_inventory_units_updated_at
      before update on public.inventory_units
      for each row execute function public.update_updated_at();
  end if;
end
$$;

insert into public.inventory_units (code, name, family, factor_to_base, symbol, display_decimals, is_active)
values
  ('ml', 'Mililitro', 'volume', 1, 'ml', 2, true),
  ('l', 'Litro', 'volume', 1000, 'L', 3, true),
  ('g', 'Gramo', 'mass', 1, 'g', 2, true),
  ('kg', 'Kilogramo', 'mass', 1000, 'kg', 3, true),
  ('un', 'Unidad', 'count', 1, 'un', 0, true),
  ('dz', 'Docena', 'count', 12, 'dz', 2, true)
on conflict (code) do update set
  name = excluded.name,
  family = excluded.family,
  factor_to_base = excluded.factor_to_base,
  symbol = excluded.symbol,
  display_decimals = excluded.display_decimals,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.inventory_unit_aliases (alias, unit_code)
values
  ('mililitro', 'ml'),
  ('mililitros', 'ml'),
  ('cc', 'ml'),
  ('litro', 'l'),
  ('litros', 'l'),
  ('lt', 'l'),
  ('lts', 'l'),
  ('gramo', 'g'),
  ('gramos', 'g'),
  ('kilogramo', 'kg'),
  ('kilogramos', 'kg'),
  ('unidad', 'un'),
  ('unidades', 'un'),
  ('pza', 'un'),
  ('pieza', 'un'),
  ('docena', 'dz')
on conflict (alias) do update set
  unit_code = excluded.unit_code;
